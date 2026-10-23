/**
 * Resolves Express's `trust proxy` setting from TRUST_PROXY.
 *
 * Rate limits key on `req.ip`, so this must match the real proxy chain:
 * too low and every user shares the proxy's address (one user's failed logins
 * lock out everyone); `true` lets any client spoof X-Forwarded-For.
 *
 * - unset: 1 in production (one platform load balancer), off elsewhere
 * - `false` or `0`: do not trust X-Forwarded-For
 * - an integer 1-10: the number of proxy hops in front of the API
 * - a comma list of `loopback`, `linklocal`, `uniquelocal`, IPs or CIDR ranges
 *
 * `true` is rejected on purpose.
 */
export type TrustProxySetting = false | number | string[];

const NAMED_RANGES = new Set(["loopback", "linklocal", "uniquelocal"]);
const ADDRESS_PATTERN = /^[0-9a-fA-F:.]+(\/\d{1,3})?$/;

export function resolveTrustProxy(
  raw: string | undefined,
  nodeEnvironment: string,
): TrustProxySetting {
  const value = raw?.trim();
  if (!value) return nodeEnvironment === "production" ? 1 : false;

  const lower = value.toLowerCase();
  if (lower === "false" || lower === "0") return false;
  if (lower === "true") {
    throw new Error(
      "TRUST_PROXY=true would trust any X-Forwarded-For header; set the proxy hop count instead.",
    );
  }
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    if (hops < 1 || hops > 10) throw new Error("TRUST_PROXY hop count must be between 1 and 10.");
    return hops;
  }

  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const entry of entries) {
    if (!NAMED_RANGES.has(entry.toLowerCase()) && !ADDRESS_PATTERN.test(entry)) {
      throw new Error(`TRUST_PROXY entry "${entry}" is not a hop count, range name, or IP/CIDR.`);
    }
  }
  return entries;
}
