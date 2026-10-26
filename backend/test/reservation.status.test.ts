import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import type { RestaurantRealtimeEvent } from "../src/realtime/realtime.types.js";
import { ReservationError, ReservationService } from "../src/reservations/reservation.service.js";
import type {
  ReservationChanges,
  ReservationRecord,
  ReservationRepository,
} from "../src/reservations/reservation.types.js";

const restaurantId = new ObjectId();
const tableId = new ObjectId();
const reservationId = new ObjectId();
const startAt = new Date("2026-10-11T13:30:00.000Z");
const beforeStart = new Date("2026-10-11T13:20:00.000Z");
const afterGrace = new Date("2026-10-11T13:50:00.000Z");

function setup(status: string, options: { tableId?: ObjectId | null; occupancy?: boolean } = {}) {
  const occupancy: Array<{ reservationId: string | null; releasing?: string }> = [];
  const events: RestaurantRealtimeEvent[] = [];
  let record: ReservationRecord = {
    id: reservationId,
    restaurantId,
    restaurantName: "Saffron & Co.",
    guestName: "Ananya Menon",
    partySize: 2,
    startAt,
    endAt: new Date(startAt.getTime() + 90 * 60_000),
    tableId: options.tableId === undefined ? tableId : options.tableId,
    tableNumber: "02",
    status,
    createdAt: beforeStart,
    updatedAt: beforeStart,
  };
  let lastChanges: ReservationChanges | undefined;
  const repository: ReservationRepository = {
    getCustomerIdForUser: async () => null,
    getActiveRestaurant: async () => ({ timeZone: "Asia/Kolkata" }),
    customerExists: async () => true,
    getTable: async () => ({ capacity: 4, status: "available", tableNumber: "02" }),
    hasTableConflict: async () => false,
    createReservation: async () => record,
    listForRestaurant: async () => ({ reservations: [], truncated: false }),
    listForCustomer: async () => ({ reservations: [], truncated: false }),
    findForRestaurant: async () => record,
    findForCustomer: async () => record,
    updateForRestaurant: async (_id, _restaurant, _expected, changes, now) => {
      lastChanges = changes;
      record = { ...record, ...changes, updatedAt: now };
      return record;
    },
    updateForCustomer: async () => record,
    ...(options.occupancy === false
      ? {}
      : {
          setTableOccupancy: async (
            _restaurant: ObjectId,
            _table: ObjectId,
            holder: ObjectId | null,
            _now: Date,
            releasing?: ObjectId,
          ) => {
            occupancy.push({
              reservationId: holder?.toHexString() ?? null,
              ...(releasing ? { releasing: releasing.toHexString() } : {}),
            });
            return true;
          },
        }),
  };
  const move = (next: string, clock: Date, extra: ReservationChanges = {}) =>
    new ReservationService(
      repository,
      () => clock,
      undefined,
      undefined,
      (event) => events.push(event),
    ).updateForStaff({
      restaurantId,
      reservationId,
      changes: { status: next as ReservationChanges["status"], ...extra },
    });
  return { move, occupancy, events, changes: () => lastChanges };
}

async function refused(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ReservationError);
    assert.equal(error.code, code);
    return true;
  });
}

test("a confirmed booking moves to Arrived with an arrival time, then to Seated", async () => {
  const flow = setup("Confirmed");
  const arrived = await flow.move("Arrived", beforeStart);
  assert.equal(arrived.status, "Arrived");
  assert.equal(arrived.arrivedAt?.toISOString(), beforeStart.toISOString());

  const seated = await flow.move("Seated", beforeStart);
  assert.equal(seated.status, "Seated");
  assert.equal(seated.seatedAt?.toISOString(), beforeStart.toISOString());
  assert.deepEqual(flow.occupancy, [{ reservationId: reservationId.toHexString() }]);
  assert.ok(
    flow.events.some(
      (event) =>
        event.event === "table.updated" &&
        event.data.tableId === tableId.toHexString() &&
        event.data.status === "occupied",
    ),
  );
});

test("completing a seated visit frees the table only while this booking holds it", async () => {
  const flow = setup("Seated");
  await flow.move("Completed", afterGrace);
  assert.deepEqual(flow.occupancy, [
    { reservationId: null, releasing: reservationId.toHexString() },
  ]);
});

test("walk-ups on an unconfirmed booking can arrive, and no-shows wait for the grace period", async () => {
  const awaiting = setup("Awaiting");
  assert.equal((await awaiting.move("Arrived", beforeStart)).status, "Arrived");

  await refused(setup("Confirmed").move("NoShow", beforeStart), "reservation_no_show_too_early");
  assert.equal((await setup("Confirmed").move("NoShow", afterGrace)).status, "NoShow");
});

test("invalid transitions are rejected", async () => {
  for (const [from, to] of [
    ["Arrived", "NoShow"],
    ["Arrived", "Confirmed"],
    ["Seated", "Arrived"],
    ["Completed", "Seated"],
    ["Cancelled", "Arrived"],
    ["NoShow", "Seated"],
    ["Awaiting", "Seated"],
  ]) {
    await refused(setup(from).move(to, afterGrace), "invalid_reservation_transition");
  }
});

test("seating needs a table, either already assigned or sent with the change", async () => {
  await refused(
    setup("Arrived", { tableId: null }).move("Seated", beforeStart),
    "reservation_table_required",
  );
  const withTable = setup("Arrived", { tableId: null });
  const seated = await withTable.move("Seated", beforeStart, { tableId });
  assert.ok(seated.tableId?.equals(tableId));
  assert.equal(withTable.changes()?.seatedAt?.toISOString(), beforeStart.toISOString());
});

test("a repository without occupancy support still records the status", async () => {
  const flow = setup("Arrived", { occupancy: false });
  assert.equal((await flow.move("Seated", beforeStart)).status, "Seated");
  assert.deepEqual(flow.occupancy, []);
});
