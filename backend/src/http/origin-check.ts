import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Methods that cannot change state; they are never blocked by the origin check. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface OriginCheckOptions {
  /** Exact origins (scheme://host[:port]) allowed to send cookie-authenticated writes. */
  allowedOrigins: readonly string[];
  nodeEnvironment: string;
}

export type OriginVerdict = "allowed" | "foreign_origin" | "missing_origin" | "cross_site";

/**
 * Decides whether a state-changing request may use the refresh cookie (S4-04).
 *
 * - An Origin header must match an allowed origin exactly; "null" (sandboxed
 *   frames, some redirects) never matches.
 * - Without Origin, a browser's Sec-Fetch-Site: cross-site still marks the
 *   request as foreign.
 * - Without either, production refuses the request; development and test
 *   allow it so curl and server-side tests keep working.
 */
export function checkOrigin(
  method: string,
  headers: { origin?: string | undefined; secFetchSite?: string | undefined },
  options: OriginCheckOptions,
): OriginVerdict {
  if (SAFE_METHODS.has(method.toUpperCase())) return "allowed";
  const origin = headers.origin;
  if (origin !== undefined) {
    return origin !== "null" && options.allowedOrigins.includes(origin)
      ? "allowed"
      : "foreign_origin";
  }
  if (headers.secFetchSite === "cross-site") return "cross_site";
  return options.nodeEnvironment === "production" ? "missing_origin" : "allowed";
}

export function requireTrustedOrigin(options: OriginCheckOptions): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    const verdict = checkOrigin(
      request.method,
      { origin: request.get("origin"), secFetchSite: request.get("sec-fetch-site") },
      options,
    );
    if (verdict !== "allowed") {
      response.status(403).json({
        error: { code: "untrusted_origin", message: "The request origin is not allowed." },
      });
      return;
    }
    next();
  };
}
