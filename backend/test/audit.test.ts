import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { type Db, ObjectId } from "mongodb";
import { MongoAuditRepository } from "../src/audit/audit.repository.js";
import { createAuditRouter } from "../src/audit/audit.router.js";
import { AuditService, changedFields } from "../src/audit/audit.service.js";
import type {
  AuditEntry,
  AuditEntryInput,
  AuditPage,
  AuditQuery,
  AuditRepository,
} from "../src/audit/audit.types.js";
import type { UserRole } from "../src/database/schema.js";
import { COLLECTIONS } from "../src/database/schema.js";
import { InventoryService } from "../src/inventory/inventory.service.js";
import type { InventoryItemRecord, InventoryRepository } from "../src/inventory/inventory.types.js";
import { StaffService } from "../src/staff/staff.service.js";
import type { StaffRecord, StaffRepository } from "../src/staff/staff.types.js";

const restaurantA = new ObjectId();
const restaurantB = new ObjectId();
const managerA = new ObjectId();
const managerB = new ObjectId();
const base = new Date("2026-10-25T09:00:00.000Z");

/** In-memory twin of MongoAuditRepository with the same ordering and scoping. */
class MemoryAuditRepository implements AuditRepository {
  entries: AuditEntry[] = [];

  async insert(entry: AuditEntryInput, createdAt: Date): Promise<AuditEntry> {
    const saved = { ...entry, id: new ObjectId(), createdAt };
    this.entries.push(saved);
    return saved;
  }

  async findById(restaurantId: ObjectId, id: ObjectId) {
    return (
      this.entries.find(
        (entry) => entry.restaurantId.equals(restaurantId) && entry.id.equals(id),
      ) ?? null
    );
  }

  async listForRestaurant(restaurantId: ObjectId, query: AuditQuery): Promise<AuditPage> {
    const sorted = this.entries
      .filter((entry) => entry.restaurantId.equals(restaurantId))
      .filter((entry) => !query.action || entry.action === query.action)
      .filter(
        (entry) =>
          !query.before ||
          entry.createdAt < query.before.createdAt ||
          (entry.createdAt.getTime() === query.before.createdAt.getTime() &&
            entry.id.toHexString() < query.before.id.toHexString()),
      )
      .sort(
        (left, right) =>
          right.createdAt.getTime() - left.createdAt.getTime() ||
          right.id.toHexString().localeCompare(left.id.toHexString()),
      );
    return { entries: sorted.slice(0, query.limit), hasMore: sorted.length > query.limit };
  }
}

function staffRecord(overrides: Partial<StaffRecord> = {}): StaffRecord {
  return {
    id: new ObjectId(),
    userId: new ObjectId(),
    name: "Meera Das",
    email: "meera@example.test",
    role: "Kitchen Staff",
    isActive: true,
    createdAt: base,
    updatedAt: base,
    ...overrides,
  };
}

test("changedFields keeps only differing values and never secrets", () => {
  const id = new ObjectId();
  const diff = changedFields(
    { role: "Reception", isActive: true, passwordHash: "x", ref: id, at: base },
    {
      role: "Manager",
      isActive: true,
      passwordHash: "y",
      ref: id,
      at: new Date(base.getTime() + 1),
    },
  );
  assert.deepEqual(diff.before, { role: "Reception", at: base.toISOString() });
  assert.deepEqual(diff.after, { role: "Manager", at: new Date(base.getTime() + 1).toISOString() });
});

test("a change with nothing different writes no entry", async () => {
  const repository = new MemoryAuditRepository();
  const service = new AuditService(repository, () => base);
  await service.record({
    restaurantId: restaurantA,
    actor: { userId: managerA, role: "Manager" },
    action: "staff.role_changed",
    target: { type: "staff", id: new ObjectId() },
    before: { role: "Manager" },
    after: { role: "Manager" },
  });
  assert.equal(repository.entries.length, 0);
});

test("a role change and a deactivation write one entry each with actor, target, before and after", async () => {
  const before = staffRecord();
  const after = { ...before, role: "Reception" as const, isActive: false };
  const repository: StaffRepository = {
    listForRestaurant: async () => ({ staff: [before], truncated: false }),
    findForRestaurant: async () => before,
    updateForRestaurant: async () => after,
  };
  const audit = new MemoryAuditRepository();
  const service = new StaffService(repository, () => base, new AuditService(audit).record);

  await service.update(
    restaurantA,
    before.id,
    managerA,
    { role: "Reception", isActive: false },
    "Administrator",
  );

  assert.deepEqual(
    audit.entries.map((entry) => entry.action),
    ["staff.role_changed", "staff.deactivated"],
  );
  const [roleChange, deactivation] = audit.entries;
  assert.ok(roleChange && deactivation);
  assert.ok(roleChange.restaurantId.equals(restaurantA));
  assert.ok(roleChange.actor.userId.equals(managerA));
  assert.equal(roleChange.actor.role, "Administrator");
  assert.equal(roleChange.target.type, "staff");
  assert.ok(roleChange.target.id.equals(before.id));
  assert.equal(roleChange.target.label, "Meera Das");
  assert.deepEqual(roleChange.before, { role: "Kitchen Staff" });
  assert.deepEqual(roleChange.after, { role: "Reception" });
  assert.deepEqual(deactivation.before, { isActive: true });
  assert.deepEqual(deactivation.after, { isActive: false });
});

