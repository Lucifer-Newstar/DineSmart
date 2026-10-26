import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { DEFAULT_BOOKING_RULES } from "../src/reservations/booking-rules.js";
import { ReservationError, ReservationService } from "../src/reservations/reservation.service.js";
import type {
  NewReservation,
  ReservationChanges,
  ReservationRecord,
  ReservationRepository,
  ReservationSchedule,
  ReservationSlotGuard,
} from "../src/reservations/reservation.types.js";

const restaurantId = new ObjectId();
const userId = new ObjectId();
const customerId = new ObjectId();
const tableId = new ObjectId();
const reservationId = new ObjectId();
// 06:00Z is 11:30 in Kolkata; the booking starts at 19:00 local.
const now = new Date("2026-10-11T06:00:00.000Z");
const startAt = new Date("2026-10-11T13:30:00.000Z");

class FakeRepository implements ReservationRepository {
  schedule: ReservationSchedule = {
    timeZone: "Asia/Kolkata",
    operatingHours: { opensAt: "11:00", closesAt: "23:00" },
  };
  table = { capacity: 4, status: "available", tableNumber: "02" };
  tableConflict = false;
  ownsReservation = true;
  reservation: ReservationRecord = {
    id: reservationId,
    restaurantId,
    restaurantName: "Saffron & Co.",
    guestName: "Ananya Menon",
    partySize: 2,
    startAt,
    endAt: new Date(startAt.getTime() + 90 * 60_000),
    tableId,
    tableNumber: "02",
    status: "Confirmed",
    createdAt: now,
    updatedAt: now,
  };
  updated?: ReservationChanges;

  getCustomerIdForUser = async () => customerId;
  getActiveRestaurant = async () => this.schedule;
  customerExists = async () => true;
  getTable = async () => this.table;
  hasTableConflict = async () => this.tableConflict;
  createReservation = async (_reservation: NewReservation): Promise<ReservationRecord> =>
    this.reservation;
  listForRestaurant = async () => ({ reservations: [], truncated: false });
  listForCustomer = async () => ({ reservations: [], truncated: false });
  findForRestaurant = async () => this.reservation;
  findForCustomer = async (_id: ObjectId, owner: ObjectId) =>
    this.ownsReservation && owner.equals(customerId) ? this.reservation : null;
  updateForRestaurant = async () => this.reservation;
  async updateForCustomer(
    _id: ObjectId,
    _customerId: ObjectId,
    _expected: Date,
    changes: ReservationChanges,
    updatedAt: Date,
  ): Promise<ReservationRecord | null> {
    this.updated = changes;
    this.reservation = { ...this.reservation, ...changes, updatedAt };
    return this.reservation;
  }
}

function setup(options: { clock?: Date; guard?: ReservationSlotGuard } = {}) {
  const repository = new FakeRepository();
  const service = new ReservationService(
    repository,
    () => options.clock ?? now,
    undefined,
    undefined,
    undefined,
    options.guard,
  );
  return { repository, service };
}

async function rejectsWith(promise: Promise<unknown>, status: number, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ReservationError);
    assert.equal(error.statusCode, status);
    assert.equal(error.code, code);
    return true;
  });
}

test("a customer moves their booking inside the window and keeps a table that still fits", async () => {
  const { repository, service } = setup();
  const later = new Date("2026-10-11T14:30:00.000Z");
  const updated = await service.updateForCustomer({ userId, reservationId, startAt: later });
  assert.equal(updated.startAt.toISOString(), later.toISOString());
  assert.equal(updated.endAt.toISOString(), "2026-10-11T16:00:00.000Z");
  assert.equal(updated.status, "Confirmed");
  assert.ok(updated.tableId?.equals(tableId));
  assert.equal(repository.updated?.tableId, undefined);
});

test("a change the assigned table cannot hold returns the booking to Awaiting without a table", async () => {
  const { repository, service } = setup();
  const updated = await service.updateForCustomer({ userId, reservationId, partySize: 6 });
  assert.equal(updated.partySize, 6);
  assert.equal(updated.tableId, null);
  assert.equal(updated.status, "Awaiting");
  // Parties of 6 keep the table for 120 minutes under the default rules.
  assert.equal(updated.endAt.getTime() - updated.startAt.getTime(), 120 * 60_000);

  const clash = setup();
  clash.repository.tableConflict = true;
  const moved = await clash.service.updateForCustomer({
    userId,
    reservationId,
    startAt: new Date("2026-10-11T12:30:00.000Z"),
  });
  assert.equal(moved.status, "Awaiting");
  assert.equal(repository.updated?.status, "Awaiting");
});

test("changes and cancellations close at the cutoff before the start", async () => {
  // 12:01Z is 89 minutes before the 13:30Z start; the default cutoff is 120 minutes.
  const late = setup({ clock: new Date("2026-10-11T12:01:00.000Z") });
  await rejectsWith(
    late.service.updateForCustomer({ userId, reservationId, status: "Cancelled" }),
    409,
    "reservation_change_window_closed",
  );
  await rejectsWith(
    late.service.updateForCustomer({ userId, reservationId, partySize: 3 }),
    409,
    "reservation_change_window_closed",
  );

  // Exactly at the cutoff the change is still allowed.
  const onTime = setup({ clock: new Date("2026-10-11T11:30:00.000Z") });
  const cancelled = await onTime.service.updateForCustomer({
    userId,
    reservationId,
    status: "Cancelled",
  });
  assert.equal(cancelled.status, "Cancelled");
});

test("the cutoff follows the restaurant's booking rules", async () => {
  const { repository, service } = setup({ clock: new Date("2026-10-11T12:01:00.000Z") });
  repository.schedule = {
    ...repository.schedule,
    bookingRules: { ...DEFAULT_BOOKING_RULES, changeCutoffMinutes: 30 },
  };
  const updated = await service.updateForCustomer({ userId, reservationId, partySize: 3 });
  assert.equal(updated.partySize, 3);
});

test("another customer's booking is not found", async () => {
  const { repository, service } = setup();
  repository.ownsReservation = false;
  await rejectsWith(
    service.updateForCustomer({ userId, reservationId, status: "Cancelled" }),
    404,
    "reservation_not_found",
  );
});

test("a move into a full slot is refused and the guard ignores the booking being moved", async () => {
  const seen: Array<string | undefined> = [];
  const { service } = setup({
    guard: async (request) => {
      seen.push(request.excludingReservationId?.toHexString());
      return false;
    },
  });
  await rejectsWith(
    service.updateForCustomer({
      userId,
      reservationId,
      startAt: new Date("2026-10-11T14:00:00.000Z"),
    }),
    409,
    "reservation_slot_unavailable",
  );
  assert.deepEqual(seen, [reservationId.toHexString()]);
});

test("seated or finished bookings cannot be changed, and slot rules still apply", async () => {
  const seated = setup();
  seated.repository.reservation = { ...seated.repository.reservation, status: "Seated" };
  await rejectsWith(
    seated.service.updateForCustomer({ userId, reservationId, partySize: 3 }),
    409,
    "reservation_not_changeable",
  );

  const offSlot = setup();
  await rejectsWith(
    offSlot.service.updateForCustomer({
      userId,
      reservationId,
      startAt: new Date("2026-10-11T13:40:00.000Z"),
    }),
    400,
    "invalid_reservation_slot",
  );
});
