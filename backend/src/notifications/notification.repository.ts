import { type Db, type Filter, ObjectId } from "mongodb";
import { COLLECTIONS, type NotificationDocument } from "../database/schema.js";
import type {
  NewNotification,
  NotificationListResult,
  NotificationRecipientScope,
  NotificationRecord,
  NotificationRepository,
} from "./notification.types.js";

function toRecord(document: NotificationDocument & { _id: ObjectId }): NotificationRecord {
  return {
    id: document._id,
    restaurantId: document.restaurantId,
    type: document.type,
    title: document.title,
    body: document.body,
    ...(document.relatedEntity ? { relatedEntity: document.relatedEntity } : {}),
    createdAt: document.createdAt,
    deliveredAt: document.deliveredAt ?? null,
    readAt: document.readAt ?? null,
  };
}

function recipientFilter(scope: NotificationRecipientScope): Filter<NotificationDocument> {
  if (scope.kind === "customer") return { recipientUserId: scope.userId };
  return { recipientUserId: scope.userId, restaurantId: scope.restaurantId };
}

export class MongoNotificationRepository implements NotificationRepository {
  private readonly notifications;

  constructor(db: Db) {
    this.notifications = db.collection<NotificationDocument>(COLLECTIONS.notifications);
  }

  async create(notification: NewNotification, now: Date): Promise<NotificationRecord> {
    const document: NotificationDocument & { _id: ObjectId } = {
      ...notification,
      _id: new ObjectId(),
      readAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.notifications.insertOne(document);
    return toRecord(document);
  }

  async listForRecipient(
    scope: NotificationRecipientScope,
    limit: number,
  ): Promise<NotificationListResult> {
    const documents = await this.notifications
      .find(recipientFilter(scope))
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .toArray();
    return {
      notifications: documents.slice(0, limit).map((document) => toRecord(document)),
      truncated: documents.length > limit,
    };
  }

  countUnread(scope: NotificationRecipientScope): Promise<number> {
    return this.notifications.countDocuments({ ...recipientFilter(scope), readAt: null });
  }

  async markRead(
    scope: NotificationRecipientScope,
    notificationId: ObjectId,
    readAt: Date,
  ): Promise<NotificationRecord | null> {
    const filter = { ...recipientFilter(scope), _id: notificationId };
    await this.notifications.updateOne(
      { ...filter, readAt: null },
      { $set: { readAt, updatedAt: readAt } },
    );
    const document = await this.notifications.findOne(filter);
    return document ? toRecord(document) : null;
  }
}
