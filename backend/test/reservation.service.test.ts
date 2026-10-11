import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import {
  RESERVATION_DURATION_MS,
  ReservationError,
  ReservationService,
} from "../src/reservations/reservation.service.js";
import type {
  NewReservation,
  ReservationChanges,
  ReservationListResult,
  ReservationRecord,
  ReservationRepository,
  ReservationSchedule,
} from "../src/reservations/reservation.types.js";

const restaurantId = new ObjectId();
const userId = new ObjectId();
const customerId = new ObjectId();
const tableId = new ObjectId();
const reservationId = new ObjectId();
const now = new Date("2026-10-11T06:00:00.000Z");
const startAt = new Date("2026-10-11T13:30:00.000Z");

class FakeReservationRepository implements ReservationRepository {
  readonly schedule: ReservationSchedule = {
    timeZone: "Asia/Kolkata",
    operatingHours: { opensAt: "11:00", closesAt: "23:00" },
  };
  readonly table = { capacity: 4, status: "available", tableNumber: "02" };
  customerIdForUser: ObjectId | null = customerId;
  tableConflict = false;
  customerFound = true;
  restaurantFound = true;
  reservation: ReservationRecord = {
    id: reservationId,
    restaurantId,
    restaurantName: "Saffron & Co.",
    guestName: "Ananya Menon",
    partySize: 2,
    startAt,
    endAt: new Date(startAt.getTime() + RESERVATION_DURATION_MS),
    tableId,
    tableNumber: "02",
    status: "Confirmed",
    createdAt: now,
    updatedAt: now,
  };
  created?: NewReservation;
  updated?: ReservationChanges;
  private readonly noReservations: ReservationListResult = { reservations: [], truncated: false };

  getCustomerIdForUser(): Promise<ObjectId | null> {
    return Promise.resolve(this.customerIdForUser);
  }

  getActiveRestaurant(): Promise<ReservationSchedule | null> {
    return Promise.resolve(this.restaurantFound ? this.schedule : null);
  }

  customerExists(): Promise<boolean> {
    return Promise.resolve(this.customerFound);
  }

  getTable(): Promise<typeof this.table | null> {
    return Promise.resolve(this.table);
  }

  hasTableConflict(): Promise<boolean> {
    return Promise.resolve(this.tableConflict);
  }

  async createReservation(
    reservation: NewReservation,
    createdAt: Date,
  ): Promise<ReservationRecord> {
    this.created = reservation;
    this.reservation = {
      ...this.reservation,
      ...reservation,
      id: reservationId,
      guestName: "Ananya Menon",
      tableNumber: reservation.tableId ? this.table.tableNumber : null,
      createdAt,
      updatedAt: createdAt,
    };
    return this.reservation;
  }

  listForRestaurant(): Promise<ReservationListResult> {
    return Promise.resolve(this.noReservations);
  }

  listForCustomer(): Promise<ReservationListResult> {
    return Promise.resolve(this.noReservations);
  }

  findForRestaurant(): Promise<ReservationRecord | null> {
    return Promise.resolve(this.reservation);
  }

  findForCustomer(): Promise<ReservationRecord | null> {
    return Promise.resolve(this.reservation);
  }

  updateForRestaurant(
    _id: ObjectId,
    _restaurantId: ObjectId,
    _updatedAt: Date,
    changes: ReservationChanges,
    updatedAt: Date,
  ): Promise<ReservationRecord | null> {
    this.updated = changes;
    this.reservation = { ...this.reservation, ...changes, updatedAt };
    return Promise.resolve(this.reservation);
  }

  updateForCustomer(
    _id: ObjectId,
    _customerId: ObjectId,
    _updatedAt: Date,
    changes: ReservationChanges,
    updatedAt: Date,
  ): Promise<ReservationRecord | null> {
    this.updated = changes;
    this.reservation = { ...this.reservation, ...changes, updatedAt };
    return Promise.resolve(this.reservation);
  }
}

function serviceWith(
  repository = new FakeReservationRepository(),
  clock = () => now,
  notifyHealthScoreRefresh?: (tenantId: ObjectId) => void,
) {
  return {
    repository,
    service: new ReservationService(repository, clock, notifyHealthScoreRefresh),
  };
}

test("customer requests create an unassigned reservation with a server-derived 90-minute duration", async () => {
  const { repository, service } = serviceWith();
  const reservation = await service.createForCustomer({
    userId,
    restaurantId,
    partySize: 4,
    startAt,
    notes: "  Window seat, if possible.  ",
  });

  assert.equal(reservation.status, "Awaiting");
  assert.equal(reservation.tableId, null);
  assert.equal(reservation.partySize, 4);
  assert.equal(reservation.endAt.getTime(), startAt.getTime() + RESERVATION_DURATION_MS);
  assert.equal(reservation.notes, "Window seat, if possible.");
  assert.equal(repository.created?.customerId, customerId);
});

test("reservation creation and status changes request tenant health-score refreshes", async () => {
  const notifications: ObjectId[] = [];
  const { service } = serviceWith(
    new FakeReservationRepository(),
    () => now,
    (tenantId) => notifications.push(tenantId),
  );

  await service.createForCustomer({ userId, restaurantId, partySize: 2, startAt });
  await service.updateForCustomer({ userId, reservationId, status: "Cancelled" });

  assert.deepEqual(notifications, [restaurantId, restaurantId]);
});

