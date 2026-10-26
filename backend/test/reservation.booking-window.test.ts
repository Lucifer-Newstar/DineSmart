import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { DEFAULT_BOOKING_RULES } from "../src/reservations/booking-rules.js";
import { ReservationError, ReservationService } from "../src/reservations/reservation.service.js";
import type {
  ReservationRecord,
  ReservationRepository,
  ReservationSchedule,
} from "../src/reservations/reservation.types.js";

const restaurantId = new ObjectId();
const userId = new ObjectId();
const now = new Date("2026-10-11T06:00:00.000Z");

function service(schedule: Partial<ReservationSchedule> = {}) {
  const record = {
    id: new ObjectId(),
    restaurantId,
    restaurantName: "Saffron & Co.",
    guestName: "Guest",
    partySize: 2,
    startAt: now,
    endAt: now,
    tableId: null,
    tableNumber: null,
    status: "Awaiting",
    createdAt: now,
    updatedAt: now,
  } satisfies ReservationRecord;
  const repository: ReservationRepository = {
    getCustomerIdForUser: async () => new ObjectId(),
    getActiveRestaurant: async () => ({ timeZone: "Asia/Kolkata", ...schedule }),
    customerExists: async () => true,
    getTable: async () => null,
    hasTableConflict: async () => false,
    createReservation: async (reservation) => ({ ...record, ...reservation }),
    listForRestaurant: async () => ({ reservations: [], truncated: false }),
    listForCustomer: async () => ({ reservations: [], truncated: false }),
    findForRestaurant: async () => record,
    findForCustomer: async () => record,
    updateForRestaurant: async () => record,
    updateForCustomer: async () => record,
  };
  return new ReservationService(repository, () => now);
}

function customerBooking(startAt: string, schedule?: Partial<ReservationSchedule>) {
  return service(schedule).createForCustomer({
    userId,
    restaurantId,
    partySize: 2,
    startAt: new Date(startAt),
  });
}

async function refused(promise: Promise<unknown>, code: string) {
  await assert.rejects(
    promise,
    (error: unknown) =>
      error instanceof ReservationError && error.statusCode === 400 && error.code === code,
  );
}

test("online bookings need the minimum lead time", async () => {
  await refused(customerBooking("2026-10-11T05:30:00.000Z"), "reservation_time_in_past");
  // 30 minutes ahead is inside the default 60-minute lead time.
  await refused(customerBooking("2026-10-11T06:30:00.000Z"), "reservation_too_soon");
  assert.equal((await customerBooking("2026-10-11T07:00:00.000Z")).status, "Awaiting");
});

test("online bookings cannot start past the booking window", async () => {
  await refused(customerBooking("2026-12-10T13:30:00.000Z"), "reservation_too_far");
  const shortWindow = { bookingRules: { ...DEFAULT_BOOKING_RULES, maxAdvanceDays: 7 } };
  await refused(customerBooking("2026-10-19T13:30:00.000Z", shortWindow), "reservation_too_far");
  assert.equal((await customerBooking("2026-10-17T13:30:00.000Z", shortWindow)).status, "Awaiting");
});

test("staff can still book a guest at short notice", async () => {
  const created = await service().createForStaff({
    restaurantId,
    customerId: new ObjectId(),
    partySize: 2,
    startAt: new Date("2026-10-11T06:30:00.000Z"),
  });
  assert.equal(created.status, "Awaiting");
});
