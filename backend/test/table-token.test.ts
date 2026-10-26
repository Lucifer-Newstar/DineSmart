import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import {
  type QrTable,
  type TableQrRepository,
  TableQrService,
} from "../src/tables/table-qr.service.js";
import { createTableStatusRouter } from "../src/tables/table-status.router.js";
import type { TableStatusServiceReader } from "../src/tables/table-status.types.js";
import {
  signTableToken,
  TABLE_TOKEN_MAX_AGE_MS,
  tableTokenKey,
  verifyTableToken,
} from "../src/tables/table-token.js";

const SECRET = "table-token-test-secret-with-32-bytes-or-more";
const key = tableTokenKey(SECRET);
const restaurantId = new ObjectId();
const tableId = new ObjectId();
const issuedAt = new Date("2026-10-26T06:00:00.000Z");
const claims = { restaurantId, tableId, qrVersion: 0, issuedAt };

test("a signed token round-trips its restaurant, table and version", () => {
  const token = signTableToken(claims, key);
  assert.match(token, /^t1\.[a-f\d]{24}\.[a-f\d]{24}\.0\.[a-z\d]+\.[A-Za-z0-9_-]{22}$/);
  const verified = verifyTableToken(token, key, new Date(issuedAt.getTime() + 60_000));
  assert.ok(verified);
  assert.ok(verified.restaurantId.equals(restaurantId));
  assert.ok(verified.tableId.equals(tableId));
  assert.equal(verified.qrVersion, 0);
  assert.equal(verified.issuedAt.getTime(), issuedAt.getTime());
});

test("tampering with any part of the token is rejected", () => {
  const token = signTableToken(claims, key);
  const parts = token.split(".");
  const otherTable = [...parts];
  otherTable[2] = new ObjectId().toHexString();
  const otherVersion = [...parts];
  otherVersion[3] = "1";
  const flipped = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
  for (const bad of [
    otherTable.join("."),
    otherVersion.join("."),
    flipped,
    `${token}x`,
    "",
    42,
    null,
  ]) {
    assert.equal(verifyTableToken(bad, key, issuedAt), null);
  }
});

test("tokens expire, and a rotated secret invalidates every old token", () => {
  const token = signTableToken(claims, key);
  assert.equal(
    verifyTableToken(token, key, new Date(issuedAt.getTime() + TABLE_TOKEN_MAX_AGE_MS + 1_000)),
    null,
  );
  assert.equal(verifyTableToken(token, key, new Date(issuedAt.getTime() - 60 * 60_000)), null);
  const rotated = tableTokenKey(`${SECRET}-rotated`);
  assert.equal(verifyTableToken(token, rotated, issuedAt), null);
  assert.ok(verifyTableToken(signTableToken(claims, rotated), rotated, issuedAt));
  assert.throws(() => tableTokenKey("too short"));
});

class FakeQrRepository implements TableQrRepository {
  table: QrTable = { id: tableId, tableNumber: "04", qrVersion: 0 };
  listTables = async (tenant: ObjectId) => (tenant.equals(restaurantId) ? [this.table] : []);
  findTable = async (tenant: ObjectId, id: ObjectId) =>
    tenant.equals(restaurantId) && id.equals(this.table.id)
      ? { ...this.table, restaurantName: "Saffron & Co." }
      : null;
  rotate = async (tenant: ObjectId, id: ObjectId) => {
    if (!tenant.equals(restaurantId) || !id.equals(this.table.id)) return null;
    this.table = { ...this.table, qrVersion: this.table.qrVersion + 1 };
    return this.table;
  };
}

test("rotating one table's QR code voids its old card only", async () => {
  const repository = new FakeQrRepository();
  const service = new TableQrService(repository, key, () => issuedAt);
  const [card] = await service.issueAll(restaurantId);
  assert.ok(card);
  assert.equal((await service.resolve(card.token)).tableNumber, "04");
  const fresh = await service.rotate(restaurantId, tableId);
  await assert.rejects(service.resolve(card.token), { code: "invalid_table_token" });
  assert.equal((await service.resolve(fresh.token)).restaurantName, "Saffron & Co.");
  await assert.rejects(service.rotate(new ObjectId(), tableId), { code: "table_not_found" });
});

test("the public resolve route answers 400 for a tampered token and 200 for a good one", async () => {
  const repository = new FakeQrRepository();
  const qr = new TableQrService(repository, key, () => issuedAt);
  const app = express();
  app.use(
    "/api/v1/tables",
    createTableStatusRouter({
      createRuntime: async () => ({
        service: {} as TableStatusServiceReader,
        verifyAccessToken: async () => {
          throw new Error("the public route must not authenticate");
        },
        qr,
      }),
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api/v1/tables/qr/resolve`;
    const [card] = await qr.issueAll(restaurantId);
    assert.ok(card);
    const good = await fetch(`${base}?token=${encodeURIComponent(card.token)}`);
    assert.equal(good.status, 200);
    assert.deepEqual(((await good.json()) as { table: unknown }).table, {
      restaurantId: restaurantId.toHexString(),
      restaurantName: "Saffron & Co.",
      tableId: tableId.toHexString(),
      tableNumber: "04",
    });
    const tampered = await fetch(
      `${base}?token=${encodeURIComponent(`${card.token.slice(0, -2)}xx`)}`,
    );
    assert.equal(tampered.status, 400);
    assert.equal((await fetch(base)).status, 400);
    // Staff routes stay behind authentication.
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/v1/tables/qr`)).status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