test("reservation requests enforce party size, 30-minute slots, future time, opening hours, and note bounds", async () => {
  const cases: Array<{
    input: Partial<{ partySize: number; startAt: Date; notes: string }>;
    code: string;
  }> = [
    { input: { partySize: 0 }, code: "invalid_party_size" },
    { input: { partySize: 13 }, code: "invalid_party_size" },
    { input: { partySize: 1.5 }, code: "invalid_party_size" },
    {
      input: { startAt: new Date("2026-10-11T13:45:00.000Z") },
      code: "invalid_reservation_slot",
    },
    {
      input: { startAt: new Date("2026-10-12T04:00:00.000Z") },
      code: "outside_operating_hours",
    },
    {
      input: { startAt: new Date("2026-10-11T05:30:00.000Z") },
      code: "reservation_time_in_past",
    },
    { input: { notes: "x".repeat(501) }, code: "reservation_notes_too_long" },
  ];

  for (const item of cases) {
    const { service } = serviceWith();
    await assert.rejects(
      service.createForCustomer({
        userId,
        restaurantId,
        partySize: 2,
        startAt,
        ...item.input,
      }),
      (error: unknown) => error instanceof ReservationError && error.code === item.code,
    );
  }
});

test("staff reservations require a real customer, capacity-safe table, and conflict-free assignment", async () => {
  const missingCustomer = new FakeReservationRepository();
  missingCustomer.customerFound = false;
  await assert.rejects(
    serviceWith(missingCustomer).service.createForStaff({
      restaurantId,
      customerId,
      partySize: 2,
      startAt,
    }),
    (error: unknown) => error instanceof ReservationError && error.code === "customer_not_found",
  );

  const tooLarge = new FakeReservationRepository();
  await assert.rejects(
    serviceWith(tooLarge).service.createForStaff({
      restaurantId,
      customerId,
      partySize: 5,
      startAt,
      tableId,
    }),
    (error: unknown) =>
      error instanceof ReservationError && error.code === "table_capacity_exceeded",
  );

  const conflict = new FakeReservationRepository();
  conflict.tableConflict = true;
  await assert.rejects(
    serviceWith(conflict).service.createForStaff({
      restaurantId,
      customerId,
      partySize: 2,
      startAt,
      tableId,
    }),
    (error: unknown) =>
      error instanceof ReservationError && error.code === "reservation_table_conflict",
  );

  const available = new FakeReservationRepository();
  const reservation = await serviceWith(available).service.createForStaff({
    restaurantId,
    customerId,
    partySize: 2,
    startAt,
    tableId,
  });
  assert.equal(reservation.status, "Confirmed");
  assert.equal(reservation.tableId?.toHexString(), tableId.toHexString());
});

test("customers can cancel only their own reservation before its start", async () => {
  const repository = new FakeReservationRepository();
  const { service } = serviceWith(repository);
  const reservation = await service.updateForCustomer({
    userId,
    reservationId,
    status: "Cancelled",
  });
  assert.equal(reservation.status, "Cancelled");
  assert.deepEqual(repository.updated, { status: "Cancelled" });

  const alreadyStarted = new FakeReservationRepository();
  alreadyStarted.reservation = {
    ...alreadyStarted.reservation,
    startAt: new Date(now.getTime() - 1),
  };
  await assert.rejects(
    serviceWith(alreadyStarted).service.updateForCustomer({
      userId,
      reservationId,
      status: "Cancelled",
    }),
    (error: unknown) =>
      error instanceof ReservationError && error.code === "reservation_cannot_be_cancelled",
  );
});

test("staff status transitions enforce seating lifecycle and the no-show grace period", async () => {
  const repository = new FakeReservationRepository();
  repository.reservation = {
    ...repository.reservation,
    status: "Confirmed",
    startAt: new Date(now.getTime() - 10 * 60_000),
  };
  const tooEarly = serviceWith(repository);
  await assert.rejects(
    tooEarly.service.updateForStaff({
      restaurantId,
      reservationId,
      changes: { status: "NoShow" },
    }),
    (error: unknown) =>
      error instanceof ReservationError && error.code === "reservation_no_show_too_early",
  );

  const afterGrace = new Date(now.getTime() + 5 * 60_000);
  const completed = await serviceWith(repository, () => afterGrace).service.updateForStaff({
    restaurantId,
    reservationId,
    changes: { status: "NoShow" },
  });
  assert.equal(completed.status, "NoShow");
});

test("staff time changes re-check opening hours and table overlaps", async () => {
  const repository = new FakeReservationRepository();
  repository.reservation = {
    ...repository.reservation,
    status: "Confirmed",
    startAt,
    endAt: new Date(startAt.getTime() + RESERVATION_DURATION_MS),
  };
  repository.tableConflict = true;
  await assert.rejects(
    serviceWith(repository).service.updateForStaff({
      restaurantId,
      reservationId,
      changes: { startAt: new Date("2026-10-11T14:00:00.000Z") },
    }),
    (error: unknown) =>
      error instanceof ReservationError && error.code === "reservation_table_conflict",
  );
});
