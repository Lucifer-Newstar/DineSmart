"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "../api-client";
import { connectRealtime, type RealtimeEnvelope, resolveRealtimeBase } from "../realtime-client";
import {
  type NotificationItem,
  parseNotification,
  parseNotificationPage,
} from "./notification-data";

const API_BASE = "/api/v1";
const POLL_INTERVAL_MS = 60_000;

export type NotificationFeedStatus = "idle" | "loading" | "live" | "unavailable";
export type RealtimeStatus = "off" | "connecting" | "live" | "offline";

export interface NotificationFeed {
  notifications: NotificationItem[];
  unreadCount: number;
  status: NotificationFeedStatus;
  realtime: RealtimeStatus;
  markRead: (id: string) => Promise<void>;
  /** Marks the whole feed as read; resolves false when the server refused. */
  markAllRead: () => Promise<boolean>;
  refresh: () => void;
}

/**
 * The signed-in user's notification feed (S2-10) kept current over the S2-13
 * WebSocket, with polling as the fallback. Restaurant invalidation events are
 * passed to onEvent so screens can refetch what changed.
 */
export function useNotifications(
  accessToken: string | null,
  onEvent?: (envelope: RealtimeEnvelope) => void,
): NotificationFeed {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [status, setStatus] = useState<NotificationFeedStatus>("idle");
  const [realtime, setRealtime] = useState<RealtimeStatus>("off");
  const [_refreshKey, setRefreshKey] = useState(0);
  const tokenRef = useRef(accessToken);
  const onEventRef = useRef(onEvent);
  tokenRef.current = accessToken;
  onEventRef.current = onEvent;

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  useEffect(() => {
    if (!accessToken) {
      setNotifications([]);
      setUnreadCount(0);
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    setStatus((current) => (current === "live" ? current : "loading"));
    void fetchWithTimeout(`${API_BASE}/notifications`, {
      cache: "no-store",
      credentials: "include",
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Notifications are unavailable.");
        const page = parseNotificationPage(await response.json());
        if (!page) throw new Error("The notification response was invalid.");
        if (controller.signal.aborted) return;
        setNotifications(page.notifications);
        setUnreadCount(page.unreadCount);
        setStatus("live");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("unavailable");
      });
    return () => controller.abort();
  }, [accessToken]);

  const signedIn = Boolean(accessToken);
  useEffect(() => {
    if (!signedIn) {
      setRealtime("off");
      return;
    }
    const base = resolveRealtimeBase(
      process.env.NEXT_PUBLIC_REALTIME_URL,
      typeof window === "undefined" ? undefined : window.location,
    );
    if (!base || typeof WebSocket === "undefined") {
      setRealtime("off");
      const timer = setInterval(refresh, POLL_INTERVAL_MS);
      return () => clearInterval(timer);
    }
    return connectRealtime({
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
      onOpen: refresh,
      onStatus: setRealtime,
      onEvent: (envelope) => {
        if (envelope.event === "notification.created") {
          const created = parseNotification(envelope.data.notification);
          if (created) {
            setNotifications((current) => [
              created,
              ...current.filter((item) => item.id !== created.id),
            ]);
            if (!created.readAt) setUnreadCount((count) => count + 1);
          }
          return;
        }
        onEventRef.current?.(envelope);
      },
    });
  }, [signedIn, refresh]);

  const markRead = useCallback(async (id: string) => {
    const token = tokenRef.current;
    if (!token) return;
    const response = await fetchWithTimeout(
      `${API_BASE}/notifications/${encodeURIComponent(id)}/read`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { authorization: `Bearer ${token}` },
      },
    );
    if (!response.ok) return;
    let wasUnread = false;
    setNotifications((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        wasUnread = !item.readAt;
        return { ...item, readAt: item.readAt ?? new Date().toISOString() };
      }),
    );
    if (wasUnread) setUnreadCount((count) => Math.max(0, count - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return false;
    const response = await fetchWithTimeout(`${API_BASE}/notifications/read-all`, {
      method: "POST",
      credentials: "include",
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (!response?.ok) return false;
    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((item) => ({ ...item, readAt: item.readAt ?? readAt })),
    );
    setUnreadCount(0);
    return true;
  }, []);

  return { notifications, unreadCount, status, realtime, markRead, markAllRead, refresh };
}
