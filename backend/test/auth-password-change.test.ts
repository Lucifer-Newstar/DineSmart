import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId, type WithId } from "mongodb";
import type { AuthRepository, NewRefreshSession } from "../src/auth/auth.repository.js";
import { createAuthRouter, REFRESH_COOKIE_NAME } from "../src/auth/auth.router.js";
import { AuthService, hashPassword } from "../src/auth/auth.service.js";
import type { RefreshSessionDocument, UserDocument } from "../src/database/schema.js";

const JWT_SECRET = "password-change-secret-with-at-least-32-bytes";
const WEB = "http://localhost:3000";
const PASSWORD = "correct horse battery staple";

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
  async changePassword(userId: ObjectId, passwordHash: string, now: Date) {
    const found = this.users.find((candidate) => candidate._id.equals(userId));
    if (!found) return false;
    found.passwordHash = passwordHash;
    found.passwordChangedAt = now;
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

const NEW_PASSWORD = "a brand new passphrase for maya";

async function withApi(
  run: (api: {
    base: string;
    repository: SessionRepository;
    signIn: (password?: string) => Promise<{ status: number; token: string }>;
  }) => Promise<void>,
) {
  const repository = new SessionRepository();
  repository.users.push(await user("maya@example.com"));
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
      base,
      repository,
      async signIn(password = PASSWORD) {
        const response = await fetch(`${base}/login`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: WEB },
          body: JSON.stringify({ email: "maya@example.com", password }),
        });
        const payload = (await response.json()) as { accessToken?: string };
        return { status: response.status, token: payload.accessToken ?? "" };
      },
    });
  } finally {
    server.close();
  }
}

function change(base: string, token: string, body: unknown) {
  return fetch(`${base}/password/change`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", origin: WEB },
    body: JSON.stringify(body),
  });
}

test("changing the password signs out other devices and keeps this one signed in", async () => {
  await withApi(async ({ base, repository, signIn }) => {
    const laptop = await signIn();
    await signIn();
    assert.equal(repository.sessions.size, 2);

    const response = await change(base, laptop.token, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { accessToken: string };
    assert.ok(payload.accessToken);
    assert.match(response.headers.get("set-cookie") ?? "", new RegExp(`^${REFRESH_COOKIE_NAME}=`));

    const sessions = [...repository.sessions.values()];
    assert.equal(sessions.length, 3);
    // Both earlier sessions are revoked; only the fresh one for this device is live.
    assert.equal(sessions.filter((session) => !session.revokedAt).length, 1);
    assert.ok(repository.users[0]?.passwordChangedAt);

    assert.equal((await signIn()).status, 401);
    assert.equal((await signIn(NEW_PASSWORD)).status, 200);
  });
});

test("a wrong current password, a short or unchanged new one, or no token is refused", async () => {
  await withApi(async ({ base, repository, signIn }) => {
    const { token } = await signIn();
    const before = repository.users[0]?.passwordHash;
    const cases: Array<[unknown, number, string]> = [
      [
        { currentPassword: "not my password", newPassword: NEW_PASSWORD },
        400,
        "invalid_current_password",
      ],
      [{ currentPassword: PASSWORD, newPassword: "short" }, 400, "invalid_new_password"],
      [{ currentPassword: PASSWORD, newPassword: PASSWORD }, 400, "invalid_new_password"],
      [
        { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, role: "Manager" },
        400,
        "invalid_request",
      ],
    ];
    for (const [body, status, code] of cases) {
      const response = await change(base, token, body);
      assert.equal(response.status, status);
      assert.equal(((await response.json()) as { error: { code: string } }).error.code, code);
    }
    assert.equal(repository.users[0]?.passwordHash, before);
    const anonymous = await change(base, "not-a-token", {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    assert.equal(anonymous.status, 401);
  });
});

test("a Google-only account is told to use password reset instead", async () => {
  await withApi(async ({ base, repository, signIn }) => {
    const { token } = await signIn();
    const account = repository.users[0];
    assert.ok(account);
    delete (account as { passwordHash?: string }).passwordHash;
    const response = await change(base, token, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    assert.equal(response.status, 400);
    assert.equal(
      ((await response.json()) as { error: { code: string } }).error.code,
      "password_not_set",
    );
  });
});
