import assert from "node:assert/strict";
import { test } from "node:test";
import { type Db, ObjectId } from "mongodb";
import {
  COLLECTIONS,
  type MenuItemDocument,
  type RestaurantDocument,
} from "../src/database/schema.js";
import { MongoMenuRepository, PUBLIC_MENU_LIMIT } from "../src/menu/menu.repository.js";

const now = new Date("2026-10-11T06:00:00.000Z");

test("public menu repository returns active available items with restaurant currency", async () => {
  const restaurantId = new ObjectId();
  const itemId = new ObjectId();
  const restaurant = {
    _id: restaurantId,
    name: "Saffron & Co.",
    timezone: "Asia/Kolkata",
    currency: "INR",
    status: "active",
    createdAt: now,
    updatedAt: now,
  } satisfies RestaurantDocument & { _id: ObjectId };
  const item = {
    _id: itemId,
    restaurantId,
    category: "Tiffin",
    name: "Ghee podi dosa",
    description: "Crisp dosa and house podi.",
    priceMinor: 28_500,
    isAvailable: true,
    dietaryLabels: ["vegetarian"],
    allergenLabels: ["dairy"],
    createdAt: now,
    updatedAt: now,
  } satisfies MenuItemDocument & { _id: ObjectId };
  const queries: Array<{ collection: string; filter: Record<string, unknown> }> = [];
  const db = {
    collection(name: string) {
      return {
        async findOne(filter: Record<string, unknown>, options: Record<string, unknown>) {
          queries.push({ collection: name, filter });
          assert.deepEqual(options, {
            projection: { _id: 1, name: 1, currency: 1, menuCategoryOrder: 1 },
          });
          return restaurant;
        },
        find(filter: Record<string, unknown>) {
          queries.push({ collection: name, filter });
          return {
            sort(specification: Record<string, 1>) {
              assert.deepEqual(specification, { sortPosition: 1, name: 1, _id: 1 });
              return this;
            },
            limit(value: number) {
              assert.equal(value, PUBLIC_MENU_LIMIT + 1);
              return this;
            },
            async toArray() {
              return [item];
            },
          };
        },
      };
    },
  } as unknown as Db;

  const result = await new MongoMenuRepository(db).getAvailableMenu(restaurantId);
  assert.equal(result?.restaurant.id, restaurantId);
  assert.equal(result?.restaurant.name, "Saffron & Co.");
  assert.equal(result?.restaurant.currency, "INR");
  assert.deepEqual(result?.items, [
    {
      id: itemId,
      name: "Ghee podi dosa",
      description: "Crisp dosa and house podi.",
      category: "Tiffin",
      priceMinor: 28_500,
      isAvailable: true,
      dietaryLabels: ["vegetarian"],
      allergenLabels: ["dairy"],
    },
  ]);
  assert.deepEqual(result?.categories, ["Tiffin"]);
  assert.equal(result?.truncated, false);
  assert.deepEqual(queries, [
    { collection: COLLECTIONS.restaurants, filter: { _id: restaurantId, status: "active" } },
    {
      collection: COLLECTIONS.menuItems,
      filter: { restaurantId, archivedAt: null },
    },
  ]);
});

test("public menu results are bounded and expose truncation", async () => {
  const restaurantId = new ObjectId();
  const restaurant = {
    _id: restaurantId,
    name: "Saffron & Co.",
    timezone: "Asia/Kolkata",
    currency: "INR",
    status: "active",
    createdAt: now,
    updatedAt: now,
  } satisfies RestaurantDocument & { _id: ObjectId };
  const items = Array.from({ length: PUBLIC_MENU_LIMIT + 1 }, (_, index) => ({
    _id: new ObjectId(),
    restaurantId,
    category: "Mains",
    name: `Item ${index}`,
    priceMinor: 10_000,
    isAvailable: true,
    createdAt: now,
    updatedAt: now,
  })) satisfies Array<MenuItemDocument & { _id: ObjectId }>;
  const db = {
    collection(name: string) {
      return {
        async findOne() {
          return restaurant;
        },
        find() {
          return {
            sort() {
              return this;
            },
            limit() {
              return this;
            },
            async toArray() {
              return name === COLLECTIONS.menuItems ? items : [];
            },
          };
        },
      };
    },
  } as unknown as Db;

  const result = await new MongoMenuRepository(db).getAvailableMenu(restaurantId);
  assert.equal(result?.items.length, PUBLIC_MENU_LIMIT);
  assert.equal(result?.truncated, true);
});

test("an inactive restaurant has no public menu", async () => {
  let menuRead = false;
  const db = {
    collection(name: string) {
      return {
        async findOne() {
          return null;
        },
        find() {
          menuRead = name === COLLECTIONS.menuItems;
          throw new Error("An inactive restaurant must not read the menu collection.");
        },
      };
    },
  } as unknown as Db;

  const result = await new MongoMenuRepository(db).getAvailableMenu(new ObjectId());
  assert.equal(result, null);
  assert.equal(menuRead, false);
});
