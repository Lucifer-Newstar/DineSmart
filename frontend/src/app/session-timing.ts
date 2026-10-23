/** Renew the 15-minute access token this long before it expires. */
export const REFRESH_LEAD_MS = 60_000;
/** Wait this long before retrying a refresh that failed for a transient reason. */
export const REFRESH_RETRY_MS = 30_000;
const MIN_REFRESH_DELAY_MS = 5_000;

/** Milliseconds until the token should be renewed, never below a small floor. */
export function refreshDelayMs(expiresAt: number, now: number): number {
  return Math.max(MIN_REFRESH_DELAY_MS, expiresAt - now - REFRESH_LEAD_MS);
}

/** True when the token is inside the renewal window (or already expired). */
export function needsRefresh(expiresAt: number, now: number): boolean {
  return expiresAt - now <= REFRESH_LEAD_MS;
}
