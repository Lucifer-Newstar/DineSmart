import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import { createAuthRouter } from "../src/auth/auth.router.js";
import type { AuthService } from "../src/auth/auth.service.js";
import type {
  PasswordResetRepository,
  PasswordResetTarget,
} from "../src/auth/password-reset.repository.js";
import {
  type PasswordResetEmailSender,
  PasswordResetService,
} from "../src/auth/password-reset.service.js";

const secret = "local-test-secret-with-at-least-32-bytes";
const now = new Date("2026-10-11T12:00:00.000Z");
const userId = new ObjectId();

class FakeResetRepository implements PasswordResetRepository {
  target: PasswordResetTarget | null = { id: userId, email: "guest@example.test" };
  completeUserId: ObjectId | null = userId;
  requests = 0;
  confirms = 0;

  async issuePasswordResetCode(): Promise<PasswordResetTarget | null> {
    this.requests += 1;
    return this.target;
  }

  async replacePasswordWithResetCode(): Promise<ObjectId | null> {
    this.confirms += 1;
    return this.completeUserId;
  }

  async revokeActiveRefreshSessions(): Promise<void> {}
}

class NoopResetSender implements PasswordResetEmailSender {
  async sendPasswordResetCode(): Promise<void> {}
}

function createAppForReset(
  options: {
    repository?: FakeResetRepository;
    environment?: string;
    origin?: string;
    provider?: string;
    exposeService?: boolean;
    rateLimits?: boolean;
  } = {},
) {
  const repository = options.repository ?? new FakeResetRepository();
  const service = new PasswordResetService(
    repository,
    secret,
    options.provider ?? "mock",
    options.environment ?? "development",
    new NoopResetSender(),
    () => now,
    () => "123456",
  );
  let serviceCreations = 0;
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/auth",
    createAuthRouter({
      createService: async () => ({}) as AuthService,
      createPasswordResetService:
        options.exposeService === false
          ? undefined
          : async () => {
              serviceCreations += 1;
              return service;
            },
      webOrigin: options.origin ?? "https://app.example",
      nodeEnvironment: options.environment ?? "development",
      rateLimits: options.rateLimits,
    }),
  );
  return {
    app,
    repository,
    get serviceCreations() {
      return serviceCreations;
    },
  };
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

test("reset request returns a generic no-store 202 and only the local mock code", async () => {
  const fixture = createAppForReset();
  await withServer(fixture.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/auth/reset-password/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "guest@example.test" }),
    });
    assert.equal(response.status, 202);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      message: "If an eligible account exists, password reset instructions have been sent.",
      developmentCode: "123456",
    });
    assert.equal(fixture.repository.requests, 1);
  });
});

test("reset request rejects extra fields and query parameters before creating the service", async () => {
  const fixture = createAppForReset();
  await withServer(fixture.app, async (baseUrl) => {
    const badBody = await fetch(`${baseUrl}/api/v1/auth/reset-password/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "guest@example.test", userId: userId.toHexString() }),
    });
    assert.equal(badBody.status, 400);

    const badQuery = await fetch(
      `${baseUrl}/api/v1/auth/reset-password/request?email=guest@example.test`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "guest@example.test" }),
      },
    );
    assert.equal(badQuery.status, 400);
    assert.equal(fixture.serviceCreations, 0);
  });
});

test("reset confirmation returns 204, no-store, and clears the refresh cookie without issuing a session", async () => {
  const fixture = createAppForReset();
  await withServer(fixture.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/auth/reset-password/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "guest@example.test",
        code: "123456",
        newPassword: "a-new-password-123",
      }),
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("set-cookie") ?? "", /andhrimnir_refresh=/);
    assert.equal(fixture.repository.confirms, 1);
  });
});

test("reset confirmation rejects extra fields and preserves the generic invalid-code error", async () => {
  const invalidRepository = new FakeResetRepository();
  invalidRepository.completeUserId = null;
  const fixture = createAppForReset({ repository: invalidRepository });
  await withServer(fixture.app, async (baseUrl) => {
    const malformed = await fetch(`${baseUrl}/api/v1/auth/reset-password/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "guest@example.test",
        code: "123456",
        newPassword: "a-new-password-123",
        role: "Manager",
      }),
    });
    assert.equal(malformed.status, 400);
    assert.equal(invalidRepository.confirms, 0);

    const invalidCode = await fetch(`${baseUrl}/api/v1/auth/reset-password/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "guest@example.test",
        code: "123456",
        newPassword: "a-new-password-123",
      }),
    });
    assert.equal(invalidCode.status, 401);
    assert.deepEqual(await invalidCode.json(), {
      error: {
        code: "invalid_password_reset_code",
        message: "The password reset code is invalid or expired.",
      },
    });
  });
});

test("password reset endpoints enforce exact origin and production requires the origin header", async () => {
  const devFixture = createAppForReset();
  await withServer(devFixture.app, async (baseUrl) => {
    const wrongOrigin = await fetch(`${baseUrl}/api/v1/auth/reset-password/request`, {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "guest@example.test" }),
    });
    assert.equal(wrongOrigin.status, 403);
    assert.equal(devFixture.repository.requests, 0);
  });

  const productionFixture = createAppForReset({ environment: "production", provider: "smtp" });
  await withServer(productionFixture.app, async (baseUrl) => {
    const missingOrigin = await fetch(`${baseUrl}/api/v1/auth/reset-password/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "guest@example.test" }),
    });
    assert.equal(missingOrigin.status, 403);
    assert.equal(productionFixture.repository.requests, 0);
  });
});

test("password reset request is limited to five requests per IP and returns no account data", async () => {
  const fixture = createAppForReset();
  fixture.repository.target = null;
  await withServer(fixture.app, async (baseUrl) => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/v1/auth/reset-password/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "unknown@example.test" }),
      });
      statuses.push(response.status);
      if (attempt === 0) {
        assert.deepEqual(await response.json(), {
          message: "If an eligible account exists, password reset instructions have been sent.",
        });
      }
    }
    assert.deepEqual(statuses, [202, 202, 202, 202, 202, 429]);
  });
});

test("password reset confirmation is limited to ten attempts per IP", async () => {
  const repository = new FakeResetRepository();
  repository.completeUserId = null;
  const fixture = createAppForReset({ repository });
  await withServer(fixture.app, async (baseUrl) => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/v1/auth/reset-password/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "guest@example.test",
          code: "123456",
          newPassword: "a-new-password-123",
        }),
      });
      statuses.push(response.status);
    }
    assert.deepEqual(statuses, [...Array.from({ length: 10 }, () => 401), 429]);
    assert.equal(repository.confirms, 10);
  });
});

test("the auth limits are skipped when the router is built without rate limits", async () => {
  const fixture = createAppForReset({ rateLimits: false });
  fixture.repository.target = null;
  await withServer(fixture.app, async (baseUrl) => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/v1/auth/reset-password/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "unknown@example.test" }),
      });
      statuses.push(response.status);
    }
    assert.deepEqual(
      statuses,
      Array.from({ length: 7 }, () => 202),
    );
  });
});

test("reset service configuration failures use the auth-safe unavailable envelope", async () => {
  const fixture = createAppForReset({ exposeService: false });
  await withServer(fixture.app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/auth/reset-password/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "guest@example.test" }),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: { code: "auth_unavailable", message: "Authentication is temporarily unavailable." },
    });
  });
});
