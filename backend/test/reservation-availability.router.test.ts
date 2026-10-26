import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import {
  type AvailabilityBooking,
  AvailabilityNotFoundError,
  type AvailabilityQuery,
  type AvailabilityReader,
  type AvailabilityRepository,
  ReservationAvailabilityService,
} from "../src/reservations/availability.service.js";
import { DEFAULT_BOOKING_RULES } from "../src/reservations/booking-rules.js";
import { createReservationRouter } from "../src/reservations/reservation.router.js";
import type { ReservationServiceReader } from "../src/reservations/reservation.types.js";

const restaurantId = new ObjectId();

async function request(path: string, availability?: AvailabilityReader) {
  const app = express();
  app.use(
    "/api/v1/reservations",
    createReservationRouter({
      createRuntime: async () => ({
        service: {} as ReservationServiceReader,
        verifyAccessToken: async () => {
          throw new Error("no token expected on the public route");
        },
        ...(availability ? { availability } : {}),
      }),
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    return await fetch(`http://127.0.0.1:${address.port}${path}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function fakeReader(calls: AvailabilityQuery[]): AvailabilityReader {
  return {
    getDay: async (query) => {
      calls.push(query);
      if (!query.restaurantId.equals(restaurantId)) throw new AvailabilityNotFoundError();
      return {
        date: query.date,
        partySize: query.partySize,
        timeZone: "Asia/Kolkata",
        turnMinutes: 90,
        slots: [
          {
            startAt: new Date("2026-10-12T13:30:00.000Z"),
            endAt: new Date("2026-10-12T15:00:00.000Z"),
            localTime: "19:00",
            available: true,
          },
          {
            startAt: new Date("2026-10-12T14:00:00.000Z"),
            endAt: new Date("2026-10-12T15:30:00.000Z"),
            localTime: "19:30",
            available: false,
            reason: "no_table",
          },
        ],
      };
    },
  };
}

const base = `/api/v1/reservations/availability?restaurantId=${restaurantId.toHexString()}`;

test("availability is public and returns slots with their local times and reasons", async () => {
  const calls: AvailabilityQuery[] = [];
  const response = await request(`${base}&date=2026-10-12&partySize=2`, fakeReader(calls));
  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    timeZone: string;
    slots: Array<{ localTime: string; available: boolean; reason?: string; startAt: string }>;
  };
  assert.equal(payload.timeZone, "Asia/Kolkata");
  assert.deepEqual(
    payload.slots.map((slot) => [slot.localTime, slot.available, slot.reason ?? null]),
    [
      ["19:00", true, null],
      ["19:30", false, "no_table"],
    ],
  );
  assert.equal(payload.slots[0].startAt, "2026-10-12T13:30:00.000Z");
  assert.equal(calls[0]?.partySize, 2);
  assert.equal(calls[0]?.date, "2026-10-12");
});

test("availability rejects bad dates, missing fields and party sizes over the limit", async () => {
  const calls: AvailabilityQuery[] = [];
  for (const query of [
    "&date=2026-02-30&partySize=2",
    "&date=12-10-2026&partySize=2",
    "&partySize=2",
    "&date=2026-10-12",
    "&date=2026-10-12&partySize=two",
    "&date=2026-10-12&partySize=2.5",
  ]) {
    const response = await request(`${base}${query}`, fakeReader(calls));
    assert.equal(response.status, 400, query);
    assert.equal(
      ((await response.json()) as { error: { code: string } }).error.code,
      "invalid_availability_query",
    );
  }
  for (const size of ["0", "13", "40"]) {
    const response = await request(`${base}&date=2026-10-12&partySize=${size}`, fakeReader(calls));
    assert.equal(response.status, 400);
    assert.equal(
      ((await response.json()) as { error: { code: string } }).error.code,
      "invalid_party_size",
    );
  }
  const badId = await request(
    "/api/v1/reservations/availability?restaurantId=nope&date=2026-10-12&partySize=2",
    fakeReader(calls),
  );
  assert.equal(badId.status, 400);
  assert.equal(calls.length, 0);
});

test("availability answers 404 for an unknown restaurant and 503 when not wired", async () => {
  const unknown = await request(
    `/api/v1/reservations/availability?restaurantId=${new ObjectId().toHexString()}&date=2026-10-12&partySize=2`,
    fakeReader([]),
  );
  assert.equal(unknown.status, 404);
  const unwired = await request(`${base}&date=2026-10-12&partySize=2`);
  assert.equal(unwired.status, 503);
});

test("the availability service reads a two-day booking window around the local day", async () => {
  const windows: Array<[Date, Date]> = [];
  const held: AvailabilityBooking = {
    tableId: "t1",
    partySize: 2,
    startAt: new Date("2026-10-12T13:30:00.000Z"),
    endAt: new Date("2026-10-12T15:00:00.000Z"),
  };
  const repository: AvailabilityRepository = {
    getActiveRestaurant: async () => ({
      timeZone: "Asia/Kolkata",
      operatingHours: { opensAt: "18:00", closesAt: "22:00" },
      bookingRules: DEFAULT_BOOKING_RULES,
    }),
    listTables: async () => [{ id: "t1", capacity: 2, status: "available" }],
    listActiveBookings: async (_restaurantId, from, to) => {
      windows.push([from, to]);
      return [held];
    },
  };
  const service = new ReservationAvailabilityService(
    repository,
    () => new Date("2026-10-11T00:00:00.000Z"),
  );
  const day = await service.getDay({ restaurantId, date: "2026-10-12", partySize: 2 });
  assert.equal(day.turnMinutes, 90);
  assert.deepEqual(
    day.slots.map((slot) => `${slot.localTime}:${slot.available ? "open" : slot.reason}`),
    [
      "18:00:no_table",
      "18:30:no_table",
      "19:00:no_table",
      "19:30:no_table",
      "20:00:no_table",
      "20:30:open",
    ],
  );
  assert.equal(windows[0][0].toISOString(), "2026-10-10T18:30:00.000Z");
  assert.equal(windows[0][1].toISOString(), "2026-10-13T18:30:00.000Z");
});
