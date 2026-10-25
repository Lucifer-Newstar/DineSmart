"use client";

import { useEffect, useRef } from "react";
import { fetchWithTimeout } from "../api-client";
import { connectRealtime, resolveRealtimeBase } from "../realtime-client";
import { parseAvailabilityEvent } from "./menu-data";

const API_BASE = "/api/v1";
const RESYNC_INTERVAL_MS = 30_000;

/**
 * Keeps the customer menu's sold-out state current without a reload (S4-05).
 * Signed-in visitors get `menu.availability` over the realtime socket; anyone
 * else, or anyone whose socket is down, re-reads the menu every 30 seconds
 * while the tab is visible and again whenever it becomes visible.
 */
export function useLiveMenuAvailability(options: {
  accessToken: string | null;
  enabled: boolean;
  onAvailability: (menuItemId: string, isAvailable: boolean) => void;
  onResync: () => void;
}) {
  const { accessToken, enabled } = options;
  const handlers = useRef(options);
  handlers.current = options;
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  useEffect(() => {
    if (!enabled) return;
    let socketLive = false;
    const resync = () => {
      if (document.visibilityState === "visible") handlers.current.onResync();
    };
    const onVisibility = () => resync();
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => {
      if (!socketLive) resync();
    }, RESYNC_INTERVAL_MS);

    const base = resolveRealtimeBase(process.env.NEXT_PUBLIC_REALTIME_URL, window.location);
    const disconnect =
      accessToken && base && typeof WebSocket !== "undefined"
        ? connectRealtime({
            base,
            requestTicket: async () => {
              const token = tokenRef.current;
              if (!token) return null;
              const response = await fetchWithTimeout(`${API_BASE}/notifications/socket-ticket`, {
                method: "POST",
                credentials: "include",
                headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
                body: "{}",
              });
              return response.status === 201 ? await response.json() : null;
            },
            // A (re)connect may have missed events, so the menu is re-read once.
            onOpen: () => handlers.current.onResync(),
            onStatus: (status) => {
              socketLive = status === "live";
            },
            onEvent: (envelope) => {
              if (envelope.event !== "menu.availability") return;
              const change = parseAvailabilityEvent(envelope.data);
              if (change) handlers.current.onAvailability(change.menuItemId, change.isAvailable);
            },
          })
        : null;

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
      disconnect?.();
    };
  }, [accessToken, enabled]);
}
