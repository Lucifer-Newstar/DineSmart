import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import { DEFAULT_BOOKING_RULES, resolveBookingRules } from "../src/reservations/booking-rules.js";
import {
  estimateWaitMinutes,
  WAIT_QUOTE_CAP_MINUTES,
  type WaitQuoteRepository,
  type WaitQuoter,
  WaitQuoteService,
  type WaitTable,
} from "../src/waitlist/wait-estimate.js";
import { createWaitlistRouter } from "../src/waitlist/waitlist.router.js";
import type { WaitlistServiceReader } from "../src/waitlist/waitlist.types.js";

const now = new Date("2026-10-11T13:00:00.000Z");
const rules = resolveBookingRules(DEFAULT_BOOKING_RULES);
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

function quote(partySize: number, partiesAhead: number[], tables: WaitTable[]) {
  return estimateWaitMinutes({ partySize, partiesAhead, tables, rules, now });
}

test("the quote is zero while a fitting table is free and nobody is ahead", () => {
  assert.equal(quote(2, [], [{ capacity: 2, status: "available" }]), 0);
  // One free table and one party ahead: the party ahead takes it.
  assert.ok(quote(2, [2], [{ capacity: 2, status: "available" }]) > 0);
});

test("the quote follows when the current party's turn ends, rounded up to five minutes", () => {
  // Seated 62 minutes ago on a 2-top with a 90-minute turn: 28 minutes left, quoted 30.
  assert.equal(
    quote(2, [], [{ capacity: 2, status: "occupied", occupiedSince: minutesAgo(62) }]),
    30,
  );
  // An overstaying party is quoted as leaving now, never in the past.
  assert.equal(
    quote(2, [], [{ capacity: 2, status: "occupied", occupiedSince: minutesAgo(200) }]),
    0,
  );
  // Without a seated time, half a turn is assumed.
  assert.equal(quote(2, [], [{ capacity: 2, status: "occupied" }]), 45);
});

test("the quote grows with the queue and never shrinks as parties join ahead", () => {
  const tables: WaitTable[] = [
    { capacity: 4, status: "occupied", occupiedSince: minutesAgo(30) },
    { capacity: 4, status: "occupied", occupiedSince: minutesAgo(60) },
  ];
  const quotes = [0, 1, 2, 3].map((ahead) => quote(2, Array(ahead).fill(2), tables));
  for (let index = 1; index < quotes.length; index += 1) {
    assert.ok(quotes[index] >= quotes[index - 1], `quotes ${quotes.join(",")}`);
  }
  assert.equal(quotes[0], 30);
  assert.equal(quotes[1], 60);
});

test("the quote is capped, and no fitting table at all gives the cap", () => {
  const busy: WaitTable[] = [{ capacity: 2, status: "occupied", occupiedSince: now }];
  assert.equal(quote(2, [2, 2, 2, 2], busy), WAIT_QUOTE_CAP_MINUTES);
  assert.equal(quote(8, [], [{ capacity: 4, status: "available" }]), WAIT_QUOTE_CAP_MINUTES);
  assert.equal(quote(2, [], [{ capacity: 4, status: "out_of_service" }]), WAIT_QUOTE_CAP_MINUTES);
});

function repository(overrides: Partial<WaitQuoteRepository> = {}): WaitQuoteRepository {
  return {
    getBookingRules: async () => ({ found: true }),
    listTables: async () => [{ capacity: 2, status: "occupied", occupiedSince: minutesAgo(62) }],
    listWaiting: async () => [
      { id: new ObjectId("710000000000000000000101"), partySize: 2 },
      { id: new ObjectId("710000000000000000000102"), partySize: 2 },
    ],
    ...overrides,
  };
}

test("queue quotes give each entry the wait behind the parties ahead of it", async () => {
  const service = new WaitQuoteService(repository(), () => now);
  const quotes = await service.quoteQueue(new ObjectId());
  assert.equal(quotes.get("710000000000000000000101"), 30);
  assert.equal(quotes.get("710000000000000000000102"), 120);
  assert.equal(await service.quoteNewParty(new ObjectId(), 2), 120);
  const unknown = new WaitQuoteService(
    repository({ getBookingRules: async () => ({ found: false }) }),
    () => now,
  );
  assert.equal(await unknown.quoteNewParty(new ObjectId(), 2), null);
});

async function call(path: string, quoter?: WaitQuoter) {
  const app = express();
  app.use(
    "/api/v1/waitlist",
    createWaitlistRouter({
      createRuntime: async () => ({
        service: {} as WaitlistServiceReader,
        verifyAccessToken: async () => {
          throw new Error("public route");
        },
        ...(quoter ? { quoter } : {}),
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

test("the public estimate route validates its query and answers without a token", async () => {
  const quoter = new WaitQuoteService(repository(), () => now);
  const id = new ObjectId().toHexString();
  const ok = await call(`/api/v1/waitlist/estimate?restaurantId=${id}&partySize=2`, quoter);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { partySize: 2, quotedWaitMinutes: 120 });
  for (const query of [
    "partySize=2",
    `restaurantId=${id}&partySize=0`,
    `restaurantId=${id}&partySize=13`,
    `restaurantId=x&partySize=2`,
  ]) {
    assert.equal((await call(`/api/v1/waitlist/estimate?${query}`, quoter)).status, 400, query);
  }
  assert.equal(
    (await call(`/api/v1/waitlist/estimate?restaurantId=${id}&partySize=2`)).status,
    503,
  );
});
