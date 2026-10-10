import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import type { Db } from "mongodb";
import { MongoAuthRepository } from "./auth/auth.repository.js";
import { createAuthRouter } from "./auth/auth.router.js";
import { AuthConfigurationError, AuthService } from "./auth/auth.service.js";
import { connectToDatabase } from "./database.js";

export interface AppOptions {
  getDatabase?: () => Promise<Db>;
  getJwtSecret?: () => string | undefined;
  webOrigin?: string;
  nodeEnvironment?: string;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const nodeEnvironment = options.nodeEnvironment ?? process.env.NODE_ENV ?? "development";
  const configuredWebOrigin = options.webOrigin ?? process.env.WEB_ORIGIN;
  const webOrigin =
    configuredWebOrigin ?? (nodeEnvironment === "production" ? "" : "http://localhost:3000");

  if (configuredWebOrigin) {
    const parsedOrigin = new URL(configuredWebOrigin);
    if (
      parsedOrigin.origin !== configuredWebOrigin ||
      !["http:", "https:"].includes(parsedOrigin.protocol)
    ) {
      throw new Error("WEB_ORIGIN must be a canonical HTTP(S) origin without a path.");
    }
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
      createService: async () => {
        const secret = options.getJwtSecret?.() ?? process.env.JWT_SECRET;
        if (!secret) throw new AuthConfigurationError();
        if (nodeEnvironment === "production" && !configuredWebOrigin) {
          throw new AuthConfigurationError("WEB_ORIGIN must be configured in production.");
        }

        const db = await (options.getDatabase?.() ?? connectToDatabase());
        return new AuthService(new MongoAuthRepository(db), secret);
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
