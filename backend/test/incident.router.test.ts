import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import type { AuthPrincipal } from "../src/auth/auth.service.js";
import { createIncidentRouter } from "../src/incidents/incident.router.js";
import type { IncidentListResult, IncidentRecord } from "../src/incidents/incident.types.js";

const restaurantId = new ObjectId();
const otherRestaurantId = new ObjectId();
const incident: IncidentRecord = {
  id: new ObjectId(),
  restaurantId,
  type: "inventory_shortage",
  severity: "critical",
  status: "resolved",
  triggerSnapshot: {
    available: 0,
    lowStockThreshold: 4,
    unit: "kg",
    customerId: new ObjectId(),
  },
  affectedEntity: { type: "inventory_item", id: new ObjectId() },
  rootCause: "Available inventory is depleted.",
  createdAt: new Date("2026-10-11T11:00:00.000Z"),
  updatedAt: new Date("2026-10-11T12:00:00.000Z"),
  resolvedAt: new Date("2026-10-11T12:00:00.000Z"),
  resolutionReason: "condition_cleared",
};

async function getResponse(
  principal: AuthPrincipal,
  path: string,
  authorization = "Bearer valid-test-token",
  listForRestaurant: (id: ObjectId) => Promise<IncidentListResult> = async () => ({
    incidents: [incident],
    truncated: false,
  }),
) {
  const app = express();
  app.use(
    "/api/v1/incidents",
    createIncidentRouter({
      createRuntime: async () => ({
        service: { listForRestaurant },
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

function staff(role: AuthPrincipal["role"], scopedRestaurant = restaurantId): AuthPrincipal {
  return {
    userId: new ObjectId().toHexString(),
    role,
    restaurantId: scopedRestaurant.toHexString(),
  };
}

test("incident route returns bounded incident fields for a signed-scope Manager", async () => {
  let receivedRestaurantId: ObjectId | undefined;
  const response = await getResponse(
    staff("Manager"),
    "/api/v1/incidents",
    undefined,
    async (id) => {
      receivedRestaurantId = id;
      return { incidents: [incident], truncated: true };
    },
  );

  assert.equal(response.status, 200);
  assert.equal(receivedRestaurantId?.toHexString(), restaurantId.toHexString());
  const payload = (await response.json()) as {
    incidents: Array<Record<string, unknown>>;
    truncated: boolean;
  };
  assert.equal(payload.truncated, true);
  assert.equal(payload.incidents[0].id, incident.id.toHexString());
  assert.equal(payload.incidents[0].resolvedAt, "2026-10-11T12:00:00.000Z");
  assert.equal(payload.incidents[0].resolutionReason, "condition_cleared");
  assert.deepEqual(payload.incidents[0].triggerSnapshot, {
    available: 0,
    lowStockThreshold: 4,
    unit: "kg",
  });
  assert.equal("restaurantId" in payload.incidents[0], false);
});

test("incident route permits Administrators and denies roles without incident read access", async () => {
  const administratorResponse = await getResponse(staff("Administrator"), "/api/v1/incidents");
  assert.equal(administratorResponse.status, 200);

  for (const principal of [
    staff("Reception"),
    staff("Kitchen Staff"),
    { userId: new ObjectId().toHexString(), role: "Customer" as const, restaurantId: null },
  ]) {
    const response = await getResponse(principal, "/api/v1/incidents");
    assert.equal(response.status, 403);
  }

  const unauthenticated = await getResponse(staff("Manager"), "/api/v1/incidents", "");
  assert.equal(unauthenticated.status, 401);
});

test("incident route rejects client-selected tenants and filters", async () => {
  const crossTenant = await getResponse(
    staff("Manager"),
    `/api/v1/incidents?restaurantId=${otherRestaurantId.toHexString()}`,
  );
  assert.equal(crossTenant.status, 403);

  const clientFilter = await getResponse(staff("Manager"), "/api/v1/incidents?status=open");
  assert.equal(clientFilter.status, 400);
  assert.deepEqual(await clientFilter.json(), {
    error: {
      code: "invalid_incident_query",
      message: "Incidents do not accept client-selected filters.",
    },
  });
});

test("incident route fails closed if incident storage is unavailable", async () => {
  const response = await getResponse(staff("Manager"), "/api/v1/incidents", undefined, async () => {
    throw new Error("database unavailable");
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: {
      code: "incidents_unavailable",
      message: "Incidents are temporarily unavailable.",
    },
  });
});
