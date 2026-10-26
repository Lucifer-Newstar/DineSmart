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

/**
 * Feed reads return only the fields the record mapper needs, which keeps the
 * restricted recipient feed off the wire and lets the driver avoid shipping
 * unused document fields.
 */
const NOTIFICATION_PROJECTION = {
  _id: 1,
  restaurantId: 1,
  type: 1,
  title: 1,
  body: 1,
  relatedEntity: 1,
  createdAt: 1,
  deliveredAt: 1,
  readAt: 1,
} as const;

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
      deliveredAt: null,
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
      .find(recipientFilter(scope), { projection: NOTIFICATION_PROJECTION })
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

  async markAllRead(scope: NotificationRecipientScope, readAt: Date): Promise<number> {
    const result = await this.notifications.updateMany(
      { ...recipientFilter(scope), readAt: null },
      { $set: { readAt, updatedAt: readAt } },
    );
    return result.modifiedCount;
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
    const document = await this.notifications.findOne(filter, {
      projection: NOTIFICATION_PROJECTION,
    });
    return document ? toRecord(document) : null;
  }

  async markDelivered(
    scope: NotificationRecipientScope,
    notificationId: ObjectId,
    deliveredAt: Date,
  ): Promise<NotificationRecord | null> {
    const filter = { ...recipientFilter(scope), _id: notificationId };
    await this.notifications.updateOne(
      { ...filter, deliveredAt: null },
      { $set: { deliveredAt, updatedAt: deliveredAt } },
    );
    const document = await this.notifications.findOne(filter, {
      projection: NOTIFICATION_PROJECTION,
    });
    return document ? toRecord(document) : null;
  }
}
