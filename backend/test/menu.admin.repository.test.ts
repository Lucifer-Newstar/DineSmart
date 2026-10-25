import assert from "node:assert/strict";
import { test } from "node:test";
import { type Db, ObjectId } from "mongodb";
import { COLLECTIONS, type MenuItemDocument } from "../src/database/schema.js";
import { MongoMenuRepository } from "../src/menu/menu.repository.js";
import { MANAGED_MENU_LIMIT, type MenuItemInput } from "../src/menu/menu.types.js";

const now = new Date("2026-10-25T12:00:00.000Z");
const earlier = new Date("2026-10-20T08:00:00.000Z");
const restaurantId = new ObjectId("710000000000000000000001");

interface Call {
  method: string;
  args: unknown[];
}

function storedItem(
  overrides: Partial<MenuItemDocument> = {},
): MenuItemDocument & { _id: ObjectId } {
  return {
    _id: new ObjectId("71000000000000000000000c"),
    restaurantId,
    category: "South Indian",
    name: "Ghee podi dosa",
    description: "Crisp dosa, house podi.",
    priceMinor: 28_500,
    isAvailable: true,
    dietaryLabels: ["vegetarian"],
    allergenLabels: ["dairy"],
    createdAt: earlier,
    updatedAt: earlier,
    ...overrides,
  };
}

function fakeDb(handlers: Record<string, (...args: unknown[]) => unknown>): {
  db: Db;
  calls: Call[];
} {
  const calls: Call[] = [];
  const collection = new Proxy(
    {},
    {
      get(_target, method: string) {
        return (...args: unknown[]) => {
          calls.push({ method, args });
          const handler = handlers[method];
          if (!handler) throw new Error(`unexpected ${method}`);
          return handler(...args);
        };
      },
    },
  );
  const db = {
    collection(name: string) {
      if (name !== COLLECTIONS.menuItems && name !== COLLECTIONS.restaurants) {
        throw new Error(`unexpected collection ${name}`);
      }
      return collection;
    },
  } as unknown as Db;
  return { db, calls };
}

const input: MenuItemInput = {
  name: "Mysore masala dosa",
  description: "Red chutney, potato masala.",
  category: "South Indian",
  priceMinor: 31_000,
  isAvailable: true,
  dietaryLabels: ["vegetarian"],
  allergenLabels: [],
};

test("createItem inserts a tenant-scoped live item and returns it with its new id", async () => {
  const insertedId = new ObjectId();
  const { db, calls } = fakeDb({ insertOne: async () => ({ insertedId }) });

  const item = await new MongoMenuRepository(db).createItem(restaurantId, input, now);

  assert.equal(calls.length, 1);
  const document = calls[0]?.args[0] as MenuItemDocument;
  assert.deepEqual(document, {
    restaurantId,
    category: "South Indian",
    name: "Mysore masala dosa",
    description: "Red chutney, potato masala.",
    priceMinor: 31_000,
    isAvailable: true,
    dietaryLabels: ["vegetarian"],
    allergenLabels: [],
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  assert.equal(item.id, insertedId);
  assert.equal(item.name, "Mysore masala dosa");
  assert.equal(item.updatedAt, now);
});

test("createItem leaves the description out when none is given", async () => {
  const { db, calls } = fakeDb({ insertOne: async () => ({ insertedId: new ObjectId() }) });
  const { description: _unused, ...withoutDescription } = input;

  const item = await new MongoMenuRepository(db).createItem(restaurantId, withoutDescription, now);

  assert.equal(Object.hasOwn(calls[0]?.args[0] as object, "description"), false);
  assert.equal("description" in item, false);
});

test("updateItem sets only the given fields on a live item of the same tenant", async () => {
  const itemId = new ObjectId("71000000000000000000000c");
  const { db, calls } = fakeDb({
    findOneAndUpdate: async () => storedItem({ priceMinor: 30_000, updatedAt: now }),
  });

  const item = await new MongoMenuRepository(db).updateItem(
    restaurantId,
    itemId,
    { priceMinor: 30_000 },
    now,
  );

  const [filter, update, options] = calls[0]?.args ?? [];
  assert.deepEqual(filter, { _id: itemId, restaurantId, archivedAt: null });
  assert.deepEqual(update, { $set: { updatedAt: now, priceMinor: 30_000 } });
  assert.deepEqual(options, { returnDocument: "after" });
  assert.equal(item?.priceMinor, 30_000);
});

test("updateItem clears the description when it is set to null", async () => {
  const { db, calls } = fakeDb({ findOneAndUpdate: async () => storedItem() });

  await new MongoMenuRepository(db).updateItem(
    restaurantId,
    new ObjectId(),
    { name: "Podi dosa", description: null },
    now,
  );

  assert.deepEqual(calls[0]?.args[1], {
    $set: { updatedAt: now, name: "Podi dosa" },
    $unset: { description: "" },
  });
});

test("updateItem and archiveItem answer null for a missing, archived or foreign item", async () => {
  const { db } = fakeDb({ findOneAndUpdate: async () => null });
  const repository = new MongoMenuRepository(db);

  assert.equal(await repository.updateItem(restaurantId, new ObjectId(), { name: "X" }, now), null);
  assert.equal(await repository.archiveItem(restaurantId, new ObjectId(), now), null);
});

test("archiveItem hides the item, stops it being orderable and returns it as it was", async () => {
  const itemId = new ObjectId("71000000000000000000000c");
  const { db, calls } = fakeDb({ findOneAndUpdate: async () => storedItem() });

  const previous = await new MongoMenuRepository(db).archiveItem(restaurantId, itemId, now);

  const [filter, update, options] = calls[0]?.args ?? [];
  assert.deepEqual(filter, { _id: itemId, restaurantId, archivedAt: null });
  assert.deepEqual(update, { $set: { archivedAt: now, isAvailable: false, updatedAt: now } });
  assert.deepEqual(options, { returnDocument: "before" });
  assert.equal(previous?.isAvailable, true);
  assert.equal(previous?.name, "Ghee podi dosa");
});

test("listManagedItems includes sold-out items, skips archived ones and is bounded", async () => {
  const documents = Array.from({ length: MANAGED_MENU_LIMIT + 1 }, (_, index) =>
    storedItem({ _id: new ObjectId(), isAvailable: index % 2 === 0 }),
  );
  let limit = 0;
  const { db, calls } = fakeDb({
    find: () => ({
      sort() {
        return this;
      },
      limit(value: number) {
        limit = value;
        return this;
      },
      async toArray() {
        return documents.slice(0, limit);
      },
    }),
  });

  const result = await new MongoMenuRepository(db).listManagedItems(restaurantId);

  assert.deepEqual(calls[0]?.args[0], { restaurantId, archivedAt: null });
  assert.equal(limit, MANAGED_MENU_LIMIT + 1);
  assert.equal(result.items.length, MANAGED_MENU_LIMIT);
  assert.equal(result.truncated, true);
  assert.ok(result.items.some((item) => !item.isAvailable));
});

test("findManagedItem is tenant scoped and ignores archived items", async () => {
  const itemId = new ObjectId();
  const { db, calls } = fakeDb({ findOne: async () => null });

  assert.equal(await new MongoMenuRepository(db).findManagedItem(restaurantId, itemId), null);
  assert.deepEqual(calls[0]?.args[0], { _id: itemId, restaurantId, archivedAt: null });
});
