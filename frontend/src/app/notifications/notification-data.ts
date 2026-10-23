export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationPage {
  notifications: NotificationItem[];
  unreadCount: number;
  truncated: boolean;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Validates one notification from the API or a WebSocket envelope. */
export function parseNotification(value: unknown): NotificationItem | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id);
  const title = text(raw.title);
  const createdAt = text(raw.createdAt);
  if (!id || !title || !createdAt) return null;
  return {
    id,
    type: text(raw.type) ?? "notification",
    title,
    body: text(raw.body) ?? "",
    createdAt,
    readAt: text(raw.readAt),
  };
}

export function parseNotificationPage(value: unknown): NotificationPage | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.notifications)) return null;
  const notifications = raw.notifications
    .map(parseNotification)
    .filter((item): item is NotificationItem => item !== null);
  const unreadCount =
    typeof raw.unreadCount === "number" && raw.unreadCount >= 0
      ? raw.unreadCount
      : notifications.filter((item) => !item.readAt).length;
  return { notifications, unreadCount, truncated: raw.truncated === true };
}

/** "just now", "6 min ago", "3 h ago", or a date for anything older than a day. */
export function relativeTime(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((now - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(then).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
