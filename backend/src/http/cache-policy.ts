import type { Response } from "express";

/**
 * Operational responses carry tenant data and per-request authorization, so
 * shared and browser caches must never reuse them.
 */
export const NO_STORE_CACHE_CONTROL = "no-store";

/**
 * The public catalog is identical for every visitor and changes only when the
 * restaurant edits its menu, so a short shared-cache window is safe.
 */
export const PUBLIC_MENU_MAX_AGE_SECONDS = 30;

export function sendNoStoreApiResponse(
  _request: unknown,
  response: Response,
  next: () => void,
): void {
  response.setHeader("Cache-Control", NO_STORE_CACHE_CONTROL);
  next();
}

export function setPublicMenuCacheHeaders(response: Response): void {
  response.setHeader("Cache-Control", `public, max-age=${PUBLIC_MENU_MAX_AGE_SECONDS}`);
}
