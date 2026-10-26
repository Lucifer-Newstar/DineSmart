import type { Db, ObjectId } from "mongodb";
import { COLLECTIONS, type UserDocument, type UserRole } from "../database/schema.js";
import type { NewNotification } from "./notification.types.js";

/**
 * Which in-app notifications a user wants (S5-04). Each user can mute whole
 * categories; a muted notification is never created. Incident alerts stay on
 * for staff because they report problems that need someone to act.
 */

export const NOTIFICATION_CATEGORIES = {
  bookings: {
    label: "Booking confirmations, changes and reminders",
    prefixes: ["reservation."],
    roles: ["Customer"],
  },
  orders: {
    label: "Order ready updates",
    prefixes: ["order."],
    roles: ["Customer"],
  },
  waiterAlerts: {
    label: "Dine-in orders ready to take to the table",
    prefixes: ["staff.order_ready"],
    roles: ["Reception"],
  },
} as const satisfies Record<
  string,
  { label: string; prefixes: readonly string[]; roles: readonly UserRole[] }
>;

export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES;
export type NotificationPreferences = Partial<Record<NotificationCategory, boolean>>;

const CATEGORY_KEYS = Object.keys(NOTIFICATION_CATEGORIES) as NotificationCategory[];

/** The category a notification type belongs to; null for alerts that cannot be muted. */
export function categoryOf(type: string): NotificationCategory | null {
  for (const key of CATEGORY_KEYS) {
    if (NOTIFICATION_CATEGORIES[key].prefixes.some((prefix) => type.startsWith(prefix))) {
      return key;
    }
  }
  return null;
}

export function categoriesFor(role: UserRole): NotificationCategory[] {
  return CATEGORY_KEYS.filter((key) =>
    (NOTIFICATION_CATEGORIES[key].roles as readonly UserRole[]).includes(role),
  );
}

/** Every category the role can see, on unless the user turned it off. */
export function effectivePreferences(
  role: UserRole,
  stored: NotificationPreferences | undefined,
): Record<string, boolean> {
  return Object.fromEntries(categoriesFor(role).map((key) => [key, stored?.[key] !== false]));
}

export function isMuted(stored: NotificationPreferences | undefined, type: string): boolean {
  const category = categoryOf(type);
  return category !== null && stored?.[category] === false;
}

/** Accepts only boolean values for categories this role can change. */
export function parsePreferenceChanges(
  role: UserRole,
  value: unknown,
): NotificationPreferences | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const allowed = categoriesFor(role) as string[];
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return null;
  if (entries.some(([key, enabled]) => !allowed.includes(key) || typeof enabled !== "boolean")) {
    return null;
  }
  return Object.fromEntries(entries) as NotificationPreferences;
}

export interface NotificationPreferenceStore {
  get(userId: ObjectId): Promise<NotificationPreferences | undefined>;
  update(userId: ObjectId, changes: NotificationPreferences, now: Date): Promise<boolean>;
}

export class MongoNotificationPreferenceStore implements NotificationPreferenceStore {
  constructor(private readonly db: Db) {}

  async get(userId: ObjectId): Promise<NotificationPreferences | undefined> {
    const user = await this.db
      .collection<UserDocument>(COLLECTIONS.users)
      .findOne({ _id: userId }, { projection: { notificationPreferences: 1 } });
    return user?.notificationPreferences;
  }

  async update(userId: ObjectId, changes: NotificationPreferences, now: Date): Promise<boolean> {
    const set: Record<string, unknown> = { updatedAt: now };
    for (const [key, enabled] of Object.entries(changes)) {
      set[`notificationPreferences.${key}`] = enabled;
    }
    const result = await this.db
      .collection<UserDocument>(COLLECTIONS.users)
      .updateOne({ _id: userId, status: "active" }, { $set: set });
    return result.matchedCount === 1;
  }
}

/**
 * Wraps a notifier's create function so a muted category is skipped before
 * anything is stored or pushed. Returns null when the notification was muted.
 */
export function respectingPreferences<T>(
  preferences: Pick<NotificationPreferenceStore, "get">,
  create: (notification: NewNotification) => Promise<T>,
): (notification: NewNotification) => Promise<T | null> {
  return async (notification) => {
    if (categoryOf(notification.type) !== null) {
      const stored = await preferences.get(notification.recipientUserId);
      if (isMuted(stored, notification.type)) return null;
    }
    return create(notification);
  };
}
