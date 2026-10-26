import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import type { AuthPrincipal } from "../src/auth/auth.service.js";
import { createGuestRouter } from "../src/customers/customer.router.js";
import {
  type GuestProfileChanges,
  type GuestProfileStore,
  type GuestProfileSummary,
  parseGuestProfileChanges,
  toGuestSummary,
} from "../src/customers/guest-profile.repository.js";
import { createReservationRouter } from "../src/reservations/reservation.router.js";
import { ReservationService } from "../src/reservations/reservation.service.js";
import type {
  ReservationRecord,
  ReservationRepository,
  ReservationServiceReader,
} from "../src/reservations/reservation.types.js";

const restaurantId = new ObjectId();
const otherRestaurantId = new ObjectId();
const customerId = new ObjectId();
const now = new Date("2026-10-11T14:00:00.000Z");
const startAt = new Date("2026-10-11T13:30:00.000Z");

function bookingRepository(status: string) {
  const outcomes: string[] = [];
  let record: ReservationRecord = {
    id: new ObjectId(),
    restaurantId,
    restaurantName: "Saffron & Co.",
    guestName: "Ananya Menon",
    partySize: 2,
    startAt,
    endAt: new Date(startAt.getTime() + 90 * 60_000),
    tableId: new ObjectId(),
    tableNumber: "02",
    status,
    createdAt: now,
    updatedAt: now,
  };
  const repository: ReservationRepository = {
    getCustomerIdForUser: async () => customerId,
    getActiveRestaurant: async () => ({ timeZone: "Asia/Kolkata" }),
    customerExists: async () => true,
    getTable: async () => ({ capacity: 4, status: "available", tableNumber: "02" }),
    hasTableConflict: async () => false,
    createReservation: async () => record,
    listForRestaurant: async () => ({ reservations: [record], truncated: false }),
    listForCustomer: async () => ({ reservations: [record], truncated: false }),
    findForRestaurant: async () => record,
    findForCustomer: async () => record,
    updateForRestaurant: async (_id, _tenant, _expected, changes) => {
      record = { ...record, ...changes };
      return record;
    },
    updateForCustomer: async () => record,
    recordGuestOutcome: async (_tenant, _id, outcome) => {
      outcomes.push(outcome);
    },
  };
  return { repository, outcomes };
}

test("seating counts a visit and a no-show counts against the guest, once per change", async () => {
  const seated = bookingRepository("Arrived");
  const service = new ReservationService(seated.repository, () => now);
  await service.updateForStaff({
    restaurantId,
    reservationId: new ObjectId(),
    changes: { status: "Seated" },
  });
  // Saving the same status again (for example a table move) is not a second visit.
  await service.updateForStaff({
    restaurantId,
    reservationId: new ObjectId(),
    changes: { status: "Seated" },
  });
  assert.deepEqual(seated.outcomes, ["visit"]);

  const missed = bookingRepository("Confirmed");
  await new ReservationService(missed.repository, () => now).updateForStaff({
    restaurantId,
    reservationId: new ObjectId(),
    changes: { status: "NoShow" },
  });
  assert.deepEqual(missed.outcomes, ["no_show"]);

  const cancelled = bookingRepository("Confirmed");
  await new ReservationService(cancelled.repository, () => now).updateForStaff({
    restaurantId,
    reservationId: new ObjectId(),
    changes: { status: "Cancelled" },
  });
  assert.deepEqual(cancelled.outcomes, []);
});

test("guest edits accept known tags and a bounded note, and null clears the note", () => {
  assert.deepEqual(parseGuestProfileChanges({ tags: ["VIP", "allergy", "VIP"] }), {
    tags: ["VIP", "allergy"],
  });
  assert.deepEqual(parseGuestProfileChanges({ staffNote: "  Prefers the window  " }), {
    staffNote: "Prefers the window",
  });
  assert.deepEqual(parseGuestProfileChanges({ staffNote: null }), { staffNote: null });
  for (const bad of [
    {},
    { tags: ["celebrity"] },
    { tags: "VIP" },
    { staffNote: "x".repeat(501) },
    { staffNote: 4 },
    { tags: [], email: "x@example.test" },
  ]) {
    assert.equal(parseGuestProfileChanges(bad), null);
  }
  assert.deepEqual(toGuestSummary(null), {
    visitCount: 0,
    noShowCount: 0,
    lastVisitAt: null,
    tags: [],
    staffNote: null,
  });
});

