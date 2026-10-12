import assert from "node:assert/strict";
import { test } from "node:test";
import { type Db, type Document, ObjectId } from "mongodb";
import { MongoRecommendationRepository } from "../src/ai/recommendation.repository.js";
import { COLLECTIONS } from "../src/database/schema.js";
import { MongoInventoryRepository } from "../src/inventory/inventory.repository.js";
import { MongoNotificationRepository } from "../src/notifications/notification.repository.js";

interface CapturedQuery {
  collection: string;
  filter: Document;
  options: Document | undefined;
}

function recordingDb(rows: Array<Document & { _id: ObjectId }>): {
  db: Db;
  queries: CapturedQuery[];
} {
  const queries: CapturedQuery[] = [];

  const collection = (name: string) => ({
    find(filter: Document, options?: Document) {
      queries.push({ collection: name, filter, options });
      return {
        sort() {
          return this;
        },
        limit() {
          return this;
        },
        async toArray() {
          return rows;
        },
      };
    },
    async findOne(filter: Document, options?: Document) {
      queries.push({ collection: name, filter, options });
      return rows[0] ?? null;
    },
    async countDocuments(filter: Document) {
      queries.push({ collection: name, filter, options: undefined });
      return rows.length;
    },
    async updateOne() {
      return { matchedCount: 1 };
    },
    async insertOne(document: Document) {
      return { acknowledged: true, insertedId: document._id as ObjectId };
    },
    async findOneAndUpdate() {
      return rows[0] ?? null;
    },
  });

  return { db: { collection } as unknown as Db, queries };
}

function projectionOf(query: CapturedQuery | undefined): Document {
  const projection = query?.options?.projection;
  assert.ok(
    projection && typeof projection === "object",
    `${query?.collection ?? "query"} read must request an explicit projection`,
  );
  return projection as Document;
}

test("notification feed reads request only the serialized notification fields", async () => {
  const now = new Date("2026-10-12T09:00:00.000Z");
  const { db, queries } = recordingDb([
    {
      _id: new ObjectId(),
      restaurantId: new ObjectId(),
      recipientUserId: new ObjectId(),
      type: "incident",
      title: "Low stock",
      body: "Paneer is below threshold",
      createdAt: now,
      deliveredAt: null,
      readAt: null,
      updatedAt: now,
    },
  ]);
  const repository = new MongoNotificationRepository(db);

  await repository.listForRecipient(
    { kind: "staff", userId: new ObjectId(), restaurantId: new ObjectId() },
    20,
  );
  await repository.markRead(
    { kind: "staff", userId: new ObjectId(), restaurantId: new ObjectId() },
    new ObjectId(),
    now,
  );

  const listQuery = queries.find((query) => query.collection === COLLECTIONS.notifications);
  assert.deepEqual(Object.keys(projectionOf(listQuery)).sort(), [
    "_id",
    "body",
    "createdAt",
    "deliveredAt",
    "readAt",
    "relatedEntity",
    "restaurantId",
    "title",
    "type",
  ]);
  assert.ok(queries.length >= 2);
  for (const query of queries) assert.ok(projectionOf(query).recipientUserId === undefined);
});

test("inventory reads project the dashboard stock fields", async () => {
  const { db, queries } = recordingDb([
    {
      _id: new ObjectId(),
      restaurantId: new ObjectId(),
      name: "Paneer",
      quantity: 2.4,
      unit: "kg",
      lowStockThreshold: 4,
      lastAdjustedAt: new Date(),
    },
  ]);
  const repository = new MongoInventoryRepository(db);

  await repository.listForRestaurant(new ObjectId());
  await repository.adjustItem(new ObjectId(), new ObjectId(), {
    quantity: 8,
    adjustedAt: new Date(),
  });

  assert.equal(queries.length, 2);
  for (const query of queries) {
    assert.equal(query.collection, COLLECTIONS.inventoryItems);
    assert.deepEqual(Object.keys(projectionOf(query)).sort(), [
      "_id",
      "lastAdjustedAt",
      "lowStockThreshold",
      "name",
      "quantity",
      "restaurantId",
      "unit",
    ]);
  }
});

test("recommendation reads project only the advisory response fields", async () => {
  const { db, queries } = recordingDb([
    {
      _id: new ObjectId(),
      restaurantId: new ObjectId(),
      incidentId: new ObjectId(),
      summary: "Reorder paneer",
      rootCause: "Stock below threshold",
      priority: "medium",
      actions: ["Reorder"],
      confidence: 0.6,
      source: "fallback",
      provider: "rules",
      generatedAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  const repository = new MongoRecommendationRepository(db);

  await repository.listForRestaurant(new ObjectId());
  await repository.listForRestaurant(new ObjectId(), new ObjectId());

  assert.equal(queries.length, 2);
  for (const query of queries) {
    assert.equal(query.collection, COLLECTIONS.recommendations);
    assert.deepEqual(Object.keys(projectionOf(query)).sort(), [
      "_id",
      "actions",
      "confidence",
      "generatedAt",
      "incidentId",
      "priority",
      "provider",
      "rootCause",
      "source",
      "summary",
    ]);
  }
});
