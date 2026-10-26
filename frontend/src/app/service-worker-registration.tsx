"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker (S5-05) in production builds only, so
 * development always sees fresh code. Failure is harmless: the app simply
 * works online only.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}
