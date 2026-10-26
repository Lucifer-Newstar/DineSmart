import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import type { AuditChange } from "../src/audit/audit.service.js";
import type { AuthPrincipal } from "../src/auth/auth.service.js";
import { DEFAULT_BOOKING_RULES } from "../src/reservations/booking-rules.js";
import {
  type BookingRulesRepository,
  createBookingRulesRouter,
} from "../src/reservations/booking-rules.router.js";

const restaurantId = new ObjectId();

async function call(
  role: AuthPrincipal["role"],
  method: "GET" | "PUT",
  body?: unknown,
  stored: { rules?: unknown } | null = {},
) {
  const saved: unknown[] = [];
  const audits: AuditChange[] = [];
  const repository: BookingRulesRepository = {
    get: async () => stored,
    save: async (_id, rules) => {
      saved.push(rules);
      return true;
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/booking-rules",
    createBookingRulesRouter({
      createRuntime: async () => ({
        repository,
        verifyAccessToken: async () => ({
          userId: new ObjectId().toHexString(),
          role,
          restaurantId: role === "Customer" ? null : restaurantId.toHexString(),
        }),
        audit: async (change) => {
          audits.push(change);
        },
      }),
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/booking-rules`, {
      method,
      headers: {
        authorization: "Bearer token",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { response, saved, audits };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const changed = { ...DEFAULT_BOOKING_RULES, pacingCoversPer15Min: 12, minLeadMinutes: 30 };

test("staff read the rules, with defaults flagged until a manager saves them", async () => {
  const { response } = await call("Reception", "GET");
  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    rules: typeof DEFAULT_BOOKING_RULES;
    usingDefaults: boolean;
    limits: { maxPartySize: number };
  };
  assert.equal(payload.usingDefaults, true);
  assert.deepEqual(payload.rules, DEFAULT_BOOKING_RULES);
  assert.equal(payload.limits.maxPartySize, 12);

  const savedBefore = await call("Manager", "GET", undefined, { rules: changed });
  const savedPayload = (await savedBefore.response.json()) as { usingDefaults: boolean };
  assert.equal(savedPayload.usingDefaults, false);
});

test("a manager saves valid rules and the change is audited", async () => {
  const { response, saved, audits } = await call("Manager", "PUT", changed);
  assert.equal(response.status, 200);
  assert.deepEqual(saved, [changed]);
  assert.equal(audits[0]?.action, "restaurant.booking_rules_changed");
  assert.equal(audits[0]?.before.pacingCoversPer15Min, 20);
  assert.equal(audits[0]?.after.pacingCoversPer15Min, 12);
});

test("invalid rules are refused with the reason", async () => {
  const { response, saved } = await call("Manager", "PUT", { ...changed, maxAdvanceDays: 0 });
  assert.equal(response.status, 400);
  const payload = (await response.json()) as { error: { code: string; message: string } };
  assert.equal(payload.error.code, "invalid_booking_rules");
  assert.match(payload.error.message, /maxAdvanceDays/);
  assert.equal(saved.length, 0);
});

test("reception, kitchen and customers cannot change the rules", async () => {
  for (const role of ["Reception", "Kitchen Staff", "Customer"] as const) {
    const { response, saved } = await call(role, "PUT", changed);
    assert.equal(response.status, 403, role);
    assert.equal(saved.length, 0);
  }
  assert.equal((await call("Kitchen Staff", "GET")).response.status, 403);
  assert.equal((await call("Manager", "GET", undefined, null)).response.status, 404);
});
