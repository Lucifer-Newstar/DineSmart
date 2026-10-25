import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import type { AuditChange } from "../src/audit/audit.service.js";
import type { AuthPrincipal } from "../src/auth/auth.service.js";
import { createMenuAdminRouter, parseMenuItemBody } from "../src/menu/menu.admin.router.js";
import { MenuAdminService } from "../src/menu/menu.service.js";
import {
  arrangeMenu,
  type ManagedMenuItem,
  type MenuAdminRepository,
  type MenuItemInput,
  type MenuItemPatch,
} from "../src/menu/menu.types.js";

const now = new Date("2026-10-25T12:00:00.000Z");
const RESTAURANT_A = "710000000000000000000001";
const RESTAURANT_B = "720000000000000000000001";
const MANAGER_ID = "710000000000000000000005";

const PRINCIPALS: Record<string, AuthPrincipal> = {
  manager: { userId: MANAGER_ID, role: "Manager", restaurantId: RESTAURANT_A },
  admin: { userId: MANAGER_ID, role: "Administrator", restaurantId: RESTAURANT_A },
  otherManager: { userId: MANAGER_ID, role: "Manager", restaurantId: RESTAURANT_B },
  reception: { userId: MANAGER_ID, role: "Reception", restaurantId: RESTAURANT_A },
  kitchen: { userId: MANAGER_ID, role: "Kitchen Staff", restaurantId: RESTAURANT_A },
  customer: { userId: MANAGER_ID, role: "Customer", restaurantId: null },
};

/** An in-memory repository with the same tenant and archive rules as the Mongo one. */
class MemoryMenuRepository implements MenuAdminRepository {
  readonly items = new Map<
    string,
    ManagedMenuItem & { restaurantId: string; archived: boolean; sortPosition?: number }
  >();
  categoryOrder: string[] = [];

  seed(restaurantId: string, name: string): ManagedMenuItem {
    const item = {
      id: new ObjectId(),
      name,
      category: "South Indian",
      priceMinor: 28_500,
      isAvailable: true,
      dietaryLabels: ["vegetarian"],
      allergenLabels: [],
      updatedAt: now,
      restaurantId,
      archived: false,
    };
    this.items.set(item.id.toHexString(), item);
    return item;
  }

  private live(restaurantId: ObjectId, itemId: ObjectId) {
    const item = this.items.get(itemId.toHexString());
    return item && !item.archived && item.restaurantId === restaurantId.toHexString()
      ? item
      : undefined;
  }

  async listManagedItems(restaurantId: ObjectId) {
    const live = [...this.items.values()]
      .filter((item) => !item.archived && item.restaurantId === restaurantId.toHexString())
      .sort((left, right) => (left.sortPosition ?? 0) - (right.sortPosition ?? 0));
    return { ...arrangeMenu(live, this.categoryOrder), truncated: false };
  }

  async findManagedItem(restaurantId: ObjectId, itemId: ObjectId) {
    const item = this.live(restaurantId, itemId);
    return item ? { ...item } : null;
  }

  async createItem(restaurantId: ObjectId, input: MenuItemInput, at: Date) {
    const item = {
      id: new ObjectId(),
      ...input,
      updatedAt: at,
      restaurantId: restaurantId.toHexString(),
      archived: false,
    };
    this.items.set(item.id.toHexString(), item);
    return item;
  }

  async updateItem(restaurantId: ObjectId, itemId: ObjectId, patch: MenuItemPatch, at: Date) {
    const item = this.live(restaurantId, itemId);
    if (!item) return null;
    // Like the Mongo repository: undefined leaves a field alone, null removes it.
    const fields = item as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) delete fields[key];
      else if (value !== undefined) fields[key] = value;
    }
    item.updatedAt = at;
    return { ...item };
  }

  async setAvailability(restaurantId: ObjectId, itemId: ObjectId, isAvailable: boolean, at: Date) {
    const item = this.live(restaurantId, itemId);
    if (!item) return null;
    const previous = { ...item };
    item.isAvailable = isAvailable;
    item.updatedAt = at;
    return previous;
  }

  async arrange(restaurantId: ObjectId, categories: string[], itemIds: ObjectId[]) {
    this.categoryOrder = categories;
    itemIds.forEach((itemId, index) => {
      const item = this.live(restaurantId, itemId);
      if (item) item.sortPosition = index;
    });
  }

  async archiveItem(restaurantId: ObjectId, itemId: ObjectId) {
    const item = this.live(restaurantId, itemId);
    if (!item) return null;
    const previous = { ...item };
    item.archived = true;
    item.isAvailable = false;
    return previous;
  }
}

