import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { REALTIME_TICKET_TTL_MS } from "../src/realtime/realtime.types.js";
import {
  SocketTicketCapacityError,
  SocketTicketStore,
} from "../src/realtime/socket-ticket.store.js";

const userId = new ObjectId();
const restaurantId = new ObjectId();
const identity = { userId, role: "Manager" as const, restaurantId };

test("socket tickets are cryptographically shaped, scoped, short-lived, and one-use", () => {
  const issuedAt = 1_791_725_000_000;
  const store = new SocketTicketStore({ clock: () => issuedAt, createToken: () => "A".repeat(43) });

  const issued = store.issue(identity);
  assert.equal(issued.ticket.length, 43);
  assert.equal(issued.expiresAt.getTime(), issuedAt + REALTIME_TICKET_TTL_MS);
  assert.equal(store.pendingCount, 1);

  const consumed = store.consume(issued.ticket);
  assert.deepEqual(consumed, identity);
  assert.notEqual(
    consumed?.userId,
    userId,
    "the stored identity must not share mutable ObjectId instances",
  );
  assert.notEqual(consumed?.restaurantId, restaurantId);
  assert.equal(store.consume(issued.ticket), null);
  assert.equal(store.pendingCount, 0);
});

test("socket tickets expire at the boundary and expired entries are reclaimed before capacity checks", () => {
  let now = 10_000;
  let sequence = 0;
  const store = new SocketTicketStore({
    clock: () => now,
    createToken: () => `${String(sequence++).padStart(42, "A")}A`,
    maxPendingTickets: 1,
  });

  const first = store.issue(identity);
  assert.equal(store.consume(first.ticket, now + REALTIME_TICKET_TTL_MS), null);
  now += REALTIME_TICKET_TTL_MS;
  const replacement = store.issue(identity);
  assert.notEqual(replacement.ticket, first.ticket);
  assert.equal(store.pendingCount, 1);
});

test("socket ticket store bounds pending credentials and rejects malformed generators", () => {
  let sequence = 0;
  const store = new SocketTicketStore({
    createToken: () => `${String(sequence++).padStart(42, "A")}A`,
    maxPendingTickets: 1,
  });

  store.issue(identity);
  assert.throws(() => store.issue(identity), SocketTicketCapacityError);
  assert.equal(store.consume("bad-ticket"), null);

  const malformed = new SocketTicketStore({ createToken: () => "short" });
  assert.throws(() => malformed.issue(identity), /invalid token/);
});
