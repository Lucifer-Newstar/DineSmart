import cookieParser from "cookie-parser";
import { type NextFunction, type Request, type Response, Router } from "express";
import rateLimit from "express-rate-limit";
import {
  AuthConfigurationError,
  AuthError,
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
    response.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
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

function sendSession(response: Response, session: AuthSession, nodeEnvironment: string): void {
  setRefreshCookie(response, session, nodeEnvironment);
  response.status(200).json({
    accessToken: session.accessToken,
    tokenType: "Bearer",
    expiresIn: Math.ceil((session.accessTokenExpiresAt.getTime() - Date.now()) / 1_000),
    user: session.user,
  });
}

function requireTrustedOrigin(options: AuthRouterOptions) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const origin = request.get("origin");
    const originIsMissingInProduction = options.nodeEnvironment === "production" && !origin;

    if (originIsMissingInProduction || (origin !== undefined && origin !== options.webOrigin)) {
      response.status(403).json({
        error: { code: "untrusted_origin", message: "The request origin is not allowed." },
      });
      return;
    }

    next();
  };
}

export function createAuthRouter(options: AuthRouterOptions): Router {
  const router = Router();
  router.use(cookieParser());
  router.use(requireTrustedOrigin(options));

  const loginRateLimit = rateLimit({
    windowMs: LOGIN_RATE_WINDOW_MS,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { code: "rate_limited", message: "Too many login attempts. Try again later." },
    },
  });
  const registrationRateLimit = rateLimit({
    windowMs: LOGIN_RATE_WINDOW_MS,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { code: "rate_limited", message: "Too many registration attempts. Try again later." },
    },
  });
  const otpVerifyRateLimit = rateLimit({
    windowMs: LOGIN_RATE_WINDOW_MS,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { code: "rate_limited", message: "Too many verification attempts. Try again later." },
    },
  });
  const passwordResetRequestRateLimit = rateLimit({
    windowMs: LOGIN_RATE_WINDOW_MS,
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
      const session = await (await options.createService()).login(body.email, body.password);
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

  return router;
}