async function withApi(
  run: (
    call: CallApi,
    context: { repository: MemoryMenuRepository; audit: AuditChange[] },
  ) => Promise<void>,
  options: { failAudit?: boolean } = {},
): Promise<void> {
  const repository = new MemoryMenuRepository();
  const audit: AuditChange[] = [];
  const service = new MenuAdminService(
    repository,
    () => now,
    async (change) => {
      if (options.failAudit) throw new Error("audit store down");
      audit.push(change);
    },
  );
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/menu/items",
    createMenuAdminRouter({
      createRuntime: async () => ({
        service,
        verifyAccessToken: async (token) => {
          const principal = PRINCIPALS[token];
          if (!principal) throw new Error("bad token");
          return principal;
        },
      }),
    }),
  );
  const server: Server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const call: CallApi = async (method, path, who, body) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/menu/items${path}`, {
      method,
      headers: {
        ...(who ? { authorization: `Bearer ${who}` } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  try {
    await run(call, { repository, audit });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// Responses are asserted field by field, so the body is left loosely typed.
// biome-ignore lint/suspicious/noExplicitAny: JSON test payloads
type ApiBody = any;

type CallApi = (
  method: string,
  path: string,
  who: string | null,
  body?: unknown,
) => Promise<{ status: number; body: ApiBody }>;

const newItem = {
  name: "  Mysore   masala dosa ",
  category: "South Indian",
  priceMinor: 31_000,
  description: "Red chutney, potato masala.",
  dietaryLabels: ["vegetarian", "vegetarian"],
  allergenLabels: ["Dairy", " nuts "],
};

test("a manager creates an item; the body is normalised and the change is audited", async () => {
  await withApi(async (call, { audit }) => {
    const response = await call("POST", "/", "manager", newItem);

    assert.equal(response.status, 201);
    assert.equal(response.body.item.name, "Mysore masala dosa");
    assert.equal(response.body.item.isAvailable, true);
    assert.deepEqual(response.body.item.dietaryLabels, ["vegetarian"]);
    assert.deepEqual(response.body.item.allergenLabels, ["dairy", "nuts"]);
    assert.match(response.body.item.id, /^[a-f\d]{24}$/);
    assert.equal(audit.length, 1);
    assert.equal(audit[0]?.action, "menu.item_created");
    assert.equal(audit[0]?.restaurantId.toHexString(), RESTAURANT_A);
    assert.equal(audit[0]?.after.priceMinor, 31_000);
  });
});

test("only Managers and Administrators may read or change the managed menu", async () => {
  await withApi(async (call) => {
    assert.equal((await call("GET", "/", null)).status, 401);
    for (const who of ["reception", "kitchen", "customer"]) {
      assert.equal((await call("GET", "/", who)).status, 403, who);
      assert.equal((await call("POST", "/", who, newItem)).status, 403, who);
    }
    assert.equal((await call("GET", "/", "admin")).status, 200);
  });
});

test("create rejects a missing name, a bad price, unknown labels and unknown fields", async () => {
  await withApi(async (call, { repository }) => {
    const invalid: unknown[] = [
      { ...newItem, name: "   " },
      { ...newItem, name: "x".repeat(81) },
      { ...newItem, priceMinor: -100 },
      { ...newItem, priceMinor: 0 },
      { ...newItem, priceMinor: 12.5 },
      { ...newItem, priceMinor: "310" },
      { ...newItem, priceMinor: 10_000_001 },
      { ...newItem, category: "" },
      { ...newItem, dietaryLabels: ["keto"] },
      { ...newItem, allergenLabels: Array.from({ length: 11 }, (_, index) => `a${index}`) },
      { ...newItem, isAvailable: "yes" },
      [],
    ];
    for (const body of invalid) {
      const response = await call("POST", "/", "manager", body);
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal(response.body.error.code, "invalid_menu_item");
    }
    assert.equal(repository.items.size, 0);
  });
});

test("an edit changes only the sent fields and can clear the description", async () => {
  await withApi(async (call, { repository, audit }) => {
    const item = repository.seed(RESTAURANT_A, "Ghee podi dosa");
    item.description = "Old copy.";

    const response = await call("PATCH", `/${item.id.toHexString()}`, "manager", {
      priceMinor: 30_000,
      description: null,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.item.priceMinor, 30_000);
    assert.equal(response.body.item.name, "Ghee podi dosa");
    assert.equal("description" in response.body.item, false);
    assert.equal(audit[0]?.action, "menu.item_updated");
    assert.equal(audit[0]?.before.priceMinor, 28_500);
    assert.equal(audit[0]?.after.priceMinor, 30_000);
  });
});

test("an edit cannot change availability or tenant, and an empty edit is rejected", async () => {
  await withApi(async (call, { repository }) => {
    const item = repository.seed(RESTAURANT_A, "Ghee podi dosa");
    for (const body of [{}, { isAvailable: false }]) {
      const response = await call("PATCH", `/${item.id.toHexString()}`, "manager", body);
      assert.equal(response.status, 400, JSON.stringify(body));
    }
    // A forged tenant in the body is refused by the shared restaurant-scope guard.
    const forged = await call("PATCH", `/${item.id.toHexString()}`, "manager", {
      restaurantId: RESTAURANT_B,
    });
    assert.equal(forged.status, 403);
    assert.equal(item.name, "Ghee podi dosa");
  });
});

test("writes are tenant scoped: another restaurant's item is not found", async () => {
  await withApi(async (call, { repository }) => {
    const item = repository.seed(RESTAURANT_A, "Ghee podi dosa");
    const path = `/${item.id.toHexString()}`;

    assert.equal((await call("PATCH", path, "otherManager", { priceMinor: 1 })).status, 404);
    assert.equal((await call("DELETE", path, "otherManager")).status, 404);
    assert.deepEqual((await call("GET", "/", "otherManager")).body.items, []);
    assert.equal(item.priceMinor, 28_500);
  });
});

test("archiving removes the item from the managed list and a second archive is 404", async () => {
  await withApi(async (call, { repository, audit }) => {
    const item = repository.seed(RESTAURANT_A, "Ghee podi dosa");
    repository.seed(RESTAURANT_A, "Filter coffee");
    const path = `/${item.id.toHexString()}`;

    assert.equal((await call("DELETE", path, "manager")).status, 204);
    const list = await call("GET", "/", "manager");
    assert.deepEqual(
      list.body.items.map((entry: { name: string }) => entry.name),
      ["Filter coffee"],
    );
    assert.equal((await call("DELETE", path, "manager")).status, 404);
    assert.equal((await call("PATCH", path, "manager", { name: "Back" })).status, 404);
    assert.equal(audit.filter((entry) => entry.action === "menu.item_archived").length, 1);
  });
});

test("malformed item ids answer the 400 contract", async () => {
  await withApi(async (call) => {
    const response = await call("DELETE", "/not-an-id", "manager");
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "invalid_menu_item_id");
  });
});

test("a failing audit store does not undo a saved change", async () => {
  await withApi(
    async (call, { repository }) => {
      const response = await call("POST", "/", "manager", newItem);
      assert.equal(response.status, 201);
      assert.equal(repository.items.size, 1);
    },
    { failAudit: true },
  );
});

test("parseMenuItemBody defaults new items to available with empty label lists", () => {
  const parsed = parseMenuItemBody({ name: "Idli", category: "Tiffin", priceMinor: 9_000 }, false);
  assert.deepEqual(parsed, {
    ok: true,
    value: {
      name: "Idli",
      category: "Tiffin",
      priceMinor: 9_000,
      dietaryLabels: [],
      allergenLabels: [],
      isAvailable: true,
    },
  });
});

test("a manager rearranges the menu; a stale or partial arrangement is refused", async () => {
  await withApi(async (call, { repository }) => {
    const dosa = repository.seed(RESTAURANT_A, "Ghee podi dosa");
    const coffee = repository.seed(RESTAURANT_A, "Filter coffee");
    coffee.category = "Drinks";
    const ids = [coffee.id.toHexString(), dosa.id.toHexString()];

    const saved = await call("PUT", "/arrangement", "manager", {
      categories: ["Drinks", "South Indian"],
      itemIds: ids,
    });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.categories, ["Drinks", "South Indian"]);
    assert.deepEqual(
      saved.body.items.map((item: { name: string }) => item.name),
      ["Filter coffee", "Ghee podi dosa"],
    );

    const stale = [
      { categories: ["Drinks", "South Indian"], itemIds: [ids[0]] },
      { categories: ["Drinks"], itemIds: ids },
      { categories: ["Drinks", "South Indian"], itemIds: [ids[0], ids[0]] },
      { categories: ["Drinks", "South Indian"], itemIds: [ids[0], new ObjectId().toHexString()] },
    ];
    for (const body of stale) {
      const response = await call("PUT", "/arrangement", "manager", body);
      assert.equal(response.status, 409, JSON.stringify(body));
      assert.equal(response.body.error.code, "menu_arrangement_stale");
    }
    for (const body of [
      {},
      { categories: "Drinks", itemIds: ids },
      { categories: [], itemIds: ["x"] },
    ]) {
      assert.equal((await call("PUT", "/arrangement", "manager", body)).status, 400);
    }
    assert.equal(
      (await call("PUT", "/arrangement", "reception", { categories: [], itemIds: [] })).status,
      403,
    );
  });
});

test("prep station and minutes are validated, stored and can be cleared", async () => {
  await withApi(async (call) => {
    const created = await call("POST", "/", "manager", {
      ...newItem,
      prepStation: "tawa",
      prepMinutes: 8,
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.item.prepStation, "tawa");
    assert.equal(created.body.item.prepMinutes, 8);

    for (const body of [
      { prepStation: "grill" },
      { prepMinutes: 0 },
      { prepMinutes: 121 },
      { prepMinutes: 7.5 },
    ]) {
      assert.equal((await call("POST", "/", "manager", { ...newItem, ...body })).status, 400);
    }

    const cleared = await call("PATCH", `/${created.body.item.id}`, "manager", {
      prepStation: null,
      prepMinutes: null,
    });
    assert.equal(cleared.status, 200);
    assert.equal("prepStation" in cleared.body.item, false);
    assert.equal("prepMinutes" in cleared.body.item, false);
  });
});
