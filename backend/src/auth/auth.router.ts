import cookieParser from "cookie-parser";
import { type Request, type Response, Router } from "express";
import rateLimit from "express-rate-limit";
import { requireTrustedOrigin } from "../http/origin-check.js";
import {
  AuthConfigurationError,
  AuthError,
  type AuthPrincipal,
  type AuthService,
  type AuthSession,
} from "./auth.service.js";
import type { EmailOtpService } from "./email-otp.service.js";
import type { PasswordResetService } from "./password-reset.service.js";

export const REFRESH_COOKIE_NAME = "andhrimnir_refresh";
const AUTH_COOKIE_PATH = "/api/v1/auth";
const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1_000;

export interface AuthRouterOptions {
  createService: () => Promise<AuthService>;
  createEmailOtpService?: () => Promise<EmailOtpService>;
  createPasswordResetService?: () => Promise<PasswordResetService>;
  googleSession?: (idToken: string) => Promise<AuthSession>;
  webOrigin: string;
  nodeEnvironment: string;
  /**
   * When false the per-IP auth rate limits are skipped. createApp only allows
   * this for NODE_ENV=test with E2E_DISABLE_RATE_LIMITS=1, because the browser
   * suite signs every role in many times from one loopback address.
   */
  rateLimits?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function handleAuthError(error: unknown, response: Response): void {
  if (error instanceof AuthError) {
    if (error.retryAfterSeconds !== undefined) {
      response.setHeader("Retry-After", String(error.retryAfterSeconds));
    }
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: error.retryAfterSeconds }),
      },
    });
    return;
  }

  if (error instanceof AuthConfigurationError) {
    response.status(503).json({
      error: { code: "auth_unavailable", message: "Authentication is temporarily unavailable." },
    });
    return;
  }

  // Deliberately avoid logging driver errors or request details that could contain secrets.
  response.status(503).json({
    error: { code: "auth_unavailable", message: "Authentication is temporarily unavailable." },
  });
}

function setRefreshCookie(response: Response, session: AuthSession, nodeEnvironment: string): void {
  const maxAge = Math.max(0, session.refreshTokenExpiresAt.getTime() - Date.now());
  response.cookie(REFRESH_COOKIE_NAME, session.refreshToken, {
    httpOnly: true,
    secure: nodeEnvironment === "production",
    sameSite: nodeEnvironment === "production" ? "none" : "lax",
    path: AUTH_COOKIE_PATH,
    maxAge,
  });
}

function clearRefreshCookie(response: Response, nodeEnvironment: string): void {
  response.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: nodeEnvironment === "production",
    sameSite: nodeEnvironment === "production" ? "none" : "lax",
    path: AUTH_COOKIE_PATH,
  });
}

/** Best effort: a failed label never fails the sign-in. */
async function labelDevice(service: AuthService, session: AuthSession, request: Request) {
  try {
    await service.recordSessionDevice(session, request.get("user-agent"));
  } catch {
    // The session works without a label; the devices list shows "Unknown device".
  }
}

/** The signed-in user behind a bearer token, or null after answering 401. */
async function bearerPrincipal(
  service: AuthService,
  request: Request,
  response: Response,
): Promise<AuthPrincipal | null> {
  const header = request.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(header);
  if (!match?.[1]) {
    response.status(401).json({
      error: { code: "missing_access_token", message: "Authentication is required." },
    });
    return null;
  }
  try {
    return await service.verifyAccessToken(match[1]);
  } catch {
    response.status(401).json({
      error: { code: "invalid_access_token", message: "A valid access token is required." },
    });
    return null;
  }
}

function sendSession(response: Response, session: AuthSession, nodeEnvironment: string): void {
  setRefreshCookie(response, session, nodeEnvironment);
  response.status(200).json({
    accessToken: session.accessToken,
    tokenType: "Bearer",
    expiresIn: Math.ceil((session.accessTokenExpiresAt.getTime() - Date.now()) / 1_000),
    user: session.user,
  });
}

