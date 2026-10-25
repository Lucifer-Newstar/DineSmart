import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId, type WithId } from "mongodb";
import type { AuthRepository, NewRefreshSession } from "../src/auth/auth.repository.js";
import { createAuthRouter, REFRESH_COOKIE_NAME } from "../src/auth/auth.router.js";
import { AuthService, hashPassword } from "../src/auth/auth.service.js";
import { describeUserAgent } from "../src/auth/device-label.js";
import type { RefreshSessionDocument, UserDocument } from "../src/database/schema.js";

const JWT_SECRET = "sessions-test-secret-with-at-least-32-bytes";
const WEB = "http://localhost:3000";
const PASSWORD = "correct horse battery staple";
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

class SessionRepository implements AuthRepository {
  users: WithId<UserDocument>[] = [];
  sessions = new Map<string, WithId<RefreshSessionDocument>>();

  async findActiveUserByEmail(normalizedEmail: string) {
    return this.users.find((user) => user.normalizedEmail === normalizedEmail) ?? null;
  }
  async findActiveUserById(userId: ObjectId) {
    return this.users.find((user) => user._id.equals(userId)) ?? null;
  }
  async linkGoogleSubject() {
    return null;
  }
  async createRefreshSession(session: NewRefreshSession) {
    const id = new ObjectId();
    this.sessions.set(id.toHexString(), { ...session, _id: id });
  }
  async rotateRefreshSession(): Promise<WithId<RefreshSessionDocument> | null> {
    return null;
  }
  async revokeRefreshToken() {}
  async revokeRefreshSession() {}
  async recordFailedLogin() {
    return 1;
  }
  async lockLogin() {}
  async clearFailedLogins() {}
  async setSessionDeviceLabel(tokenHash: string, deviceLabel: string) {
    for (const session of this.sessions.values()) {
      if (session.tokenHash === tokenHash) session.deviceLabel = deviceLabel;
    }
  }
  async listActiveSessions(userId: ObjectId, now: Date) {
    return [...this.sessions.values()].filter(
      (session) => session.userId.equals(userId) && !session.revokedAt && session.expiresAt > now,
    );
  }
  async revokeUserSession(userId: ObjectId, sessionId: ObjectId, now: Date) {
    const session = this.sessions.get(sessionId.toHexString());
    if (!session?.userId.equals(userId) || session.revokedAt) return false;
    session.revokedAt = now;
    return true;
  }
  async revokeOtherSessions(userId: ObjectId, keepTokenHash: string | null, now: Date) {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (
        session.userId.equals(userId) &&
        !session.revokedAt &&
        session.tokenHash !== keepTokenHash
      ) {
        session.revokedAt = now;
        count += 1;
      }
    }
    return count;
  }
}

async function user(email: string): Promise<WithId<UserDocument>> {
  const now = new Date();
  return {
    _id: new ObjectId(),
    name: email,
    email,
    normalizedEmail: email,
    role: "Customer",
    restaurantId: null,
    status: "active",
    authProvider: "email",
    passwordHash: await hashPassword(PASSWORD),
    createdAt: now,
    updatedAt: now,
  };
}

interface Device {
  token: string;
  cookie: string;
}

