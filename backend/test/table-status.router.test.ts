import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import { createTableStatusRouter } from "../src/tables/table-status.router.js";
import { TableStatusServiceError } from "../src/tables/table-status.service.js";
import type {
  TableOperationalStatus,
  TableStatusRecord,
  TableStatusServiceReader,
} from "../src/tables/table-status.types.js";

const restaurantId = new ObjectId();
const managerId = new ObjectId();
const tableId = new ObjectId();
const now = new Date("2026-10-11T13:30:00.000Z");
const authToken = "valid-token";

function makeRecord(status: TableOperationalStatus = "occupied"): TableStatusRecord {
  return {
    id: tableId,
    tableNumber: "05",
    capacity: 4,
    zone: "Dining room",
    status,
    createdAt: now,
    updatedAt: now,
  };
}

class FakeTableStatusService implements TableStatusServiceReader {
  calls: Array<{ restaurantId: ObjectId; tableId: ObjectId; status: TableOperationalStatus }> = [];
  error?: TableStatusServiceError;
  listedFor: ObjectId[] = [];

  async list(restaurantId: ObjectId) {
    this.listedFor.push(restaurantId);
    if (this.error) throw this.error;
    return { tables: [makeRecord("available")], truncated: false };
  }

  async updateStatus(id: ObjectId, targetId: ObjectId, status: TableOperationalStatus) {
    this.calls.push({ restaurantId: id, tableId: targetId, status });
    if (this.error) throw this.error;
    return makeRecord(status);
  }
}

function createApp(
  service: FakeTableStatusService,
  principal: { userId: string; role: string; restaurantId: string | null } = {
    userId: managerId.toHexString(),
    role: "Manager",
    restaurantId: restaurantId.toHexString(),
  },
) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/tables",
    createTableStatusRouter({
      createRuntime: async () => ({
        service,
        verifyAccessToken: async () => principal as never,
      }),
    }),
  );
  return app;
}

async function withServer<T>(app: express.Express, callback: (baseUrl: string) => Promise<T>) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("table status PUT returns a no-store safe summary using the signed restaurant", async () => {
  const service = new FakeTableStatusService();
  await withServer(createApp(service), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/tables/${tableId.toHexString()}/status`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "occupied" }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(service.calls[0], { restaurantId, tableId, status: "occupied" });
    assert.deepEqual(await response.json(), {
      table: {
        id: tableId.toHexString(),
        tableNumber: "05",
        capacity: 4,
        zone: "Dining room",
        status: "occupied",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    });
  });
});

test("Reception may update table status; Customers and Kitchen Staff are denied", async () => {
  const receptionist = new FakeTableStatusService();
  await withServer(
    createApp(receptionist, {
      userId: new ObjectId().toHexString(),
      role: "Reception",
      restaurantId: restaurantId.toHexString(),
    }),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/tables/${tableId.toHexString()}/status`, {
        method: "PUT",
        headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
        body: JSON.stringify({ status: "available" }),
      });
      assert.equal(response.status, 200);
    },
  );

  for (const role of ["Customer", "Kitchen Staff"]) {
    const service = new FakeTableStatusService();
    await withServer(
      createApp(service, {
        userId: new ObjectId().toHexString(),
        role,
        restaurantId: role === "Customer" ? null : restaurantId.toHexString(),
      }),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/tables/${tableId.toHexString()}/status`, {
          method: "PUT",
          headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
          body: JSON.stringify({ status: "available" }),
        });
        assert.equal(response.status, 403);
        assert.equal(service.calls.length, 0);
      },
    );
  }
});

test("table status PUT rejects malformed paths, unknown fields, tenant forgery, filters, and aliases", async () => {
  const service = new FakeTableStatusService();
  await withServer(createApp(service), async (baseUrl) => {
    const malformed = await fetch(`${baseUrl}/api/v1/tables/nope/status`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "available" }),
    });
    assert.equal(malformed.status, 400);

    const extraField = await fetch(`${baseUrl}/api/v1/tables/${tableId.toHexString()}/status`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "available", force: true }),
    });
    assert.equal(extraField.status, 400);

    const forgedTenant = await fetch(`${baseUrl}/api/v1/tables/${tableId.toHexString()}/status`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "available", restaurantId: new ObjectId() }),
    });
    assert.equal(forgedTenant.status, 403);

    const filtered = await fetch(
      `${baseUrl}/api/v1/tables/${tableId.toHexString()}/status?force=true`,
      {
        method: "PUT",
        headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
        body: JSON.stringify({ status: "available" }),
      },
    );
    assert.equal(filtered.status, 400);

    for (const status of ["Out of Service", "out-of-service", "cleaning", "Reserved "]) {
      const invalid = await fetch(`${baseUrl}/api/v1/tables/${tableId.toHexString()}/status`, {
        method: "PUT",
        headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      assert.equal(invalid.status, 400);
    }
    assert.equal(service.calls.length, 0);
  });
});

test("table status PUT maps missing table, active assignment, and transition conflicts", async () => {
  const service = new FakeTableStatusService();
  await withServer(createApp(service), async (baseUrl) => {
    service.error = new TableStatusServiceError(404, "table_not_found", "The table was not found.");
    const missing = await fetch(`${baseUrl}/api/v1/tables/${tableId.toHexString()}/status`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "available" }),
    });
    assert.equal(missing.status, 404);

    service.error = new TableStatusServiceError(
      409,
      "table_assignment_active",
      "Resolve assignment first.",
    );
    const conflict = await fetch(`${baseUrl}/api/v1/tables/${tableId.toHexString()}/status`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "available" }),
    });
    assert.equal(conflict.status, 409);

    const noToken = await fetch(`${baseUrl}/api/v1/tables/${tableId.toHexString()}/status`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "available" }),
    });
    assert.equal(noToken.status, 401);
  });
});

test("table list returns the signed restaurant's tables without tenant or assignment IDs", async () => {
  const service = new FakeTableStatusService();
  await withServer(createApp(service), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/tables`, {
      headers: { authorization: `Bearer ${authToken}` },
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      tables: Array<Record<string, unknown>>;
      truncated: boolean;
    };
    assert.equal(body.truncated, false);
    assert.equal(body.tables.length, 1);
    assert.equal(body.tables[0].status, "available");
    assert.equal("restaurantId" in body.tables[0], false);
    assert.equal("currentWaitlistId" in body.tables[0], false);
    assert.ok(service.listedFor[0].equals(restaurantId));

    const filtered = await fetch(
      `${baseUrl}/api/v1/tables?restaurantId=${new ObjectId().toHexString()}`,
      {
        headers: { authorization: `Bearer ${authToken}` },
      },
    );
    assert.equal(filtered.status, 403, "a client-chosen tenant is refused");

    const statusFilter = await fetch(`${baseUrl}/api/v1/tables?status=available`, {
      headers: { authorization: `Bearer ${authToken}` },
    });
    assert.equal(statusFilter.status, 400, "list filters are not supported");
  });

  for (const role of ["Customer", "Kitchen Staff"]) {
    await withServer(
      createApp(new FakeTableStatusService(), {
        userId: managerId.toHexString(),
        role,
        restaurantId: role === "Customer" ? null : restaurantId.toHexString(),
      }),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/tables`, {
          headers: { authorization: `Bearer ${authToken}` },
        });
        assert.equal(response.status, 403, `${role} cannot list tables`);
      },
    );
  }
});