class FakeStore implements GuestProfileStore {
  profile: GuestProfileSummary = toGuestSummary(null);
  updates: Array<{ tenant: string; changes: GuestProfileChanges }> = [];
  isGuestOf = async (tenant: ObjectId, guest: ObjectId) =>
    tenant.equals(restaurantId) && guest.equals(customerId);
  get = async () => this.profile;
  update = async (tenant: ObjectId, _guest: ObjectId, changes: GuestProfileChanges) => {
    this.updates.push({ tenant: tenant.toHexString(), changes });
    this.profile = {
      ...this.profile,
      ...(changes.tags ? { tags: changes.tags } : {}),
      ...(changes.staffNote !== undefined ? { staffNote: changes.staffNote } : {}),
    };
    return this.profile;
  };
}

async function guestCall(
  principal: AuthPrincipal,
  method: "GET" | "PUT",
  body?: unknown,
  id = customerId.toHexString(),
) {
  const store = new FakeStore();
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/guests",
    createGuestRouter({
      createRuntime: async () => ({ store, verifyAccessToken: async () => principal }),
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/guests/${id}`, {
      method,
      headers: {
        authorization: "Bearer token",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { response, store };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const staff = (role: AuthPrincipal["role"], tenant = restaurantId): AuthPrincipal => ({
  userId: new ObjectId().toHexString(),
  role,
  restaurantId: tenant.toHexString(),
});

test("reception tags a guest and the change stays inside its restaurant", async () => {
  const { response, store } = await guestCall(staff("Reception"), "PUT", {
    tags: ["VIP", "allergy"],
    staffNote: "Severe peanut allergy",
  });
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { profile: { tags: string[]; staffNote: string } };
  assert.deepEqual(payload.profile.tags, ["VIP", "allergy"]);
  assert.equal(store.updates[0]?.tenant, restaurantId.toHexString());

  // Another restaurant has no history with this guest, so it cannot read or tag them.
  const outsider = await guestCall(staff("Manager", otherRestaurantId), "GET");
  assert.equal(outsider.response.status, 404);
  const outsiderWrite = await guestCall(staff("Manager", otherRestaurantId), "PUT", {
    tags: ["VIP"],
  });
  assert.equal(outsiderWrite.response.status, 404);
  assert.equal(outsiderWrite.store.updates.length, 0);
});

test("customers and kitchen staff cannot read or write guest profiles", async () => {
  const customer: AuthPrincipal = {
    userId: new ObjectId().toHexString(),
    role: "Customer",
    restaurantId: null,
  };
  assert.equal((await guestCall(customer, "GET")).response.status, 403);
  assert.equal((await guestCall(customer, "PUT", { tags: ["VIP"] })).response.status, 403);
  assert.equal((await guestCall(staff("Kitchen Staff"), "GET")).response.status, 403);
  assert.equal(
    (await guestCall(staff("Reception"), "PUT", { tags: ["VIP", "x"] })).response.status,
    400,
  );
  assert.equal(
    (await guestCall(staff("Reception"), "GET", undefined, "nope")).response.status,
    400,
  );
});

test("customers never receive the staff note on their own bookings", async () => {
  const record: ReservationRecord = {
    id: new ObjectId(),
    restaurantId,
    restaurantName: "Saffron & Co.",
    guestName: "Ananya Menon",
    partySize: 2,
    startAt,
    endAt: startAt,
    tableId: null,
    tableNumber: null,
    status: "Confirmed",
    createdAt: now,
    updatedAt: now,
  };
  const service = {
    listForCustomer: async () => ({ reservations: [record], truncated: false }),
    listForRestaurant: async () => ({
      reservations: [
        {
          ...record,
          customerId,
          guestProfile: { ...toGuestSummary(null), tags: ["VIP"], staffNote: "Regular" },
        },
      ],
      truncated: false,
    }),
  } as unknown as ReservationServiceReader;
  const read = async (principal: AuthPrincipal) => {
    const app = express();
    app.use(
      "/api/v1/reservations",
      createReservationRouter({
        createRuntime: async () => ({ service, verifyAccessToken: async () => principal }),
      }),
    );
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/reservations`, {
        headers: { authorization: "Bearer token" },
      });
      return (await response.json()) as { reservations: Array<Record<string, unknown>> };
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };
  const own = await read({
    userId: new ObjectId().toHexString(),
    role: "Customer",
    restaurantId: null,
  });
  assert.equal("guestProfile" in own.reservations[0], false);
  assert.equal("customerId" in own.reservations[0], false);
  const desk = await read(staff("Reception"));
  assert.equal((desk.reservations[0].guestProfile as { staffNote: string }).staffNote, "Regular");
  assert.equal(desk.reservations[0].customerId, customerId.toHexString());
});