async function withApi(
  run: (api: {
    signIn: (email: string, userAgent: string) => Promise<Device>;
    call: (method: string, path: string, device: Device) => Promise<Response>;
    repository: SessionRepository;
  }) => Promise<void>,
) {
  const repository = new SessionRepository();
  repository.users.push(await user("maya@example.com"), await user("arjun@example.com"));
  const service = new AuthService(repository, JWT_SECRET);
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/auth",
    createAuthRouter({
      createService: async () => service,
      webOrigin: WEB,
      nodeEnvironment: "test",
      rateLimits: false,
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api/v1/auth`;
    await run({
      repository,
      async signIn(email, userAgent) {
        const response = await fetch(`${base}/login`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: WEB, "user-agent": userAgent },
          body: JSON.stringify({ email, password: PASSWORD }),
        });
        assert.equal(response.status, 200);
        const cookie = (response.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
        assert.ok(cookie.startsWith(`${REFRESH_COOKIE_NAME}=`));
        return { token: ((await response.json()) as { accessToken: string }).accessToken, cookie };
      },
      call(method, path, device) {
        return fetch(`${base}${path}`, {
          method,
          headers: { authorization: `Bearer ${device.token}`, cookie: device.cookie, origin: WEB },
        });
      },
    });
  } finally {
    server.close();
  }
}

interface SessionsBody {
  sessions: Array<{ id: string; deviceLabel: string; current: boolean }>;
}

test("device labels are coarse and never the raw user agent", () => {
  assert.equal(describeUserAgent(CHROME_MAC), "Chrome on macOS");
  assert.equal(describeUserAgent(SAFARI_IPHONE), "Safari on iOS");
  assert.equal(
    describeUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
    ),
    "Firefox on Windows",
  );
  assert.equal(describeUserAgent(undefined), "Unknown device");
  assert.equal(describeUserAgent("curl/8.5.0"), "Unknown device");
});

test("a user lists their own sessions with the current one marked", async () => {
  await withApi(async ({ signIn, call }) => {
    const laptop = await signIn("maya@example.com", CHROME_MAC);
    await signIn("maya@example.com", SAFARI_IPHONE);
    await signIn("arjun@example.com", CHROME_MAC);

    const response = await call("GET", "/sessions", laptop);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = (await response.json()) as SessionsBody;
    assert.equal(body.sessions.length, 2, "another user's session is not listed");
    assert.deepEqual(body.sessions.map((session) => session.deviceLabel).sort(), [
      "Chrome on macOS",
      "Safari on iOS",
    ]);
    assert.deepEqual(
      body.sessions.filter((session) => session.current).map((session) => session.deviceLabel),
      ["Chrome on macOS"],
    );
  });
});

test("revoking one session ends only that session, and only for its owner", async () => {
  await withApi(async ({ signIn, call }) => {
    const laptop = await signIn("maya@example.com", CHROME_MAC);
    const phone = await signIn("maya@example.com", SAFARI_IPHONE);
    const other = await signIn("arjun@example.com", CHROME_MAC);
    const listed = (await (await call("GET", "/sessions", laptop)).json()) as SessionsBody;
    const phoneSession = listed.sessions.find((session) => !session.current);
    assert.ok(phoneSession);

    assert.equal((await call("DELETE", `/sessions/${phoneSession.id}`, other)).status, 404);
    assert.equal((await call("DELETE", `/sessions/${phoneSession.id}`, laptop)).status, 204);
    assert.equal((await call("DELETE", `/sessions/${phoneSession.id}`, laptop)).status, 404);
    assert.equal((await call("DELETE", "/sessions/not-an-id", laptop)).status, 400);

    const after = (await (await call("GET", "/sessions", phone)).json()) as SessionsBody;
    assert.deepEqual(
      after.sessions.map((session) => session.deviceLabel),
      ["Chrome on macOS"],
    );
  });
});

test("revoke-all signs out every other device and keeps the current one", async () => {
  await withApi(async ({ signIn, call, repository }) => {
    const laptop = await signIn("maya@example.com", CHROME_MAC);
    await signIn("maya@example.com", SAFARI_IPHONE);
    await signIn("maya@example.com", SAFARI_IPHONE);
    await signIn("arjun@example.com", CHROME_MAC);

    const response = await call("DELETE", "/sessions", laptop);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { revoked: 2 });
    const remaining = (await (await call("GET", "/sessions", laptop)).json()) as SessionsBody;
    assert.equal(remaining.sessions.length, 1);
    assert.equal(remaining.sessions[0]?.current, true);
    const stillActive = [...repository.sessions.values()].filter(
      (session) => session.deviceLabel && !session.revokedAt,
    );
    assert.equal(stillActive.length, 2, "Maya's laptop and Arjun's session stay active");
  });
});

test("session routes need a valid access token", async () => {
  await withApi(async ({ signIn, call }) => {
    const laptop = await signIn("maya@example.com", CHROME_MAC);
    assert.equal(
      (await call("GET", "/sessions", { token: "", cookie: laptop.cookie })).status,
      401,
    );
    assert.equal(
      (await call("GET", "/sessions", { token: "forged.token.value", cookie: laptop.cookie }))
        .status,
      401,
    );
  });
});