export function createAuthRouter(options: AuthRouterOptions): Router {
  const router = Router();
  router.use(cookieParser());
  // Cookie-authenticated writes (login, refresh, logout, session revocation)
  // must come from the web app's own origin.
  router.use(
    requireTrustedOrigin({
      allowedOrigins: [options.webOrigin],
      nodeEnvironment: options.nodeEnvironment,
    }),
  );
  const skip = options.rateLimits === false ? () => true : undefined;

  const loginRateLimit = rateLimit({
    windowMs: LOGIN_RATE_WINDOW_MS,
    skip,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { code: "rate_limited", message: "Too many login attempts. Try again later." },
    },
  });
  const registrationRateLimit = rateLimit({
    windowMs: LOGIN_RATE_WINDOW_MS,
    skip,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { code: "rate_limited", message: "Too many registration attempts. Try again later." },
    },
  });
  const otpVerifyRateLimit = rateLimit({
    windowMs: LOGIN_RATE_WINDOW_MS,
    skip,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { code: "rate_limited", message: "Too many verification attempts. Try again later." },
    },
  });
  const passwordResetRequestRateLimit = rateLimit({
    windowMs: LOGIN_RATE_WINDOW_MS,
    skip,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: "rate_limited",
        message: "Too many password reset requests. Try again later.",
      },
    },
  });
  const passwordResetConfirmRateLimit = rateLimit({
    windowMs: LOGIN_RATE_WINDOW_MS,
    skip,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: "rate_limited",
        message: "Too many password reset attempts. Try again later.",
      },
    },
  });
  const refreshRateLimit = rateLimit({
    windowMs: LOGIN_RATE_WINDOW_MS,
    skip,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { code: "rate_limited", message: "Too many refresh attempts. Try again later." },
    },
  });

  router.post("/register", registrationRateLimit, async (request: Request, response: Response) => {
    const body: unknown = request.body;
    if (
      !isRecord(body) ||
      typeof body.name !== "string" ||
      typeof body.email !== "string" ||
      typeof body.password !== "string"
    ) {
      response.status(400).json({
        error: { code: "invalid_request", message: "A name, email, and password are required." },
      });
      return;
    }

    try {
      if (!options.createEmailOtpService) throw new AuthConfigurationError();
      const result = await (await options.createEmailOtpService()).register(
        body.name,
        body.email,
        body.password,
      );
      response.status(202).json(result);
    } catch (error) {
      handleAuthError(error, response);
    }
  });

  router.post(
    "/otp/request",
    registrationRateLimit,
    async (request: Request, response: Response) => {
      const body: unknown = request.body;
      if (!isRecord(body) || typeof body.email !== "string") {
        response.status(400).json({
          error: { code: "invalid_request", message: "A valid email address is required." },
        });
        return;
      }

      try {
        if (!options.createEmailOtpService) throw new AuthConfigurationError();
        const result = await (await options.createEmailOtpService()).requestRegistrationOtp(
          body.email,
        );
        response.status(202).json(result);
      } catch (error) {
        handleAuthError(error, response);
      }
    },
  );

  router.post("/otp/verify", otpVerifyRateLimit, async (request: Request, response: Response) => {
    const body: unknown = request.body;
    if (
      !isRecord(body) ||
      typeof body.email !== "string" ||
      typeof body.code !== "string" ||
      typeof body.password !== "string"
    ) {
      response.status(400).json({
        error: {
          code: "invalid_request",
          message: "A valid email, six-digit code, and password are required.",
        },
      });
      return;
    }

    try {
      if (!options.createEmailOtpService) throw new AuthConfigurationError();
      const session = await (await options.createEmailOtpService()).verifyRegistrationOtp(
        body.email,
        body.code,
        body.password,
      );
      await labelDevice(await options.createService(), session, request);
      sendSession(response, session, options.nodeEnvironment);
    } catch (error) {
      handleAuthError(error, response);
    }
  });

  router.post(
    "/reset-password/request",
    passwordResetRequestRateLimit,
    async (request: Request, response: Response) => {
      const body: unknown = request.body;
      if (
        Object.keys(request.query).length > 0 ||
        !isRecord(body) ||
        !hasOnlyKeys(body, ["email"]) ||
        typeof body.email !== "string"
      ) {
        response.status(400).json({
          error: { code: "invalid_request", message: "Provide only a valid email address." },
        });
        return;
      }

      try {
        if (!options.createPasswordResetService) throw new AuthConfigurationError();
        const result = await (await options.createPasswordResetService()).requestReset(body.email);
        response.set("Cache-Control", "no-store");
        response.status(202).json(result);
      } catch (error) {
        handleAuthError(error, response);
      }
    },
  );

  router.post(
    "/reset-password/confirm",
    passwordResetConfirmRateLimit,
    async (request: Request, response: Response) => {
      const body: unknown = request.body;
      if (
        Object.keys(request.query).length > 0 ||
        !isRecord(body) ||
        !hasOnlyKeys(body, ["email", "code", "newPassword"]) ||
        typeof body.email !== "string" ||
        typeof body.code !== "string" ||
        typeof body.newPassword !== "string"
      ) {
        response.status(400).json({
          error: {
            code: "invalid_request",
            message: "Provide only an email, six-digit code, and new password.",
          },
        });
        return;
      }

      try {
        if (!options.createPasswordResetService) throw new AuthConfigurationError();
        await (await options.createPasswordResetService()).confirmReset(
          body.email,
          body.code,
          body.newPassword,
        );
        clearRefreshCookie(response, options.nodeEnvironment);
        response.set("Cache-Control", "no-store");
        response.status(204).end();
      } catch (error) {
        handleAuthError(error, response);
      }
    },
  );

  router.post("/login", loginRateLimit, async (request: Request, response: Response) => {
    const body: unknown = request.body;
    if (!isRecord(body) || typeof body.email !== "string" || typeof body.password !== "string") {
      response.status(400).json({
        error: { code: "invalid_request", message: "A valid email and password are required." },
      });
      return;
    }

    try {
      const service = await options.createService();
      const session = await service.login(body.email, body.password);
      await labelDevice(service, session, request);
      sendSession(response, session, options.nodeEnvironment);
    } catch (error) {
      handleAuthError(error, response);
    }
  });

  router.post("/google", loginRateLimit, async (request: Request, response: Response) => {
    const body: unknown = request.body;
    if (!isRecord(body) || typeof body.idToken !== "string" || body.idToken.length > 8_192) {
      response.status(400).json({
        error: { code: "invalid_request", message: "A valid Google ID token is required." },
      });
      return;
    }

    try {
      if (!options.googleSession)
        throw new AuthConfigurationError("Google sign-in is not configured.");
      const session = await options.googleSession(body.idToken);
      await labelDevice(await options.createService(), session, request);
      sendSession(response, session, options.nodeEnvironment);
    } catch (error) {
      handleAuthError(error, response);
    }
  });

  router.post("/refresh", refreshRateLimit, async (request: Request, response: Response) => {
    const refreshToken: unknown = request.cookies?.[REFRESH_COOKIE_NAME];
    if (typeof refreshToken !== "string") {
      response.status(401).json({
        error: { code: "invalid_refresh_token", message: "A valid refresh session is required." },
      });
      return;
    }

    try {
      const session = await (await options.createService()).refresh(refreshToken);
      sendSession(response, session, options.nodeEnvironment);
    } catch (error) {
      handleAuthError(error, response);
    }
  });

  router.post("/logout", async (request: Request, response: Response) => {
    try {
      await (await options.createService()).logout(request.cookies?.[REFRESH_COOKIE_NAME]);
      clearRefreshCookie(response, options.nodeEnvironment);
      response.status(204).end();
    } catch (error) {
      clearRefreshCookie(response, options.nodeEnvironment);
      handleAuthError(error, response);
    }
  });

  // Signed-in devices (S4-04). The refresh cookie only identifies which
  // session is "this device"; every route needs a valid access token.
  router.get("/sessions", async (request: Request, response: Response) => {
    try {
      const service = await options.createService();
      const principal = await bearerPrincipal(service, request, response);
      if (!principal) return;
      const sessions = await service.listSessions(
        principal.userId,
        request.cookies?.[REFRESH_COOKIE_NAME],
      );
      response.set("Cache-Control", "no-store");
      response.status(200).json({
        sessions: sessions.map((session) => ({
          id: session.id,
          deviceLabel: session.deviceLabel,
          createdAt: session.createdAt.toISOString(),
          lastUsedAt: session.lastUsedAt.toISOString(),
          expiresAt: session.expiresAt.toISOString(),
          current: session.current,
        })),
      });
    } catch (error) {
      handleAuthError(error, response);
    }
  });

  router.delete("/sessions", async (request: Request, response: Response) => {
    try {
      const service = await options.createService();
      const principal = await bearerPrincipal(service, request, response);
      if (!principal) return;
      const revoked = await service.revokeOtherSessions(
        principal.userId,
        request.cookies?.[REFRESH_COOKIE_NAME],
      );
      response.status(200).json({ revoked });
    } catch (error) {
      handleAuthError(error, response);
    }
  });

  router.delete("/sessions/:id", async (request: Request, response: Response) => {
    try {
      const service = await options.createService();
      const principal = await bearerPrincipal(service, request, response);
      if (!principal) return;
      const rawId = request.params.id;
      await service.revokeSession(
        principal.userId,
        (Array.isArray(rawId) ? rawId[0] : rawId) ?? "",
      );
      response.status(204).end();
    } catch (error) {
      handleAuthError(error, response);
    }
  });

  return router;
}
