import type { ObjectId } from "mongodb";

export const NOTIFICATION_LIST_LIMIT = 100;

/** Customer identity is global; staff notification access is constrained to one tenant. */
export type NotificationRecipientScope =
  | { kind: "customer"; userId: ObjectId }
  | { kind: "staff"; userId: ObjectId; restaurantId: ObjectId };

export interface NewNotification {
  restaurantId: ObjectId;
  recipientUserId: ObjectId;
  type: string;
  title: string;
  body: string;
  relatedEntity?: { type: string; id: ObjectId };
}

/** Safe API representation; deliberately excludes recipientUserId. */
export interface NotificationRecord {
  id: ObjectId;
  restaurantId: ObjectId;
  type: string;
  title: string;
  body: string;
  relatedEntity?: { type: string; id: ObjectId };
  createdAt: Date;
  deliveredAt: Date | null;
  readAt: Date | null;
}

export interface NotificationPage {
  notifications: NotificationRecord[];
  unreadCount: number;
  truncated: boolean;
}

export interface NotificationListResult {
  notifications: NotificationRecord[];
  truncated: boolean;
}

export interface NotificationRepository {
  create(notification: NewNotification, now: Date): Promise<NotificationRecord>;
  listForRecipient(
    scope: NotificationRecipientScope,
    limit: number,
  ): Promise<NotificationListResult>;
  countUnread(scope: NotificationRecipientScope): Promise<number>;
  markRead(
    scope: NotificationRecipientScope,
    notificationId: ObjectId,
    readAt: Date,
  ): Promise<NotificationRecord | null>;
  markDelivered(
    scope: NotificationRecipientScope,
    notificationId: ObjectId,
    deliveredAt: Date,
  ): Promise<NotificationRecord | null>;
}

export interface NotificationServiceReader {
  create(notification: NewNotification): Promise<NotificationRecord>;
  list(scope: NotificationRecipientScope): Promise<NotificationPage>;
  markRead(
    scope: NotificationRecipientScope,
    notificationId: ObjectId,
  ): Promise<NotificationRecord>;
}
