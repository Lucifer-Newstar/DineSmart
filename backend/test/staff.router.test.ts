import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import { createStaffRouter } from "../src/staff/staff.router.js";
import { StaffServiceError } from "../src/staff/staff.service.js";
import type { StaffRecord, StaffServiceReader, StaffUpdate } from "../src/staff/staff.types.js";

const restaurantId = new ObjectId();
const managerId = new ObjectId();
const staffId = new ObjectId();
const staffUserId = new ObjectId();
const now = new Date("2026-10-11T12:00:00.000Z");
const authToken = "valid-token";

function makeRecord(): StaffRecord {
  return {
    id: staffId,
    userId: staffUserId,
    name: "Ananya Menon",
    email: "ananya@example.test",
    role: "Reception",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

class FakeStaffService implements StaffServiceReader {
  record: StaffRecord | null = makeRecord();
  listCalls: ObjectId[] = [];
  updateCalls: Array<{
    restaurantId: ObjectId;
    staffId: ObjectId;
    actorUserId: ObjectId;
    changes: StaffUpdate;
  }> = [];
  error?: StaffServiceError;

  async list(id: ObjectId) {
    this.listCalls.push(id);
    return { staff: this.record ? [this.record] : [], truncated: false };
  }

  async update(id: ObjectId, targetStaffId: ObjectId, actorUserId: ObjectId, changes: StaffUpdate) {
    this.updateCalls.push({ restaurantId: id, staffId: targetStaffId, actorUserId, changes });
    if (this.error) throw this.error;
    if (!this.record?.id.equals(targetStaffId)) {
      throw new StaffServiceError(404, "staff_not_found", "The staff member was not found.");
    }
    return { ...this.record, ...changes, updatedAt: now };
  }
}

function createApp(
  service: FakeStaffService,
  principal: { userId: string; role: string; restaurantId: string | null } = {
    userId: managerId.toHexString(),
    role: "Manager",
    restaurantId: restaurantId.toHexString(),
  },
) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/staff",
    createStaffRouter({
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

test("staff GET returns a bounded safe roster for the signed restaurant", async () => {
  const service = new FakeStaffService();
  await withServer(createApp(service), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/staff`, {
      headers: { authorization: `Bearer ${authToken}` },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      staff: [
        {
          id: staffId.toHexString(),
          userId: staffUserId.toHexString(),
          name: "Ananya Menon",
          email: "ananya@example.test",
          role: "Reception",
          isActive: true,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ],
      truncated: false,
    });
    assert.equal(service.listCalls[0]?.toHexString(), restaurantId.toHexString());
  });
});

test("staff GET rejects client-selected filters and roles without staff permission", async () => {
  const service = new FakeStaffService();
  await withServer(createApp(service), async (baseUrl) => {
    const filtered = await fetch(
      `${baseUrl}/api/v1/staff?restaurantId=${restaurantId.toHexString()}`,
      {
        headers: { authorization: `Bearer ${authToken}` },
      },
    );
    assert.equal(filtered.status, 400);
    assert.equal(service.listCalls.length, 0);
  });

  const administratorService = new FakeStaffService();
  await withServer(
    createApp(administratorService, {
      userId: new ObjectId().toHexString(),
      role: "Administrator",
      restaurantId: restaurantId.toHexString(),
    }),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/staff`, {
        headers: { authorization: `Bearer ${authToken}` },
      });
      assert.equal(response.status, 200);
    },
  );

  const restrictedService = new FakeStaffService();
  await withServer(
    createApp(restrictedService, {
      userId: new ObjectId().toHexString(),
      role: "Reception",
      restaurantId: restaurantId.toHexString(),
    }),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/staff`, {
        headers: { authorization: `Bearer ${authToken}` },
      });
      assert.equal(response.status, 403);
      assert.equal(restrictedService.listCalls.length, 0);
    },
  );
});

test("staff PUT accepts only supported fields and derives actor and tenant from the principal", async () => {
  const service = new FakeStaffService();
  await withServer(createApp(service), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/staff/${staffId.toHexString()}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ role: "Kitchen Staff", isActive: false }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(service.updateCalls[0], {
      restaurantId,
      staffId,
      actorUserId: managerId,
      changes: { role: "Kitchen Staff", isActive: false },
    });
    const result = (await response.json()) as { staff: { role: string; isActive: boolean } };
    assert.equal(result.staff.role, "Kitchen Staff");
    assert.equal(result.staff.isActive, false);
  });
});

test("staff PUT rejects malformed IDs, extra fields, query filters, and invalid role values", async () => {
  const service = new FakeStaffService();
  await withServer(createApp(service), async (baseUrl) => {
    const malformedId = await fetch(`${baseUrl}/api/v1/staff/not-an-id`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    assert.equal(malformedId.status, 400);

    const extraField = await fetch(`${baseUrl}/api/v1/staff/${staffId.toHexString()}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ isActive: false, email: "forged@example.test" }),
    });
    assert.equal(extraField.status, 400);

    const forgedTenant = await fetch(`${baseUrl}/api/v1/staff/${staffId.toHexString()}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ isActive: false, restaurantId: new ObjectId().toHexString() }),
    });
    assert.equal(forgedTenant.status, 403);

    const query = await fetch(`${baseUrl}/api/v1/staff/${staffId.toHexString()}?role=Manager`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    assert.equal(query.status, 400);

    const invalidRole = await fetch(`${baseUrl}/api/v1/staff/${staffId.toHexString()}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ role: "Customer" }),
    });
    assert.equal(invalidRole.status, 400);
    assert.equal(service.updateCalls.length, 0);
  });
});

test("staff PUT returns non-enumerating 404 for missing or out-of-tenant membership", async () => {
  const service = new FakeStaffService();
  service.record = null;
  await withServer(createApp(service), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/staff/${staffId.toHexString()}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: { code: "staff_not_found", message: "The staff member was not found." },
    });
  });
});

test("staff endpoints reject missing auth, Customer scope, and self-deactivation errors", async () => {
  const service = new FakeStaffService();
  await withServer(createApp(service), async (baseUrl) => {
    const missingToken = await fetch(`${baseUrl}/api/v1/staff`);
    assert.equal(missingToken.status, 401);
  });

  await withServer(
    createApp(service, {
      userId: new ObjectId().toHexString(),
      role: "Customer",
      restaurantId: null,
    }),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/staff`, {
        headers: { authorization: `Bearer ${authToken}` },
      });
      assert.equal(response.status, 403);
    },
  );

  service.error = new StaffServiceError(
    409,
    "staff_self_deactivation_forbidden",
    "You cannot deactivate your own account.",
  );
  await withServer(createApp(service), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/staff/${staffId.toHexString()}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${authToken}`, "content-type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    assert.equal(response.status, 409);
    assert.equal(service.updateCalls[0]?.actorUserId.toHexString(), managerId.toHexString());
  });
});
