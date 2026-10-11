import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import { createAnalyticsRouter } from "../src/analytics/analytics.router.js";
import type { AnalyticsRange, AnalyticsResult } from "../src/analytics/analytics.types.js";
import type { AuthPrincipal } from "../src/auth/auth.service.js";

const restaurantId = new ObjectId().toHexString();
const otherRestaurantId = new ObjectId().toHexString();
const result: AnalyticsResult = {
  range: "7d",
  period: {
    startAt: "2026-10-05T18:30:00.000Z",
    endAt: "2026-10-11T20:00:00.000Z",
    timeZone: "Asia/Kolkata",
  },
  generatedAt: "2026-10-11T20:00:00.000Z",
  summary: {
    ordersPlaced: 4,
    ordersFulfilled: 2,
    ordersCancelled: 1,
    ordersInProgress: 1,
    averagePrepMinutes: 12.5,
    averagePrepObservations: 2,
    reservationsScheduled: 3,
    reservationsConfirmed: 1,
    reservationsSeated: 1,
    reservationsCompleted: 0,
    reservationsNoShow: 1,
    inventoryItems: 10,
    lowStockItems: 2,
    outOfStockItems: 1,
  },
  daily: [{ date: "2026-10-06", ordersPlaced: 4, reservationsScheduled: 3 }],
  hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, ordersPlaced: hour === 19 ? 4 : 0 })),
  sampling: { perCollectionLimit: 2_000, truncatedCollections: [] },
};

async function getResponse(
  principal: AuthPrincipal,
  path: string,
  authorization = "Bearer valid-test-token",
  getAnalytics: (
    restaurantId: ObjectId,
    range: AnalyticsRange,
  ) => Promise<AnalyticsResult> = async () => result,
) {
  const app = express();
  app.use(
    "/api/v1/analytics",
    createAnalyticsRouter({
      createRuntime: async () => ({
        service: { getAnalytics },
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

function principal(role: AuthPrincipal["role"], scopedRestaurant = restaurantId): AuthPrincipal {
  return { userId: new ObjectId().toHexString(), role, restaurantId: scopedRestaurant };
}

test("analytics route returns operational aggregates to an authorized tenant manager", async () => {
  let receivedRestaurantId: ObjectId | undefined;
  let receivedRange: AnalyticsRange | undefined;
  const response = await getResponse(
    principal("Manager"),
    "/api/v1/analytics?range=30d",
    undefined,
    async (id, range) => {
      receivedRestaurantId = id;
      receivedRange = range;
      return { ...result, range };
    },
  );

  assert.equal(response.status, 200);
  assert.equal(receivedRestaurantId?.toHexString(), restaurantId);
  assert.equal(receivedRange, "30d");
  assert.deepEqual(await response.json(), { ...result, range: "30d" });
});

test("analytics route defaults to seven days and requires analytics permission", async () => {
  let receivedRange: AnalyticsRange | undefined;
  const managerResponse = await getResponse(
    principal("Administrator"),
    "/api/v1/analytics",
    undefined,
    async (_id, range) => {
      receivedRange = range;
      return result;
    },
  );
  assert.equal(managerResponse.status, 200);
  assert.equal(receivedRange, "7d");

  const customerResponse = await getResponse(
    { userId: new ObjectId().toHexString(), role: "Customer", restaurantId: null },
    "/api/v1/analytics",
  );
  assert.equal(customerResponse.status, 403);

  const receptionResponse = await getResponse(principal("Reception"), "/api/v1/analytics");
  assert.equal(receptionResponse.status, 403);

  const unauthenticatedResponse = await getResponse(principal("Manager"), "/api/v1/analytics", "");
  assert.equal(unauthenticatedResponse.status, 401);
});

test("analytics route rejects client-selected tenant IDs and invalid or repeated query keys", async () => {
  const crossTenant = await getResponse(
    principal("Manager"),
    `/api/v1/analytics?restaurantId=${otherRestaurantId}`,
  );
  assert.equal(crossTenant.status, 403);

  for (const path of [
    "/api/v1/analytics?range=90d",
    "/api/v1/analytics?range=7d&range=30d",
    "/api/v1/analytics?from=2026-10-01",
  ]) {
    const response = await getResponse(principal("Manager"), path);
    assert.equal(response.status, 400, path);
    assert.equal(
      ((await response.json()) as { error: { code: string } }).error.code,
      "invalid_analytics_query",
    );
  }
});

test("analytics route returns an unavailable error instead of fabricated metrics on failure", async () => {
  const response = await getResponse(
    principal("Manager"),
    "/api/v1/analytics",
    undefined,
    async () => {
      throw new Error("database unavailable");
    },
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: {
      code: "analytics_unavailable",
      message: "Analytics are temporarily unavailable.",
    },
  });
});
