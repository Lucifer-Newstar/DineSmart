"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchWithTimeout } from "./api-client";

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
  verifyOtp: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
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
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const restoreSession = useCallback(async () => {
    try {
      const response = await fetchWithTimeout(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
      });
      if (!response.ok) return;
      const refreshed = (await response.json()) as SessionResponse;
      if (refreshed?.accessToken && refreshed.user) setSession(refreshed);
    } catch {
      // A missing backend or expired session is a normal signed-out state.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await fetchWithTimeout(`${API_BASE}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const authenticated = await parseResponse<SessionResponse>(response);
    setSession(authenticated);
  }, []);

  const signInWithGoogle = useCallback(async (idToken: string) => {
    const response = await fetchWithTimeout(`${API_BASE}/auth/google`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const authenticated = await parseResponse<SessionResponse>(response);
    setSession(authenticated);
  }, []);

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

  const verifyOtp = useCallback(async (email: string, code: string) => {
    const response = await fetchWithTimeout(`${API_BASE}/auth/otp/verify`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const authenticated = await parseResponse<SessionResponse>(response);
    setSession(authenticated);
  }, []);

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
  }, []);

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
      signOut,
    }),
    [session, isLoading, signIn, signInWithGoogle, register, requestOtp, verifyOtp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
