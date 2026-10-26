import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { ReservationError, ReservationService } from "../src/reservations/reservation.service.js";
import type {
  NewReservation,
  ReservationChanges,
  ReservationRecord,
  ReservationRepository,
} from "../src/reservations/reservation.types.js";

const restaurantId = new ObjectId();
const userId = new ObjectId();
const customerId = new ObjectId();
const now = new Date("2026-10-11T06:00:00.000Z");
const startAt = new Date("2026-10-11T13:30:00.000Z");

function fakeRepository() {
  const state: { created?: NewReservation; changes?: ReservationChanges } = {};
  const record: ReservationRecord = {
    id: new ObjectId(),
    restaurantId,
    restaurantName: "Saffron & Co.",
    guestName: "Ananya Menon",
    partySize: 2,
    startAt,
    endAt: new Date(startAt.getTime() + 90 * 60_000),
    tableId: null,
    tableNumber: null,
    status: "Awaiting",
    occasion: "birthday",
    dietaryNotes: "No peanuts",
    createdAt: now,
    updatedAt: now,
  };
  const repository: ReservationRepository = {
    getCustomerIdForUser: async () => customerId,
    getActiveRestaurant: async () => ({
      timeZone: "Asia/Kolkata",
      operatingHours: { opensAt: "11:00", closesAt: "23:00" },
    }),
    customerExists: async () => true,
    getTable: async () => null,
    hasTableConflict: async () => false,
    createReservation: async (reservation) => {
      state.created = reservation;
      return { ...record, ...reservation, id: record.id };
    },
    listForRestaurant: async () => ({ reservations: [], truncated: false }),
    listForCustomer: async () => ({ reservations: [], truncated: false }),
    findForRestaurant: async () => record,
    findForCustomer: async () => record,
    updateForRestaurant: async (_id, _restaurant, _expected, changes) => {
      state.changes = changes;
      return { ...record, ...changes };
    },
    updateForCustomer: async (_id, _customer, _expected, changes) => {
      state.changes = changes;
      return { ...record, ...changes };
    },
  };
  return { repository, state };
}

test("bookings store a known occasion and trimmed dietary notes", async () => {
  const { repository, state } = fakeRepository();
  const service = new ReservationService(repository, () => now);
  await service.createForCustomer({
    userId,
    restaurantId,
    partySize: 2,
    startAt,
    occasion: "anniversary",
    dietaryNotes: "  Shellfish allergy  ",
  });
  assert.equal(state.created?.occasion, "anniversary");
  assert.equal(state.created?.dietaryNotes, "Shellfish allergy");

  await service.createForCustomer({
    userId,
    restaurantId,
    partySize: 2,
    startAt,
    dietaryNotes: "  ",
  });
  assert.equal("dietaryNotes" in (state.created ?? {}), false);
});

test("unknown occasions and long dietary notes are refused", async () => {
  const { repository } = fakeRepository();
  const service = new ReservationService(repository, () => now);
  await assert.rejects(
    service.createForCustomer({
      userId,
      restaurantId,
      partySize: 2,
      startAt,
      occasion: "wedding" as never,
    }),
    (error: unknown) =>
      error instanceof ReservationError && error.code === "invalid_reservation_occasion",
  );
  await assert.rejects(
    service.createForCustomer({
      userId,
      restaurantId,
      partySize: 2,
      startAt,
      dietaryNotes: "x".repeat(201),
    }),
    (error: unknown) =>
      error instanceof ReservationError && error.code === "reservation_dietary_notes_too_long",
  );
});

test("staff and customers can clear guest details with null", async () => {
  const staff = fakeRepository();
  await new ReservationService(staff.repository, () => now).updateForStaff({
    restaurantId,
    reservationId: new ObjectId(),
    changes: { occasion: null, dietaryNotes: null },
  });
  assert.equal(staff.state.changes?.occasion, null);
  assert.equal(staff.state.changes?.dietaryNotes, null);

  const customer = fakeRepository();
  const updated = await new ReservationService(customer.repository, () => now).updateForCustomer({
    userId,
    reservationId: new ObjectId(),
    dietaryNotes: "Vegan",
  });
  assert.equal(updated.dietaryNotes, "Vegan");
  assert.equal(customer.state.changes?.occasion, undefined);
});
