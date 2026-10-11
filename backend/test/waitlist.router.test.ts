import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import { createWaitlistRouter } from "../src/waitlist/waitlist.router.js";
import { WaitlistServiceError } from "../src/waitlist/waitlist.service.js";
import type {
  WaitlistCreateInput,
  WaitlistRecord,
  WaitlistResolution,
  WaitlistServiceReader,
} from "../src/waitlist/waitlist.types.js";

const restaurantId = new ObjectId();
const managerId = new ObjectId();
const entryId = new ObjectId();
const tableId = new ObjectId();
const now = new Date("2026-10-11T11:30:00.000Z");
const authToken = "valid-token";

function makeRecord(status: WaitlistRecord["status"] = "waiting"): WaitlistRecord {
  return {
    id: entryId,
    restaurantId,
    guestName: "Asha Raman",
    partySize: 3,
    phone: "+91 90000 11111",
    notes: "High chair",
    status,
    ...(status === "seated" ? { tableId, seatedAt: now } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

class FakeWaitlistService implements WaitlistServiceReader {
  listCalls: ObjectId[] = [];
  addCalls: Array<{ restaurantId: ObjectId; input: WaitlistCreateInput }> = [];
  resolveCalls: Array<{
    restaurantId: ObjectId;
    entryId: ObjectId;
    resolution: WaitlistResolution;
  }> = [];
  error?: WaitlistServiceError;

  async list(id: ObjectId) {
    this.listCalls.push(id);
    if (this.error) throw this.error;
    return { entries: [makeRecord()], truncated: true };
  }

  async add(id: ObjectId, input: WaitlistCreateInput) {
    this.addCalls.push({ restaurantId: id, input });
    if (this.error) throw this.error;
    return makeRecord();
  }

  async resolve(id: ObjectId, targetId: ObjectId, resolution: WaitlistResolution) {
    this.resolveCalls.push({ restaurantId: id, entryId: targetId, resolution });
    if (this.error) throw this.error;
    return makeRecord(resolution.status);
  }
}

function createApp(
  service: FakeWaitlistService,
  principal: { userId: string; role: string; restaurantId: string | null } = {
    userId: managerId.toHexString(),
    role: "Manager",
    restaurantId: restaurantId.toHexString(),
  },
) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/waitlist",
    createWaitlistRouter({
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

test("waitlist GET returns the bounded FIFO queue without tenant identifiers", async () => {
  const service = new FakeWaitlistService();
  await withServer(createApp(service), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/waitlist`, {
      headers: { authorization: `Bearer ${authToken}` },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      entries: [
        {
          id: entryId.toHexString(),
          guestName: "Asha Raman",
          partySize: 3,
          phone: "+91 90000 11111",
          notes: "High chair",
          status: "waiting",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ],
      truncated: true,
    });
    assert.equal(service.listCalls[0]?.toHexString(), restaurantId.toHexString());
  });
});

test("Reception may manage the queue; Customers, Kitchen Staff, and missing auth are denied", async () => {
  const receptionistService = new FakeWaitlistService();
  await withServer(
    createApp(receptionistService, {
      userId: new ObjectId().toHexString(),
      role: "Reception",
      restaurantId: restaurantId.toHexString(),
    }),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/waitlist`, {
        headers: { authorization: `Bearer ${authToken}` },
      });
      assert.equal(response.status, 200);
    },
  );

  for (const role of ["Customer", "Kitchen Staff"]) {
    const service = new FakeWaitlistService();
    await withServer(
      createApp(service, {
        userId: new ObjectId().toHexString(),
        role,
        restaurantId: role === "Customer" ? null : restaurantId.toHexString(),
      }),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/v1/waitlist`, {
          headers: { authorization: `Bearer ${authToken}` },
        });
        assert.equal(response.status, 403);
        assert.equal(service.listCalls.length, 0);
      },
    );
  }

  await withServer(createApp(new FakeWaitlistService()), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/waitlist`);
    assert.equal(response.status, 401);
  });
});

test("waitlist POST derives tenant from auth and accepts only bounded walk-in input fields", async () => {
  const service = new FakeWaitlistService();
  await withServer(createApp(service), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/waitlist`, {
      method: "POST",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        guestName: "Asha Raman",
        partySize: 3,
        phone: "+91 90000 11111",
        notes: "High chair",
      }),
    });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(service.addCalls[0], {
      restaurantId,
      input: {
        guestName: "Asha Raman",
        partySize: 3,
        phone: "+91 90000 11111",
        notes: "High chair",
      },
    });
    const result = (await response.json()) as { entry: { status: string } };
    assert.equal(result.entry.status, "waiting");
  });
});

test("waitlist routes reject forged tenant, query filters, malformed IDs, and extra body properties", async () => {
  const service = new FakeWaitlistService();
  await withServer(createApp(service), async (baseUrl) => {
    const query = await fetch(`${baseUrl}/api/v1/waitlist?status=waiting`, {
      headers: { authorization: `Bearer ${authToken}` },
    });
    assert.equal(query.status, 400);

    const forgedTenant = await fetch(`${baseUrl}/api/v1/waitlist`, {
      method: "POST",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ guestName: "Asha", partySize: 2, restaurantId: new ObjectId() }),
    });
    assert.equal(forgedTenant.status, 403);

    const extraField = await fetch(`${baseUrl}/api/v1/waitlist`, {
      method: "POST",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ guestName: "Asha", partySize: 2, email: "asha@example.test" }),
    });
    assert.equal(extraField.status, 400);

    const malformedId = await fetch(`${baseUrl}/api/v1/waitlist/nope`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    assert.equal(malformedId.status, 400);
    assert.equal(service.addCalls.length, 0);
  });
});

test("waitlist PUT accepts staff-directed seating, cancellation, and no-show only", async () => {
  const service = new FakeWaitlistService();
  await withServer(createApp(service), async (baseUrl) => {
    const seated = await fetch(`${baseUrl}/api/v1/waitlist/${entryId.toHexString()}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "seated", tableId: tableId.toHexString() }),
    });
    assert.equal(seated.status, 200);
    assert.deepEqual(service.resolveCalls[0], {
      restaurantId,
      entryId,
      resolution: { status: "seated", tableId },
    });

    const noShow = await fetch(`${baseUrl}/api/v1/waitlist/${entryId.toHexString()}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "no_show" }),
    });
    assert.equal(noShow.status, 200);
    assert.deepEqual(service.resolveCalls[1]?.resolution, { status: "no_show" });

    const invalidSeating = await fetch(`${baseUrl}/api/v1/waitlist/${entryId.toHexString()}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "seated" }),
    });
    assert.equal(invalidSeating.status, 400);

    const invalidTerminal = await fetch(`${baseUrl}/api/v1/waitlist/${entryId.toHexString()}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "cancelled", tableId: tableId.toHexString() }),
    });
    assert.equal(invalidTerminal.status, 400);

    const query = await fetch(
      `${baseUrl}/api/v1/waitlist/${entryId.toHexString()}?status=waiting`,
      {
        method: "PUT",
        headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      },
    );
    assert.equal(query.status, 400);
  });
});

test("waitlist PUT maps stale-entry and tenant-safe table errors", async () => {
  const service = new FakeWaitlistService();
  await withServer(createApp(service), async (baseUrl) => {
    service.error = new WaitlistServiceError(
      409,
      "table_unavailable",
      "The table is not available.",
    );
    const unavailable = await fetch(`${baseUrl}/api/v1/waitlist/${entryId.toHexString()}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "seated", tableId: tableId.toHexString() }),
    });
    assert.equal(unavailable.status, 409);
    assert.equal(
      ((await unavailable.json()) as { error: { code: string } }).error.code,
      "table_unavailable",
    );

    service.error = new WaitlistServiceError(404, "waitlist_entry_not_found", "Not found.");
    const missing = await fetch(`${baseUrl}/api/v1/waitlist/${entryId.toHexString()}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    assert.equal(missing.status, 404);
  });
});
