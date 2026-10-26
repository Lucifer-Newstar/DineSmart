import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import type { AuthPrincipal } from "../src/auth/auth.service.js";
import {
  type AvailabilityRepository,
  ReservationAvailabilityService,
} from "../src/reservations/availability.service.js";
import { createReservationRouter } from "../src/reservations/reservation.router.js";
import type { ReservationServiceReader } from "../src/reservations/reservation.types.js";
import { type AssignableTable, suggestTable } from "../src/tables/table-assignment.js";

const floor: AssignableTable[] = [
  { id: "a", tableNumber: "1", capacity: 2, status: "available", zone: "Main" },
  { id: "b", tableNumber: "2", capacity: 4, status: "available", zone: "Main" },
  { id: "c", tableNumber: "3", capacity: 4, status: "available", zone: "Main", accessible: true },
  { id: "d", tableNumber: "4", capacity: 6, status: "available", zone: "Patio" },
  { id: "e", tableNumber: "5", capacity: 8, status: "out_of_service", zone: "Main" },
];

test("the smallest free table that fits wins, ties broken by table number", () => {
  assert.deepEqual(
    suggestTable(floor, 2, new Set())?.tables.map((table) => table.id),
    ["a"],
  );
  assert.deepEqual(
    suggestTable(floor, 3, new Set())?.tables.map((table) => table.id),
    ["b"],
  );
  assert.equal(suggestTable(floor, 3, new Set())?.spareSeats, 1);
  // Held tables are skipped.
  assert.deepEqual(
    suggestTable(floor, 3, new Set(["b"]))?.tables.map((table) => table.id),
    ["c"],
  );
});

test("an accessible request only offers accessible tables", () => {
  assert.deepEqual(
    suggestTable(floor, 2, new Set(), { needsAccessible: true })?.tables.map((table) => table.id),
    ["c"],
  );
  assert.equal(suggestTable(floor, 2, new Set(["c"]), { needsAccessible: true }), null);
});

test("when no single table fits, the tightest same-zone pair is offered", () => {
  const combo = suggestTable(floor, 7, new Set());
  assert.equal(combo?.kind, "combined");
  // a+b (6) is too small, b+c (8) fits with one spare seat; d is on the patio.
  assert.deepEqual(
    combo?.tables.map((table) => table.id),
    ["b", "c"],
  );
  assert.equal(combo?.spareSeats, 1);
  assert.equal(suggestTable(floor, 11, new Set()), null);
});

test("a full floor and tables in use right now give no suggestion", () => {
  assert.equal(suggestTable(floor, 2, new Set(["a", "b", "c", "d"])), null);
  const busy = floor.map((table) => ({ ...table, status: "occupied" }));
  assert.equal(suggestTable(busy, 2, new Set(), { skipOccupied: true }), null);
  assert.equal(suggestTable(busy, 2, new Set())?.tables[0].id, "a");
});

test("the suggestion route reads the booking's window and returns the table for staff", async () => {
  const restaurantId = new ObjectId();
  const reservationId = new ObjectId();
  const startAt = new Date("2026-10-11T13:30:00.000Z");
  const repository: AvailabilityRepository = {
    getActiveRestaurant: async () => ({ timeZone: "Asia/Kolkata" }),
    listTables: async () => [
      { id: "a", tableNumber: "1", capacity: 2, status: "available" },
      { id: "b", tableNumber: "2", capacity: 4, status: "available" },
    ],
    listActiveBookings: async () => [
      { tableId: "a", partySize: 2, startAt, endAt: new Date(startAt.getTime() + 5_400_000) },
    ],
    findBooking: async (_restaurant, id) =>
      id.equals(reservationId)
        ? { partySize: 2, startAt, endAt: new Date(startAt.getTime() + 5_400_000) }
        : null,
  };
  const availability = new ReservationAvailabilityService(
    repository,
    () => new Date("2026-10-11T06:00:00.000Z"),
  );
  const principal: AuthPrincipal = {
    userId: new ObjectId().toHexString(),
    role: "Reception",
    restaurantId: restaurantId.toHexString(),
  };
  const app = express();
  app.use(
    "/api/v1/reservations",
    createReservationRouter({
      createRuntime: async () => ({
        service: {} as ReservationServiceReader,
        verifyAccessToken: async () => principal,
        availability,
      }),
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api/v1/reservations`;
    const headers = { authorization: "Bearer staff" };
    const found = await fetch(`${base}/${reservationId.toHexString()}/table-suggestion`, {
      headers,
    });
    assert.equal(found.status, 200);
    const payload = (await found.json()) as {
      suggestion: { kind: string; tables: Array<{ tableNumber: string }> };
    };
    assert.equal(payload.suggestion.kind, "single");
    assert.deepEqual(
      payload.suggestion.tables.map((table) => table.tableNumber),
      ["2"],
    );
    const missing = await fetch(`${base}/${new ObjectId().toHexString()}/table-suggestion`, {
      headers,
    });
    assert.equal(missing.status, 404);
    const malformed = await fetch(`${base}/nope/table-suggestion`, { headers });
    assert.equal(malformed.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
