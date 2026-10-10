import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import type { Db } from "mongodb";
import { MongoAuthRepository } from "./auth/auth.repository.js";
import { createAuthRouter } from "./auth/auth.router.js";
import { AuthConfigurationError, AuthService } from "./auth/auth.service.js";
import { EmailOtpService } from "./auth/email-otp.service.js";
import { GoogleIdTokenVerifier, GoogleOAuthService } from "./auth/google-oauth.service.js";
import { MongoRegistrationOtpRepository } from "./auth/registration.repository.js";
import { connectToDatabase } from "./database.js";
import { MongoHealthScoreRepository } from "./healthscore/health-score.repository.js";
import { createHealthScoreRouter } from "./healthscore/health-score.router.js";
import { HealthScoreService } from "./healthscore/health-score.service.js";
import { MongoInventoryRepository } from "./inventory/inventory.repository.js";
import { createInventoryRouter } from "./inventory/inventory.router.js";
import { InventoryService } from "./inventory/inventory.service.js";

export interface AppOptions {
  getDatabase?: () => Promise<Db>;
  getJwtSecret?: () => string | undefined;
  getGoogleClientId?: () => string | undefined;
  webOrigin?: string;
  nodeEnvironment?: string;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const nodeEnvironment = options.nodeEnvironment ?? process.env.NODE_ENV ?? "development";
  const configuredWebOrigin = options.webOrigin ?? process.env.WEB_ORIGIN;
  const webOrigin =
    configuredWebOrigin ?? (nodeEnvironment === "production" ? "" : "http://localhost:3000");
  const googleClientId = options.getGoogleClientId?.() ?? process.env.GOOGLE_CLIENT_ID;
  const googleVerifier = googleClientId ? new GoogleIdTokenVerifier(googleClientId) : undefined;

  if (configuredWebOrigin) {
    const parsedOrigin = new URL(configuredWebOrigin);
    if (
      parsedOrigin.origin !== configuredWebOrigin ||
      !["http:", "https:"].includes(parsedOrigin.protocol)
    ) {
      throw new Error("WEB_ORIGIN must be a canonical HTTP(S) origin without a path.");
    }
  }

  async function createAuthRuntime() {
    const secret = options.getJwtSecret?.() ?? process.env.JWT_SECRET;
    if (!secret) throw new AuthConfigurationError();
    if (nodeEnvironment === "production" && !configuredWebOrigin) {
      throw new AuthConfigurationError("WEB_ORIGIN must be configured in production.");
    }

    const db = await (options.getDatabase?.() ?? connectToDatabase());
    const repository = new MongoAuthRepository(db);
    return { db, repository, secret, service: new AuthService(repository, secret) };
  }

  app.disable("x-powered-by");
  if (nodeEnvironment === "production") app.set("trust proxy", 1);

  app.use(
    cors({
      origin: webOrigin,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.use(express.json({ limit: "16kb" }));

  // Infrastructure liveness only; this must not depend on database/auth readiness.
  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.use(
    "/api/v1/auth",
    createAuthRouter({
      webOrigin,
      nodeEnvironment,
      createService: async () => (await createAuthRuntime()).service,
      createEmailOtpService: async () => {
        const { db, secret, service } = await createAuthRuntime();
        const emailProvider =
          process.env.EMAIL_PROVIDER ?? (nodeEnvironment === "production" ? "" : "mock");
        return new EmailOtpService(
          new MongoRegistrationOtpRepository(db),
          service,
          secret,
          emailProvider,
          nodeEnvironment,
        );
      },
      googleSession: async (idToken) => {
        if (!googleClientId || !googleVerifier) {
          throw new AuthConfigurationError(
            "GOOGLE_CLIENT_ID must be configured for Google sign-in.",
          );
        }

        const { repository, service } = await createAuthRuntime();
        return new GoogleOAuthService(repository, service, googleVerifier).login(idToken);
      },
    }),
  );

  app.use(
    "/api/v1/healthscore",
    createHealthScoreRouter({
      createRuntime: async () => {
        const { db, service: authService } = await createAuthRuntime();
        return {
          service: new HealthScoreService(new MongoHealthScoreRepository(db)),
          verifyAccessToken: (token) => authService.verifyAccessToken(token),
        };
      },
    }),
  );

  app.use(
    "/api/v1/inventory",
    createInventoryRouter({
      createRuntime: async () => {
        const { db, service: authService } = await createAuthRuntime();
        return {
          service: new InventoryService(new MongoInventoryRepository(db)),
          verifyAccessToken: (token) => authService.verifyAccessToken(token),
        };
      },
    }),
  );

  const handleApiError: ErrorRequestHandler = (error, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    const status =
      typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
    if (error instanceof SyntaxError || status === 400) {
      response
        .status(400)
        .json({ error: { code: "invalid_request", message: "The request body is invalid." } });
      return;
    }
    if (status === 413) {
      response
        .status(413)
        .json({ error: { code: "payload_too_large", message: "The request body is too large." } });
      return;
    }

    console.error("An unhandled API error occurred.");
    response
      .status(500)
      .json({ error: { code: "internal_error", message: "The request could not be processed." } });
  };
  app.use(handleApiError);

  return app;
}

const app = createApp();
export default app;
