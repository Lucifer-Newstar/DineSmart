import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import type { AuthPrincipal } from "../src/auth/auth.service.js";
import {
  type CustomerAccountChanges,
  type CustomerAccountProfile,
  contactPreferencesOf,
  parseAccountChanges,
} from "../src/customers/customer-account.js";
import {
  type CustomerAccountStore,
  createCustomerAccountRouter,
} from "../src/customers/customer-account.router.js";

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

async function call(role: AuthPrincipal["role"], method: "GET" | "PATCH", body?: unknown) {
  const updates: CustomerAccountChanges[] = [];
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
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/account/profile`, {
      method,
      headers: {
        authorization: "Bearer token",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { response, updates };
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