test("a failed audit write does not fail the staff change", async () => {
  const before = staffRecord();
  const repository: StaffRepository = {
    listForRestaurant: async () => ({ staff: [before], truncated: false }),
    updateForRestaurant: async () => ({ ...before, role: "Manager" }),
  };
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    const service = new StaffService(
      repository,
      () => base,
      async () => {
        throw new Error("audit store down");
      },
    );
    const result = await service.update(restaurantA, before.id, managerA, { role: "Manager" });
    assert.equal(result.role, "Manager");
    assert.equal(errors.length, 1);
  } finally {
    console.error = original;
  }
});

test("inventory audits threshold changes but not routine stock counts", async () => {
  let item: InventoryItemRecord = {
    id: new ObjectId(),
    name: "Ponni rice",
    quantity: 12,
    unit: "kg",
    lowStockThreshold: 8,
    lastAdjustedAt: base,
  };
  const repository: InventoryRepository = {
    listForRestaurant: async () => ({ items: [item], truncated: false }),
    findForRestaurant: async () => item,
    adjustItem: async (_restaurant, _id, adjustment) => {
      item = {
        ...item,
        quantity: adjustment.quantity,
        lowStockThreshold: adjustment.lowStockThreshold ?? item.lowStockThreshold,
      };
      return item;
    },
  };
  const audit = new MemoryAuditRepository();
  const service = new InventoryService(
    repository,
    () => base,
    undefined,
    undefined,
    undefined,
    new AuditService(audit).record,
  );
  const actor = { userId: managerA, role: "Manager" as UserRole };

  await service.adjust(restaurantA, item.id, { quantity: 10 }, actor);
  assert.equal(audit.entries.length, 0, "a count alone is not audited");

  await service.adjust(restaurantA, item.id, { quantity: 10, lowStockThreshold: 8 }, actor);
  assert.equal(audit.entries.length, 0, "an unchanged threshold is not audited");

  await service.adjust(restaurantA, item.id, { quantity: 10, lowStockThreshold: 5 }, actor);
  assert.equal(audit.entries.length, 1);
  assert.equal(audit.entries[0]?.action, "inventory.threshold_changed");
  assert.deepEqual(audit.entries[0]?.before, { lowStockThreshold: 8 });
  assert.deepEqual(audit.entries[0]?.after, { lowStockThreshold: 5 });
  assert.equal(audit.entries[0]?.target.label, "Ponni rice");
});

test("the Mongo repository filters every read by restaurant", async () => {
  const filters: Array<Record<string, unknown>> = [];
  const db = {
    collection(name: string) {
      assert.equal(name, COLLECTIONS.auditLogs);
      return {
        find(filter: Record<string, unknown>) {
          filters.push(filter);
          return {
            sort: () => ({ limit: () => ({ toArray: async () => [] }) }),
          };
        },
        async findOne(filter: Record<string, unknown>) {
          filters.push(filter);
          return null;
        },
      };
    },
  } as unknown as Db;
  const repository = new MongoAuditRepository(db);
  await repository.listForRestaurant(restaurantA, {
    limit: 10,
    action: "staff.role_changed",
    before: { createdAt: base, id: new ObjectId() },
  });
  await repository.findById(restaurantA, new ObjectId());
  assert.equal(filters.length, 2);
  for (const filter of filters) assert.ok((filter.restaurantId as ObjectId).equals(restaurantA));
  assert.equal(filters[0]?.action, "staff.role_changed");
  assert.ok(Array.isArray(filters[0]?.$or));
});

const TOKENS: Record<string, { userId: string; role: UserRole; restaurantId: string | null }> = {
  "manager-a": {
    userId: managerA.toHexString(),
    role: "Manager",
    restaurantId: restaurantA.toHexString(),
  },
  "admin-a": {
    userId: new ObjectId().toHexString(),
    role: "Administrator",
    restaurantId: restaurantA.toHexString(),
  },
  "manager-b": {
    userId: managerB.toHexString(),
    role: "Manager",
    restaurantId: restaurantB.toHexString(),
  },
  reception: {
    userId: new ObjectId().toHexString(),
    role: "Reception",
    restaurantId: restaurantA.toHexString(),
  },
  kitchen: {
    userId: new ObjectId().toHexString(),
    role: "Kitchen Staff",
    restaurantId: restaurantA.toHexString(),
  },
  customer: { userId: new ObjectId().toHexString(), role: "Customer", restaurantId: null },
};

