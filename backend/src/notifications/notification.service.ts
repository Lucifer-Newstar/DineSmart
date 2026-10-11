import { ObjectId } from "mongodb";
import {
  type NewNotification,
  NOTIFICATION_LIST_LIMIT,
  type NotificationRecipientScope,
  type NotificationRecord,
  type NotificationRepository,
  type NotificationServiceReader,
} from "./notification.types.js";

export const NOTIFICATION_TYPE_MAX_LENGTH = 80;
export const NOTIFICATION_TITLE_MAX_LENGTH = 160;
export const NOTIFICATION_BODY_MAX_LENGTH = 2_000;

export class NotificationError extends Error {
  constructor(
    readonly statusCode: 400 | 404,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NotificationError";
  }
}

function normalizedText(value: string, maxLength: number, field: string): string {
  if (typeof value !== "string") {
    throw new NotificationError(400, "invalid_notification", `${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new NotificationError(
      400,
      "invalid_notification",
      `${field} must contain 1 to ${maxLength} characters.`,
    );
  }
  return normalized;
}

function normalizeNewNotification(notification: NewNotification): NewNotification {
  if (
    !(notification.restaurantId instanceof ObjectId) ||
    !(notification.recipientUserId instanceof ObjectId)
  ) {
    throw new NotificationError(
      400,
      "invalid_notification",
      "Valid notification IDs are required.",
    );
  }

  if (notification.relatedEntity !== undefined) {
    if (!notification.relatedEntity || !(notification.relatedEntity.id instanceof ObjectId)) {
      throw new NotificationError(
        400,
        "invalid_notification",
        "The related entity must include a valid ID.",
      );
    }
  }

  return {
    restaurantId: notification.restaurantId,
    recipientUserId: notification.recipientUserId,
    type: normalizedText(notification.type, NOTIFICATION_TYPE_MAX_LENGTH, "Type"),
    title: normalizedText(notification.title, NOTIFICATION_TITLE_MAX_LENGTH, "Title"),
    body: normalizedText(notification.body, NOTIFICATION_BODY_MAX_LENGTH, "Body"),
    ...(notification.relatedEntity
      ? {
          relatedEntity: {
            type: normalizedText(
              notification.relatedEntity.type,
              NOTIFICATION_TYPE_MAX_LENGTH,
              "Related entity type",
            ),
            id: notification.relatedEntity.id,
          },
        }
      : {}),
  };
}

export class NotificationService implements NotificationServiceReader {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async create(notification: NewNotification): Promise<NotificationRecord> {
    return this.repository.create(normalizeNewNotification(notification), this.clock());
  }

  async list(scope: NotificationRecipientScope) {
    const [page, unreadCount] = await Promise.all([
      this.repository.listForRecipient(scope, NOTIFICATION_LIST_LIMIT),
      this.repository.countUnread(scope),
    ]);
    return { ...page, unreadCount };
  }

  async markRead(
    scope: NotificationRecipientScope,
    notificationId: ObjectId,
  ): Promise<NotificationRecord> {
    const notification = await this.repository.markRead(scope, notificationId, this.clock());
    if (!notification) {
      throw new NotificationError(404, "notification_not_found", "The notification was not found.");
    }
    return notification;
  }
}
