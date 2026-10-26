import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import type { AuthPrincipal } from "../src/auth/auth.service.js";
import {
  AccountError,
  type CustomerAccountChanges,
  type CustomerAccountProfile,
  contactPreferencesOf,
  parseAccountChanges,
} from "../src/customers/customer-account.js";
import {
  type CustomerAccountStore,
  createCustomerAccountRouter,
} from "../src/customers/customer-account.router.js";
import { MongoCustomerPrivacyRepository } from "../src/customers/customer-privacy.js";

const userId = new ObjectId();

test("account changes accept a tidy name and known boolean preferences only", () => {
  assert.deepEqual(parseAccountChanges({ name: "  Ananya   Menon " }), { name: "Ananya Menon" });
  assert.deepEqual(parseAccountChanges({ contactPreferences: { offers: true } }), {
    contactPreferences: { offers: true },
  });
  for (const bad of [
    null,
    {},
    { name: "" },
    { name: "x".repeat(101) },
    { phone: "+91 99999 99999" },
    { contactPreferences: { sms: true } },
    { contactPreferences: { email: "yes" } },
    { contactPreferences: {} },
  ]) {
    assert.equal(parseAccountChanges(bad), null);
  }
  assert.deepEqual(contactPreferencesOf(undefined), { email: true, offers: false });
  assert.deepEqual(contactPreferencesOf({ email: false }), { email: false, offers: false });
});

async function call(
  role: AuthPrincipal["role"],
  method: "GET" | "PATCH" | "DELETE",
  body?: unknown,
  path = "/profile",
) {
  const updates: CustomerAccountChanges[] = [];
  const erasures: Array<{ confirmation: unknown; password: unknown }> = [];
  let profile: CustomerAccountProfile = {
    name: "Ananya Menon",
    email: "ananya@example.test",
    contactPreferences: { email: true, offers: false },
    hasPassword: true,
  };
  const store: CustomerAccountStore = {
    exportData: async (_id, now) => ({
      exportedAt: now.toISOString(),
      account: {
        name: profile.name,
        email: profile.email,
        signInMethod: "email",
        createdAt: now.toISOString(),
        contactPreferences: profile.contactPreferences,
      },
      reservations: [],
      orders: [],
      bills: [],
      notifications: [],
    }),
    eraseAccount: async (_id, confirmation, password) => {
      if (confirmation !== "DELETE") {
        throw new AccountError(400, "confirmation_required", "Type DELETE to confirm.");
      }
      erasures.push({ confirmation, password });
      return {
        cancelledReservations: 0,
        scrubbedReservations: 0,
        scrubbedOrderItems: 0,
        deletedNotifications: 0,
        deletedGuestProfiles: 0,
      };
    },
    getProfile: async () => profile,
    updateProfile: async (_id, changes) => {
      updates.push(changes);
      profile = {
        ...profile,
        ...(changes.name ? { name: changes.name } : {}),
        contactPreferences: { ...profile.contactPreferences, ...changes.contactPreferences },
      };
      return profile;
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/account",
    createCustomerAccountRouter({
      createRuntime: async () => ({
        store,
        verifyAccessToken: async () => ({
          userId: userId.toHexString(),
          role,
          restaurantId: role === "Customer" ? null : new ObjectId().toHexString(),
        }),
      }),
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/account${path}`, {
      method,
      headers: {
        authorization: "Bearer token",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { response, updates, erasures };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("a customer reads and edits their own profile", async () => {
  const read = await call("Customer", "GET");
  assert.equal(read.response.status, 200);
  const payload = (await read.response.json()) as { profile: Record<string, unknown> };
  assert.equal(payload.profile.email, "ananya@example.test");
  assert.equal("passwordHash" in payload.profile, false);

  const edited = await call("Customer", "PATCH", {
    name: "Ananya M",
    contactPreferences: { offers: true },
  });
  assert.equal(edited.response.status, 200);
  const after = (await edited.response.json()) as {
    profile: { name: string; contactPreferences: { offers: boolean; email: boolean } };
  };
  assert.equal(after.profile.name, "Ananya M");
  assert.deepEqual(after.profile.contactPreferences, { email: true, offers: true });

  const rejected = await call("Customer", "PATCH", { email: "new@example.test" });
  assert.equal(rejected.response.status, 400);
  assert.equal(rejected.updates.length, 0);
});

test("staff accounts are turned away from the customer account routes", async () => {
  for (const role of ["Reception", "Manager", "Kitchen Staff"] as const) {
    assert.equal((await call(role, "GET")).response.status, 403);
  }
});

test("export downloads as a dated JSON attachment", async () => {
  const { response } = await call("Customer", "GET", undefined, "/export");
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-disposition") ?? "",
    /^attachment; filename="dinesmart-account-\d{4}-\d{2}-\d{2}\.json"$/,
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
  const payload = (await response.json()) as { account: { email: string }; orders: unknown[] };
  assert.equal(payload.account.email, "ananya@example.test");
  assert.deepEqual(payload.orders, []);
});

test("deleting the account needs the typed confirmation and passes the password through", async () => {
  const refused = await call("Customer", "DELETE", { confirm: "delete" }, "/");
  assert.equal(refused.response.status, 400);
  assert.equal(refused.erasures.length, 0);

  const done = await call("Customer", "DELETE", { confirm: "DELETE", password: "secret" }, "/");
  assert.equal(done.response.status, 200);
  assert.deepEqual(done.erasures, [{ confirmation: "DELETE", password: "secret" }]);
  assert.equal(((await done.response.json()) as { deleted: boolean }).deleted, true);

  assert.equal((await call("Manager", "DELETE", { confirm: "DELETE" }, "/")).response.status, 403);
  assert.equal((await call("Reception", "GET", undefined, "/export")).response.status, 403);
});

test("erasure refuses a missing confirmation before touching any data", async () => {
  const touched: string[] = [];
  const db = {
    collection: (name: string) =>
      new Proxy(
        {},
        {
          get: (_target, method) => () => {
            touched.push(`${name}.${String(method)}`);
            throw new Error("no database in this test");
          },
        },
      ),
  } as unknown as ConstructorParameters<typeof MongoCustomerPrivacyRepository>[0];
  const repository = new MongoCustomerPrivacyRepository(db);
  await assert.rejects(
    repository.eraseAccount(new ObjectId(), "yes please", "secret", new Date()),
    (error: unknown) => error instanceof AccountError && error.code === "confirmation_required",
  );
  assert.deepEqual(touched, []);
});