async function withAuditApi(
  repository: MemoryAuditRepository,
  run: (get: (path: string, token: string) => Promise<Response>) => Promise<void>,
) {
  const app = express();
  app.use(
    "/api/v1/audit-logs",
    createAuditRouter({
      createRuntime: async () => ({
        service: new AuditService(repository),
        verifyAccessToken: async (token) => {
          const principal = TOKENS[token];
          if (!principal) throw new Error("invalid token");
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
    await run((path, token) =>
      fetch(`http://127.0.0.1:${address.port}/api/v1/audit-logs${path}`, {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
  } finally {
    server.close();
  }
}

async function seededRepository() {
  const repository = new MemoryAuditRepository();
  for (let index = 0; index < 5; index += 1) {
    await repository.insert(
      {
        restaurantId: restaurantA,
        actor: { userId: managerA, role: "Manager" },
        action: index % 2 ? "inventory.threshold_changed" : "staff.role_changed",
        target: { type: "staff", id: new ObjectId(), label: `Member ${index}` },
        before: { role: "Reception" },
        after: { role: "Manager" },
      },
      new Date(base.getTime() + index * 1000),
    );
  }
  await repository.insert(
    {
      restaurantId: restaurantB,
      actor: { userId: managerB, role: "Manager" },
      action: "staff.deactivated",
      target: { type: "staff", id: new ObjectId(), label: "Other restaurant" },
      before: { isActive: true },
      after: { isActive: false },
    },
    new Date(base.getTime() + 10_000),
  );
  return repository;
}

test("Managers and Administrators read the log; other roles get 403", async () => {
  await withAuditApi(await seededRepository(), async (get) => {
    for (const token of ["manager-a", "admin-a"]) {
      const response = await get("", token);
      assert.equal(response.status, 200, token);
    }
    for (const token of ["reception", "kitchen", "customer"]) {
      const response = await get("", token);
      assert.equal(response.status, 403, token);
    }
    assert.equal((await get("", "nobody")).status, 401);
  });
});

test("another restaurant's entries are never returned or usable as a cursor", async () => {
  const repository = await seededRepository();
  await withAuditApi(repository, async (get) => {
    const ownA = (await (await get("", "manager-a")).json()) as {
      entries: Array<{ id: string; target: { label: string } }>;
    };
    assert.equal(ownA.entries.length, 5);
    assert.ok(ownA.entries.every((entry) => entry.target.label !== "Other restaurant"));

    const ownB = (await (await get("", "manager-b")).json()) as {
      entries: Array<{ target: { label: string } }>;
    };
    assert.deepEqual(
      ownB.entries.map((entry) => entry.target.label),
      ["Other restaurant"],
    );

    const foreignId = repository.entries.find((entry) =>
      entry.restaurantId.equals(restaurantB),
    )?.id;
    assert.ok(foreignId);
    const probe = await get(`?before=${foreignId.toHexString()}`, "manager-a");
    assert.equal(probe.status, 400);
  });
});

test("entries come newest first with keyset pagination and an action filter", async () => {
  await withAuditApi(await seededRepository(), async (get) => {
    const first = (await (await get("?limit=2", "manager-a")).json()) as {
      entries: Array<{ id: string; target: { label: string }; createdAt: string }>;
      nextBefore: string | null;
    };
    assert.deepEqual(
      first.entries.map((entry) => entry.target.label),
      ["Member 4", "Member 3"],
    );
    assert.ok(first.nextBefore);
    const second = (await (
      await get(`?limit=2&before=${first.nextBefore}`, "manager-a")
    ).json()) as {
      entries: Array<{ target: { label: string } }>;
      nextBefore: string | null;
    };
    assert.deepEqual(
      second.entries.map((entry) => entry.target.label),
      ["Member 2", "Member 1"],
    );

    const filtered = (await (
      await get("?action=inventory.threshold_changed", "manager-a")
    ).json()) as {
      entries: Array<{ action: string }>;
      nextBefore: string | null;
    };
    assert.equal(filtered.entries.length, 2);
    assert.ok(filtered.entries.every((entry) => entry.action === "inventory.threshold_changed"));
    assert.equal(filtered.nextBefore, null);
  });
});

test("bad queries are rejected with the invalid_audit_query contract", async () => {
  await withAuditApi(await seededRepository(), async (get) => {
    for (const query of [
      "?limit=0",
      "?limit=201",
      "?limit=abc",
      "?action=drop",
      "?before=xyz",
      "?page=2",
    ]) {
      const response = await get(query, "manager-a");
      assert.equal(response.status, 400, query);
      const body = (await response.json()) as { error: { code: string } };
      assert.equal(body.error.code, "invalid_audit_query", query);
    }
  });
});
