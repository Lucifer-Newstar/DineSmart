import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId, type WithId } from "mongodb";
import type { AuthRepository, NewRefreshSession } from "../src/auth/auth.repository.js";
import { createAuthRouter } from "../src/auth/auth.router.js";
import {
  AuthError,
  AuthService,
  hashPassword,
  LOGIN_LOCKOUT_MS,
  LOGIN_LOCKOUT_THRESHOLD,
} from "../src/auth/auth.service.js";
import type { RefreshSessionDocument, UserDocument } from "../src/database/schema.js";

const JWT_SECRET = "lockout-test-secret-with-at-least-32-bytes";
const EMAIL = "lockout@example.com";
const PASSWORD = "correct horse battery staple";
const START = new Date("2026-10-25T10:00:00.000Z");

class LockoutRepository implements AuthRepository {
  user!: WithId<UserDocument>;
  sessions = 0;

  async findActiveUserByEmail(normalizedEmail: string) {
    return this.user.normalizedEmail === normalizedEmail ? this.user : null;
  }
  async findActiveUserById(userId: ObjectId) {
    return this.user._id.equals(userId) ? this.user : null;
  }
  async linkGoogleSubject() {
    return null;
  }
  async createRefreshSession(_session: NewRefreshSession) {
    this.sessions += 1;
  }
  async rotateRefreshSession(): Promise<WithId<RefreshSessionDocument> | null> {
    return null;
  }
  async revokeRefreshToken() {}
  async revokeRefreshSession() {}
  async recordFailedLogin() {
    this.user.failedLoginAttempts = (this.user.failedLoginAttempts ?? 0) + 1;
    return this.user.failedLoginAttempts;
  }
  async lockLogin(_userId: ObjectId, until: Date) {
    this.user.loginLockedUntil = until;
    this.user.failedLoginAttempts = 0;
  }
  async clearFailedLogins() {
    this.user.failedLoginAttempts = 0;
    delete this.user.loginLockedUntil;
  }

  async setSessionDeviceLabel(): Promise<void> {}

  async listActiveSessions(): Promise<WithId<RefreshSessionDocument>[]> {
    return [];
  }

  async revokeUserSession(): Promise<boolean> {
    return false;
  }

  async revokeOtherSessions(): Promise<number> {
    return 0;
  }
}

async function setup() {
  const repository = new LockoutRepository();
  repository.user = {
    _id: new ObjectId(),
    name: "Lockout Test",
    email: EMAIL,
    normalizedEmail: EMAIL,
    role: "Customer",
    restaurantId: null,
    status: "active",
    authProvider: "email",
    passwordHash: await hashPassword(PASSWORD),
    createdAt: START,
    updatedAt: START,
  };
  const clock = { now: START };
  const service = new AuthService(repository, JWT_SECRET, () => new Date(clock.now));
  return { repository, service, clock };
}

async function failTimes(service: AuthService, count: number) {
  for (let attempt = 0; attempt < count; attempt += 1) {
    await assert.rejects(service.login(EMAIL, "wrong password"), (error: unknown) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.statusCode, 401);
      return true;
    });
  }
}

test(`the sixth attempt after ${LOGIN_LOCKOUT_THRESHOLD} wrong passwords is refused with 423`, async () => {
  const { repository, service } = await setup();
  await failTimes(service, LOGIN_LOCKOUT_THRESHOLD);
  assert.ok(repository.user.loginLockedUntil);

  // Even the right password is refused while locked, without creating a session.
  await assert.rejects(service.login(EMAIL, PASSWORD), (error: unknown) => {
    assert.ok(error instanceof AuthError);
    assert.equal(error.statusCode, 423);
    assert.equal(error.code, "account_locked");
    assert.equal(error.retryAfterSeconds, LOGIN_LOCKOUT_MS / 1000);
    assert.match(error.message, /15 minutes/);
    return true;
  });
  assert.equal(repository.sessions, 0);
});

test("four wrong passwords do not lock, and a success resets the count", async () => {
  const { repository, service } = await setup();
  await failTimes(service, LOGIN_LOCKOUT_THRESHOLD - 1);
  assert.equal(repository.user.loginLockedUntil, undefined);
  await service.login(EMAIL, PASSWORD);
  assert.equal(repository.user.failedLoginAttempts, 0);

  // The count starts over, so four more failures still do not lock.
  await failTimes(service, LOGIN_LOCKOUT_THRESHOLD - 1);
  assert.equal(repository.user.loginLockedUntil, undefined);
});

test("the lock lifts after 15 minutes and Retry-After counts down", async () => {
  const { repository, service, clock } = await setup();
  await failTimes(service, LOGIN_LOCKOUT_THRESHOLD);

  clock.now = new Date(START.getTime() + LOGIN_LOCKOUT_MS - 60_000);
  await assert.rejects(service.login(EMAIL, PASSWORD), (error: unknown) => {
    assert.ok(error instanceof AuthError);
    assert.equal(error.retryAfterSeconds, 60);
    assert.match(error.message, /1 minute\b/);
    return true;
  });

  clock.now = new Date(START.getTime() + LOGIN_LOCKOUT_MS + 1);
  const session = await service.login(EMAIL, PASSWORD);
  assert.ok(session.accessToken);
  assert.equal(repository.user.loginLockedUntil, undefined);
});

test("the HTTP response is 423 with a Retry-After header", async () => {
  const { service } = await setup();
  await failTimes(service, LOGIN_LOCKOUT_THRESHOLD);
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/auth",
    createAuthRouter({
      createService: async () => service,
      webOrigin: "http://localhost:3000",
      nodeEnvironment: "test",
      rateLimits: false,
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    assert.equal(response.status, 423);
    assert.equal(response.headers.get("retry-after"), String(LOGIN_LOCKOUT_MS / 1000));
    const body = (await response.json()) as {
      error: { code: string; retryAfterSeconds: number };
    };
    assert.equal(body.error.code, "account_locked");
    assert.equal(body.error.retryAfterSeconds, LOGIN_LOCKOUT_MS / 1000);
  } finally {
    server.close();
  }
});
