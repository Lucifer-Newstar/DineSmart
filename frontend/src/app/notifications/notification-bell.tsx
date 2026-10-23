"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../_dashboard/ui";
import { relativeTime } from "./notification-data";
import type { NotificationFeed } from "./use-notifications";

interface NotificationBellProps {
  /** null when nobody is signed in (preview mode). */
  feed: NotificationFeed | null;
  onViewActivity: () => void;
}

/** Topbar bell backed by the recipient-scoped notification feed (S2-10). */
export function NotificationBell({ feed, onViewActivity }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const unread = feed?.unreadCount ?? 0;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = !feed
    ? "Notifications (sign in to see your feed)"
    : unread > 0
      ? `Notifications, ${unread} unread`
      : "Notifications";

  return (
    <div className="notification-wrap" ref={wrapRef}>
      <button
        className={`icon-button notification-button ${open ? "notification-active" : ""}`}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
      >
        <Icon name="bell" size={19} />
        {unread > 0 ? (
          <span className="notification-count" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="notification-popover" role="dialog" aria-label="Notifications">
          <div className="popover-heading">
            <strong>Notifications</strong>
            <span>
              {!feed
                ? "Preview"
                : feed.realtime === "live"
                  ? "Live"
                  : feed.realtime === "connecting"
                    ? "Connecting"
                    : "Updates every minute"}
            </span>
          </div>
          {!feed ? (
            <p className="notification-empty">Sign in to see alerts for your restaurant.</p>
          ) : feed.status === "loading" ? (
            <p className="notification-empty">Loading notifications…</p>
          ) : feed.status === "unavailable" ? (
            <p className="notification-empty">
              Notifications are unavailable right now.{" "}
              <button type="button" className="text-button" onClick={feed.refresh}>
                Try again
              </button>
            </p>
          ) : feed.notifications.length === 0 ? (
            <p className="notification-empty">You’re all caught up. New incidents show up here.</p>
          ) : (
            <ul className="notification-list">
              {feed.notifications.slice(0, 8).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`notification-item ${item.readAt ? "" : "notification-unread"}`}
                    onClick={() => {
                      if (!item.readAt) void feed.markRead(item.id);
                    }}
                  >
                    <span
                      className={`notification-mark ${
                        item.title.startsWith("Critical")
                          ? "notification-mark-coral"
                          : "notification-mark-green"
                      }`}
                    >
                      <Icon name={item.type.startsWith("incident") ? "alert" : "check"} size={15} />
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <span className="notification-meta">
                        {item.body ? `${item.body} · ` : ""}
                        {relativeTime(item.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="popover-link"
            onClick={() => {
              setOpen(false);
              onViewActivity();
            }}
          >
            View activity <Icon name="arrow-right" size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
