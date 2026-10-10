import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import type { AuthPrincipal } from "../src/auth/auth.service.js";
import { createHealthScoreRouter } from "../src/healthscore/health-score.router.js";
import type { HealthScoreResult } from "../src/healthscore/health-score.types.js";

const restaurantId = new ObjectId().toHexString();
const otherRestaurantId = new ObjectId().toHexString();
const score: HealthScoreResult = {
  score: 82,
  calculatedAt: "2026-10-10T12:00:00.000Z",
  windowStart: "2026-10-09T12:00:00.000Z",
  windowEnd: "2026-10-10T12:00:00.000Z",
  components: {
    kitchenEfficiency: { score: 80, weight: 25, observations: 2, status: "observed", detail: "ok" },
    inventoryHealth: { score: 100, weight: 20, observations: 1, status: "observed", detail: "ok" },
    orderCompletionRate: {
      score: 70,
      weight: 20,
      observations: 2,
      status: "observed",
      detail: "ok",
    },
    reservationEfficiency: {
      score: 50,
      weight: 15,
      observations: 0,
      status: "insufficient_data",
      detail: "n/a",
    },
    tableUtilization: { score: 75, weight: 10, observations: 4, status: "observed", detail: "ok" },
    incidentFrequency: {
      score: 100,
      weight: 10,
      observations: 1,
      status: "observed",
      detail: "ok",
    },
  },
  sampling: { perCollectionLimit: 2_000, truncatedCollections: [] },
};

async function getResponse(principal: AuthPrincipal, path: string, authorization?: string) {
  const app = express();
  app.use(
    "/api/v1/healthscore",
    createHealthScoreRouter({
      createRuntime: async () => ({
        service: { getScore: async () => score },
        verifyAccessToken: async (token) => {
          if (token !== "valid-test-token") throw new Error("invalid token");
          return principal;
        },
      }),
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    return await fetch(`http://127.0.0.1:${address.port}${path}`, {
      headers: authorization ? { authorization } : {},
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function managerPrincipal(): AuthPrincipal {
  return { userId: new ObjectId().toHexString(), role: "Manager", restaurantId };
}

test("health score route returns a tenant-scoped result to an authorized restaurant user", async () => {
  const response = await getResponse(
    managerPrincipal(),
    "/api/v1/healthscore",
    "Bearer valid-test-token",
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), score);
});

test("health score route requires authentication and an operational role", async () => {
  const unauthenticated = await getResponse(managerPrincipal(), "/api/v1/healthscore");
  assert.equal(unauthenticated.status, 401);

  const customer = await getResponse(
    { userId: new ObjectId().toHexString(), role: "Customer", restaurantId: null },
    "/api/v1/healthscore",
    "Bearer valid-test-token",
  );
  assert.equal(customer.status, 403);

  const kitchenStaff = await getResponse(
    { userId: new ObjectId().toHexString(), role: "Kitchen Staff", restaurantId },
    "/api/v1/healthscore",
    "Bearer valid-test-token",
  );
  assert.equal(kitchenStaff.status, 403);
});

test("health score route rejects a client-selected restaurant outside the principal scope", async () => {
  const response = await getResponse(
    managerPrincipal(),
    `/api/v1/healthscore?restaurantId=${otherRestaurantId}`,
    "Bearer valid-test-token",
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: {
      code: "restaurant_scope_mismatch",
      message: "The requested restaurant is outside your access scope.",
    },
  });
});
