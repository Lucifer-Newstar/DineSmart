import type { NextFunction, Request, Response } from "express";

/**
 * The API only ever returns JSON, so the policy forbids every kind of content
 * and framing. A browser that renders an API response directly gets nothing
 * it could execute or embed.
 */
export const API_CONTENT_SECURITY_POLICY =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** One year, the minimum most browsers' preload lists accept. */
export const HSTS_MAX_AGE_SECONDS = 31_536_000;

export const API_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy": API_CONTENT_SECURITY_POLICY,
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

/**
 * Sets the security headers on every response, including errors, 404s and
 * body-parser rejections; register it before any other middleware.
 * Strict-Transport-Security is sent only in production, where the API is
 * served over HTTPS; on plain-HTTP localhost it would be ignored or confusing.
 */
export function createSecurityHeaders(nodeEnvironment: string | undefined) {
  const production = nodeEnvironment === "production";
  return (_request: Request, response: Response, next: NextFunction): void => {
    for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
      response.setHeader(name, value);
    }
    if (production) {
      response.setHeader(
        "Strict-Transport-Security",
        `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`,
      );
    }
    next();
  };
}
