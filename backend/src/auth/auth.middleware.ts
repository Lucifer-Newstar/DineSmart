import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AuthError, type AuthPrincipal } from "./auth.service.js";

export function authenticateAccessToken(
  verifyToken: (token: string) => Promise<AuthPrincipal>,
): RequestHandler {
  return async (request: Request, response: Response, next: NextFunction) => {
    const authorization = request.get("authorization");
    const match = authorization?.match(/^Bearer ([A-Za-z0-9._~-]+)$/);

    if (!match) {
      response.status(401).json({
        error: { code: "missing_access_token", message: "A bearer access token is required." },
      });
      return;
    }

    try {
      request.auth = await verifyToken(match[1]);
      next();
    } catch (error) {
      const authError =
        error instanceof AuthError
          ? error
          : new AuthError(401, "invalid_access_token", "A valid access token is required.");
      response
        .status(authError.statusCode)
        .json({ error: { code: authError.code, message: authError.message } });
    }
  };
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPrincipal;
    }
  }
}
