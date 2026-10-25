import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import type { Server } from "node:http";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import { WebSocket } from "ws";
import type { AuditChange } from "../src/audit/audit.service.js";
import type { AuthPrincipal } from "../src/auth/auth.service.js";
import { createMenuAdminRouter } from "../src/menu/menu.admin.router.js";
import { MenuAdminService } from "../src/menu/menu.service.js";
import type { ManagedMenuItem, MenuAdminRepository } from "../src/menu/menu.types.js";
import type { RealtimeIdentity, RestaurantRealtimeEvent } from "../src/realtime/realtime.types.js";
import { RealtimeHub } from "../src/realtime/realtime-hub.js";

const now = new Date("2026-10-25T12:00:00.000Z");
const restaurantId = new ObjectId("710000000000000000000001");

class FakeSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  bufferedAmount = 0;
  sent: string[] = [];

  send(payload: string, callback?: (error?: Error) => void): void {
    this.sent.push(payload);
    callback?.();
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }
}

function connect(hub: RealtimeHub, role: RealtimeIdentity["role"], tenant: ObjectId | null) {
  const raw = new FakeSocket();
  hub.addConnection(
    { userId: new ObjectId(), role, restaurantId: tenant },
    raw as unknown as WebSocket,
  );
  return raw;
}

/** One item, with the same live/archived rules as the Mongo repository. */
function singleItemRepository(item: ManagedMenuItem): MenuAdminRepository & { archived: boolean } {
  const state = { ...item };
  const repository = {
    archived: false,
    async listManagedItems() {
      return { items: repository.archived ? [] : [{ ...state }], truncated: false };
    },
    async findManagedItem() {
      return repository.archived ? null : { ...state };
    },
    async createItem(): Promise<ManagedMenuItem> {
      throw new Error("not used");
    },
    async updateItem() {
      return null;
    },
    async setAvailability(tenant: ObjectId, itemId: ObjectId, isAvailable: boolean) {
      if (repository.archived || !tenant.equals(restaurantId) || !itemId.equals(state.id))
        return null;
      const previous = { ...state };
      state.isAvailable = isAvailable;
      return previous;
    },
    async archiveItem(tenant: ObjectId, itemId: ObjectId) {
      if (repository.archived || !tenant.equals(restaurantId) || !itemId.equals(state.id))
        return null;
      const previous = { ...state };
      repository.archived = true;
      state.isAvailable = false;
      return previous;
    },
  };
  return repository;
}

function dosa(isAvailable = true): ManagedMenuItem {
  return {
    id: new ObjectId("71000000000000000000000c"),
    name: "Ghee podi dosa",
    category: "South Indian",
    priceMinor: 28_500,
    isAvailable,
    dietaryLabels: ["vegetarian"],
    allergenLabels: ["dairy"],
    updatedAt: now,
  };
}

const actor = { userId: new ObjectId(), role: "Manager" as const };

test("86-ing an item audits it once and publishes menu.availability", async () => {
  const events: RestaurantRealtimeEvent[] = [];
  const audit: AuditChange[] = [];
  const service = new MenuAdminService(
    singleItemRepository(dosa()),
    () => now,
    async (change) => {
      audit.push(change);
    },
    (event) => events.push(event),
  );

  const soldOut = await service.setAvailability(restaurantId, dosa().id, false, actor);
  const repeat = await service.setAvailability(restaurantId, dosa().id, false, actor);
  const back = await service.setAvailability(restaurantId, dosa().id, true, actor);

  assert.equal(soldOut.isAvailable, false);
  assert.equal(repeat.isAvailable, false);
  assert.equal(back.isAvailable, true);
  assert.deepEqual(
    events.map((event) => [event.event, event.restaurantId.toHexString(), event.data]),
    [
      [
        "menu.availability",
        restaurantId.toHexString(),
        { menuItemId: dosa().id.toHexString(), isAvailable: false },
      ],
      [
        "menu.availability",
        restaurantId.toHexString(),
        { menuItemId: dosa().id.toHexString(), isAvailable: true },
      ],
    ],
    "repeating the current state publishes nothing",
  );
  assert.deepEqual(
    audit.map((entry) => [entry.action, entry.before.isAvailable, entry.after.isAvailable]),
    [
      ["menu.availability_changed", true, false],
      ["menu.availability_changed", false, true],
    ],
  );
});

