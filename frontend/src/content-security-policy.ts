/**
 * The frontend's Content Security Policy (S4-04), built once at startup from
 * the same environment the app reads.
 *
 * - Scripts and styles: this origin plus Google Identity Services. Next.js
 *   inlines its hydration data as script tags, so 'unsafe-inline' stays until
 *   the app moves to per-request nonces; 'unsafe-eval' is development-only
 *   (React's dev tooling needs it).
 * - Connections: this origin (the /api/v1 proxy), the WebSocket origin and
 *   Google sign-in. Without NEXT_PUBLIC_REALTIME_URL the client falls back to
 *   ws://localhost:3001, so that fallback is allowed in that case only.
 * - Nothing may frame the app, and plugins and <base> rewrites are blocked.
 */
export interface CspOptions {
  realtimeUrl?: string | undefined;
  development: boolean;
}

const GOOGLE_IDENTITY = "https://accounts.google.com";

export function realtimeOrigins(realtimeUrl: string | undefined): string[] {
  const value = realtimeUrl?.trim();
  if (!value) return ["ws://localhost:3001", "ws://127.0.0.1:3001"];
  try {
    const url = new URL(value);
    if (url.protocol === "https:") url.protocol = "wss:";
    if (url.protocol === "http:") url.protocol = "ws:";
    if (url.protocol !== "wss:" && url.protocol !== "ws:") return [];
    return [`${url.protocol}//${url.host}`];
  } catch {
    return [];
  }
}

export function buildContentSecurityPolicy({ realtimeUrl, development }: CspOptions): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(development ? ["'unsafe-eval'"] : []),
      `${GOOGLE_IDENTITY}/gsi/client`,
    ],
    "style-src": ["'self'", "'unsafe-inline'", `${GOOGLE_IDENTITY}/gsi/style`],
    "img-src": ["'self'", "data:", "blob:", "https://*.googleusercontent.com"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...realtimeOrigins(realtimeUrl), `${GOOGLE_IDENTITY}/gsi/`],
    "frame-src": [`${GOOGLE_IDENTITY}/gsi/`],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

export function securityHeaders(options: CspOptions): Array<{ key: string; value: string }> {
  return [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    // Google sign-in opens a popup that must be able to message this window.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];
}
