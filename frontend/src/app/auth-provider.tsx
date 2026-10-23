"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchWithTimeout, setUnauthorizedListener } from "./api-client";
import { needsRefresh, REFRESH_RETRY_MS, refreshDelayMs } from "./session-timing";

const API_BASE = "/api/v1";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "Customer" | "Reception" | "Kitchen Staff" | "Manager" | "Administrator";
  restaurantId: string | null;
}

interface SessionResponse {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: AuthUser;
}

interface CodeResponse {
  message: string;
  developmentCode?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<CodeResponse>;
  requestOtp: (email: string) => Promise<CodeResponse>;
  verifyOtp: (email: string, code: string, password: string) => Promise<void>;
  /** Renews the access token now; resolves to the new token, or null when signed out. */
  refreshSession: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

type RefreshOutcome =
  | { kind: "renewed"; session: SessionResponse }
  | { kind: "expired" }
  | { kind: "unavailable" };

let inflightRefresh: Promise<RefreshOutcome> | null = null;

/**
 * Single-flight refresh. The backend rotates the refresh cookie and treats a reused
 * cookie as theft, so concurrent callers must share one request instead of each
 * sending the same cookie.
 */
export function requestSessionRefresh(): Promise<RefreshOutcome> {
  if (!inflightRefresh) {
    inflightRefresh = (async (): Promise<RefreshOutcome> => {
      try {
        const response = await fetchWithTimeout(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
        });
        if (response.status === 401 || response.status === 403) return { kind: "expired" };
        if (!response.ok) return { kind: "unavailable" };
        const refreshed = (await response.json()) as SessionResponse;
        return refreshed?.accessToken && refreshed.user
          ? { kind: "renewed", session: refreshed }
          : { kind: "expired" };
      } catch {
        return { kind: "unavailable" };
      } finally {
        inflightRefresh = null;
      }
    })();
  }
  return inflightRefresh;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function parseResponse<T>(response: Response): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const errorMessage =
      typeof payload === "object" && payload !== null && "error" in payload
        ? (payload.error as { message?: string } | undefined)?.message
        : undefined;
    throw new Error(errorMessage ?? "We couldn't complete that request. Please try again.");
  }

  return payload as T;
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [session, setSessionState] = useState<SessionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const expiresAtRef = useRef(0);

  const setSession = useCallback((next: SessionResponse | null) => {
    expiresAtRef.current = next ? Date.now() + next.expiresIn * 1_000 : 0;
    setSessionState(next);
  }, []);

  const refreshSession = useCallback(async (): Promise<string | null> => {
    const outcome = await requestSessionRefresh();
    if (outcome.kind === "renewed") {
      setSession(outcome.session);
      return outcome.session.accessToken;
    }
    if (outcome.kind === "expired") setSession(null);
    return null;
  }, [setSession]);

  // An authenticated request that comes back 401 (for example after the device
  // slept past the token's expiry) renews the token once; screens re-fetch when
  // the new token arrives.
  useEffect(() => {
    let lastAttempt = 0;
    return setUnauthorizedListener(() => {
      const now = Date.now();
      if (now - lastAttempt < 10_000) return;
      lastAttempt = now;
      void refreshSession();
    });
  }, [refreshSession]);

  useEffect(() => {
    void requestSessionRefresh()
      .then((outcome) => {
        // A missing backend or expired session is a normal signed-out state.
        if (outcome.kind === "renewed") setSession(outcome.session);
      })
      .finally(() => setIsLoading(false));
  }, [setSession]);

  // Renew the access token shortly before it expires so long dashboard sessions
  // keep working; a transient failure is retried, an expired session signs out.
  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const schedule = (delay: number) => {
      timer = setTimeout(async () => {
        const outcome = await requestSessionRefresh();
        if (cancelled) return;
        if (outcome.kind === "renewed") setSession(outcome.session);
        else if (outcome.kind === "expired") setSession(null);
        else schedule(REFRESH_RETRY_MS);
      }, delay);
    };
    schedule(refreshDelayMs(expiresAtRef.current, Date.now()));

    // Timers are paused while a laptop sleeps or a tab is frozen; catch up on return.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (needsRefresh(expiresAtRef.current, Date.now())) void refreshSession();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [session, setSession, refreshSession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const response = await fetchWithTimeout(`${API_BASE}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const authenticated = await parseResponse<SessionResponse>(response);
      setSession(authenticated);
    },
    [setSession],
  );

  const signInWithGoogle = useCallback(
    async (idToken: string) => {
      const response = await fetchWithTimeout(`${API_BASE}/auth/google`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const authenticated = await parseResponse<SessionResponse>(response);
      setSession(authenticated);
    },
    [setSession],
  );

  const register = useCallback(async (name: string, email: string, password: string) => {
    const response = await fetchWithTimeout(`${API_BASE}/auth/register`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    return parseResponse<CodeResponse>(response);
  }, []);

  const requestOtp = useCallback(async (email: string) => {
    const response = await fetchWithTimeout(`${API_BASE}/auth/otp/request`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return parseResponse<CodeResponse>(response);
  }, []);

  const verifyOtp = useCallback(
    async (email: string, code: string, password: string) => {
      const response = await fetchWithTimeout(`${API_BASE}/auth/otp/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code, password }),
      });
      const authenticated = await parseResponse<SessionResponse>(response);
      setSession(authenticated);
    },
    [setSession],
  );

  const signOut = useCallback(async () => {
    try {
      await fetchWithTimeout(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
      });
    } catch {
      // Clear the in-memory session even when the API is unreachable.
    } finally {
      setSession(null);
    }
  }, [setSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      accessToken: session?.accessToken ?? null,
      isLoading,
      signIn,
      signInWithGoogle,
      register,
      requestOtp,
      verifyOtp,
      refreshSession,
      signOut,
    }),
    [
      session,
      isLoading,
      signIn,
      signInWithGoogle,
      register,
      requestOtp,
      verifyOtp,
      refreshSession,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