test("archiving an available item tells open menus it is gone; a sold-out one stays quiet", async () => {
  const events: RestaurantRealtimeEvent[] = [];
  const publish = (event: RestaurantRealtimeEvent) => events.push(event);

  await new MenuAdminService(
    singleItemRepository(dosa(true)),
    () => now,
    undefined,
    publish,
  ).archive(restaurantId, dosa().id);
  await new MenuAdminService(
    singleItemRepository(dosa(false)),
    () => now,
    undefined,
    publish,
  ).archive(restaurantId, dosa().id);

  assert.equal(events.length, 1);
  assert.deepEqual(events[0]?.data, { menuItemId: dosa().id.toHexString(), isAvailable: false });
});

test("a broken realtime publisher never fails the saved toggle", async () => {
  const service = new MenuAdminService(
    singleItemRepository(dosa()),
    () => now,
    undefined,
    () => {
      throw new Error("socket layer down");
    },
  );
  const item = await service.setAvailability(restaurantId, dosa().id, false);
  assert.equal(item.isAvailable, false);
});

test("menu.availability reaches every same-tenant menu reader and signed-in customers only", () => {
  const hub = new RealtimeHub({ clock: () => now.getTime() });
  const manager = connect(hub, "Manager", restaurantId);
  const reception = connect(hub, "Reception", restaurantId);
  const kitchen = connect(hub, "Kitchen Staff", restaurantId);
  const customer = connect(hub, "Customer", null);
  const otherTenant = connect(hub, "Manager", new ObjectId());

  hub.publishRestaurantEvent({
    restaurantId,
    event: "menu.availability",
    data: { menuItemId: dosa().id.toHexString(), isAvailable: false },
  });

  for (const [name, socket] of Object.entries({ manager, reception, kitchen, customer })) {
    assert.equal(socket.sent.length, 1, `${name} should hear the 86`);
  }
  assert.equal(otherTenant.sent.length, 0, "another restaurant's staff must not");
  const envelope = JSON.parse(customer.sent[0] ?? "{}");
  assert.equal(envelope.event, "menu.availability");
  assert.equal(envelope.restaurantId, restaurantId.toHexString());
  assert.deepEqual(envelope.data, { menuItemId: dosa().id.toHexString(), isAvailable: false });
});

test("customers still receive no staff-only restaurant events", () => {
  const hub = new RealtimeHub({ clock: () => now.getTime() });
  const customer = connect(hub, "Customer", null);

  hub.publishRestaurantEvent({
    restaurantId,
    event: "order.updated",
    data: { orderId: new ObjectId().toHexString(), status: "ready" },
  });
  hub.publishRestaurantEvent({
    restaurantId,
    event: "inventory.updated",
    data: { inventoryItemId: new ObjectId().toHexString() },
  });

  assert.equal(customer.sent.length, 0);
});

test("the availability route validates its body and is manager-only", async () => {
  const events: RestaurantRealtimeEvent[] = [];
  const service = new MenuAdminService(
    singleItemRepository(dosa()),
    () => now,
    undefined,
    (event) => events.push(event),
  );
  const principals: Record<string, AuthPrincipal> = {
    manager: {
      userId: actor.userId.toHexString(),
      role: "Manager",
      restaurantId: restaurantId.toHexString(),
    },
    reception: {
      userId: actor.userId.toHexString(),
      role: "Reception",
      restaurantId: restaurantId.toHexString(),
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/items",
    createMenuAdminRouter({
      createRuntime: async () => ({
        service,
        verifyAccessToken: async (token) => {
          const principal = principals[token];
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
  const toggle = (who: string, id: string, body: unknown) =>
    fetch(`http://127.0.0.1:${address.port}/items/${id}/availability`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${who}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const id = dosa().id.toHexString();

  try {
    for (const body of [{}, { isAvailable: "no" }, { isAvailable: false, name: "x" }, [false]]) {
      const response = await toggle("manager", id, body);
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal(
        ((await response.json()) as { error: { code: string } }).error.code,
        "invalid_menu_availability",
      );
    }
    assert.equal((await toggle("reception", id, { isAvailable: false })).status, 403);
    assert.equal(
      (await toggle("manager", new ObjectId().toHexString(), { isAvailable: false })).status,
      404,
    );
    assert.equal(events.length, 0, "nothing is broadcast for refused requests");

    const response = await toggle("manager", id, { isAvailable: false });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { item: { id: string; isAvailable: boolean } };
    assert.equal(payload.item.id, id);
    assert.equal(payload.item.isAvailable, false);
    assert.equal(events.length, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
