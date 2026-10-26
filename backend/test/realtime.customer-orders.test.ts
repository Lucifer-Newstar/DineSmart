import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { WebSocket } from "ws";
import { withCustomerOrderEvents } from "../src/realtime/customer-order-events.js";
import type { RealtimeIdentity } from "../src/realtime/realtime.types.js";
import { RealtimeHub } from "../src/realtime/realtime-hub.js";

class FakeSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  bufferedAmount = 0;
  sent: string[] = [];
  closeCode: number | undefined;

  send(payload: string, callback?: (error?: Error) => void): void {
    this.sent.push(payload);
    callback?.();
  }

  close(code?: number): void {
    this.closeCode = code;
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }
}

function socket(): { raw: FakeSocket; typed: WebSocket } {
  const raw = new FakeSocket();
  return { raw, typed: raw as unknown as WebSocket };
}

function identity(
  userId: ObjectId,
  restaurantId: ObjectId | null,
  role: RealtimeIdentity["role"] = "Manager",
): RealtimeIdentity {
  return { userId, role, restaurantId };
}

const restaurantId = new ObjectId();
const orderId = new ObjectId().toHexString();

function setup() {
  const hub = new RealtimeHub({ clock: () => Date.parse("2026-10-26T13:00:00.000Z") });
  const ownerId = new ObjectId();
  const owner = socket();
  const ownerPhone = socket();
  const otherCustomer = socket();
  const manager = socket();
  hub.addConnection(identity(ownerId, null, "Customer"), owner.typed);
  hub.addConnection(identity(ownerId, null, "Customer"), ownerPhone.typed);
  hub.addConnection(identity(new ObjectId(), null, "Customer"), otherCustomer.typed);
  hub.addConnection(identity(new ObjectId(), restaurantId, "Manager"), manager.typed);
  return { hub, ownerId, owner, ownerPhone, otherCustomer, manager };
}

test("an order status event reaches every connection of its customer and no one else", () => {
  const { hub, ownerId, owner, ownerPhone, otherCustomer, manager } = setup();
  const delivered = hub.publishCustomerOrderEvent({
    customerUserId: ownerId,
    restaurantId,
    orderId,
    status: "Preparing",
  });
  assert.equal(delivered, 2);
  for (const connection of [owner, ownerPhone]) {
    const envelope = JSON.parse(connection.raw.sent[0] ?? "{}");
    assert.equal(envelope.event, "order.status");
    assert.deepEqual(envelope.data, { orderId, status: "Preparing" });
    assert.equal(envelope.restaurantId, restaurantId.toHexString());
  }
  assert.deepEqual(otherCustomer.raw.sent, []);
  assert.deepEqual(manager.raw.sent, []);
});

test("a staff account with the same user ID is not treated as the customer", () => {
  const hub = new RealtimeHub();
  const userId = new ObjectId();
  const staff = socket();
  hub.addConnection(identity(userId, restaurantId, "Reception"), staff.typed);
  assert.equal(
    hub.publishCustomerOrderEvent({
      customerUserId: userId,
      restaurantId,
      orderId,
      status: "Ready",
    }),
    0,
  );
  assert.deepEqual(staff.raw.sent, []);
});

test("restaurant order events still reach staff, and customers get only their own copy", async () => {
  const { hub, ownerId, owner, otherCustomer, manager } = setup();
  const lookups: string[] = [];
  const publish = withCustomerOrderEvents(
    hub.publishRestaurantEvent,
    async (tenant, id) => {
      lookups.push(`${tenant.toHexString()}:${id.toHexString()}`);
      return ownerId;
    },
    hub.publishCustomerOrderEvent,
  );
  publish({ restaurantId, event: "order.updated", data: { orderId, status: "Ready" } });
  publish({ restaurantId, event: "table.updated", data: { tableId: "x", status: "occupied" } });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(lookups, [`${restaurantId.toHexString()}:${orderId}`]);
  assert.deepEqual(
    manager.raw.sent.map((payload) => JSON.parse(payload).event),
    ["order.updated", "table.updated"],
  );
  assert.deepEqual(
    owner.raw.sent.map((payload) => JSON.parse(payload).event),
    ["order.status"],
  );
  assert.deepEqual(otherCustomer.raw.sent, []);
});

test("an order without a customer account, or a failed lookup, sends nothing to customers", async () => {
  const { hub, owner } = setup();
  const errors: unknown[] = [];
  const quiet = withCustomerOrderEvents(
    hub.publishRestaurantEvent,
    async () => null,
    hub.publishCustomerOrderEvent,
  );
  const failing = withCustomerOrderEvents(
    hub.publishRestaurantEvent,
    async () => {
      throw new Error("database down");
    },
    hub.publishCustomerOrderEvent,
    (error) => errors.push(error),
  );
  quiet({ restaurantId, event: "order.updated", data: { orderId, status: "Ready" } });
  failing({ restaurantId, event: "order.updated", data: { orderId, status: "Ready" } });
  quiet({ restaurantId, event: "order.updated", data: { orderId: "not-an-id", status: "Ready" } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(owner.raw.sent, []);
  assert.equal(errors.length, 1);
});
