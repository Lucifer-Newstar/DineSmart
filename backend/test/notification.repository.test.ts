import assert from "node:assert/strict";
import { test } from "node:test";
import { type Db, type Filter, ObjectId, type Sort, type UpdateFilter } from "mongodb";
import { COLLECTIONS, type NotificationDocument } from "../src/database/schema.js";
import { MongoNotificationRepository } from "../src/notifications/notification.repository.js";
import type { NotificationRecipientScope } from "../src/notifications/notification.types.js";

interface TestCursor {
  sort(value: Sort): TestCursor;
  limit(value: number): TestCursor;
  toArray(): Promise<Array<NotificationDocument & { _id: ObjectId }>>;
}

function harness(seed: (NotificationDocument & { _id: ObjectId }) | null = null) {
  const calls: {
    collectionName?: string;
    inserted?: NotificationDocument & { _id: ObjectId };
    findFilter?: Filter<NotificationDocument>;
    sort?: Sort;
    limit?: number;
    countFilter?: Filter<NotificationDocument>;
    updateFilter?: Filter<NotificationDocument>;
    update?: UpdateFilter<NotificationDocument>;
  } = {};
  let current = seed;
  let cursor: TestCursor;
  cursor = {
    sort(value) {
      calls.sort = value;
      return cursor;
    },
    limit(value) {
      calls.limit = value;
      return cursor;
    },
    async toArray() {
      return current ? [current] : [];
    },
  };

  const collection = {
    async insertOne(document: NotificationDocument & { _id: ObjectId }) {
      calls.inserted = document;
      current = document;
      return { acknowledged: true, insertedId: document._id };
    },
    find(filter: Filter<NotificationDocument>) {
      calls.findFilter = filter;
      return cursor;
    },
    async countDocuments(filter: Filter<NotificationDocument>) {
      calls.countFilter = filter;
      return 3;
    },
    async updateOne(
      filter: Filter<NotificationDocument>,
      update: UpdateFilter<NotificationDocument>,
    ) {
      calls.updateFilter = filter;
      calls.update = update;
      if (current && current.readAt == null) {
        current = { ...current, ...update.$set } as NotificationDocument & { _id: ObjectId };
        return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
      }
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    },
    async findOne(_filter: Filter<NotificationDocument>) {
      return current;
    },
  };
  const db = {
    collection(name: string) {
      calls.collectionName = name;
      return collection;
    },
  } as unknown as Db;
  return { repository: new MongoNotificationRepository(db), calls };
}

function notificationDocument(
  recipientUserId: ObjectId,
  restaurantId: ObjectId,
): NotificationDocument & { _id: ObjectId } {
  const now = new Date("2026-10-11T09:00:00.000Z");
  return {
    _id: new ObjectId(),
    restaurantId,
    recipientUserId,
    type: "incident.critical",
    title: "Low stock",
    body: "Paneer is below threshold.",
    createdAt: now,
    updatedAt: now,
    readAt: null,
  };
}

test("Mongo repository inserts server-created notifications as unread", async () => {
  const { repository, calls } = harness();
  const userId = new ObjectId();
  const restaurantId = new ObjectId();
  const createdAt = new Date("2026-10-11T09:00:00.000Z");
  const result = await repository.create(
    {
      restaurantId,
      recipientUserId: userId,
      type: "incident.critical",
      title: "Low stock",
      body: "Paneer is below threshold.",
    },
    createdAt,
  );

  assert.equal(calls.collectionName, COLLECTIONS.notifications);
  assert.ok(calls.inserted?._id instanceof ObjectId);
  assert.equal(calls.inserted?.readAt, null);
  assert.equal(calls.inserted?.createdAt, createdAt);
  assert.equal(calls.inserted?.deliveredAt, undefined);
  assert.equal(result.readAt, null);
  assert.equal("recipientUserId" in result, false);
});

test("Mongo repository scopes customer history by recipient across restaurants", async () => {
  const userId = new ObjectId();
  const restaurantId = new ObjectId();
  const document = notificationDocument(userId, restaurantId);
  const { repository, calls } = harness(document);
  const scope: NotificationRecipientScope = { kind: "customer", userId };

  const result = await repository.listForRecipient(scope, 100);

  assert.deepEqual(calls.findFilter, { recipientUserId: userId });
  assert.deepEqual(calls.sort, { createdAt: -1, _id: -1 });
  assert.equal(calls.limit, 101);
  assert.equal(result.notifications.length, 1);
  assert.equal(result.notifications[0]?.id, document._id);
  assert.equal(result.truncated, false);
});

test("Mongo repository scopes restaurant staff reads and unread count to the signed recipient", async () => {
  const userId = new ObjectId();
  const restaurantId = new ObjectId();
  const { repository, calls } = harness(notificationDocument(userId, restaurantId));
  const scope: NotificationRecipientScope = { kind: "staff", userId, restaurantId };

  await repository.listForRecipient(scope, 100);
  assert.deepEqual(calls.findFilter, { recipientUserId: userId, restaurantId });
  assert.equal(await repository.countUnread(scope), 3);
  assert.deepEqual(calls.countFilter, { recipientUserId: userId, restaurantId, readAt: null });
});

test("Mongo repository marks a scoped record read once and preserves the first timestamp", async () => {
  const userId = new ObjectId();
  const restaurantId = new ObjectId();
  const document = notificationDocument(userId, restaurantId);
  const { repository, calls } = harness(document);
  const scope: NotificationRecipientScope = { kind: "staff", userId, restaurantId };
  const firstReadAt = new Date("2026-10-11T09:05:00.000Z");

  const result = await repository.markRead(scope, document._id, firstReadAt);

  assert.deepEqual(calls.updateFilter, {
    recipientUserId: userId,
    restaurantId,
    _id: document._id,
    readAt: null,
  });
  assert.deepEqual(calls.update, { $set: { readAt: firstReadAt, updatedAt: firstReadAt } });
  assert.equal(result?.readAt, firstReadAt);

  const secondReadAt = new Date("2026-10-11T09:06:00.000Z");
  const repeated = await repository.markRead(scope, document._id, secondReadAt);
  assert.equal(repeated?.readAt, firstReadAt);
});

test("Mongo repository returns null rather than revealing a missing or out-of-scope record", async () => {
  const { repository } = harness();
  const result = await repository.markRead(
    {
      kind: "staff",
      userId: new ObjectId(),
      restaurantId: new ObjectId(),
    },
    new ObjectId(),
    new Date("2026-10-11T09:05:00.000Z"),
  );
  assert.equal(result, null);
});
