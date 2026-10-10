import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId, type WithId } from "mongodb";
import { authenticateAccessToken } from "../src/auth/auth.middleware.js";
import type { AuthRepository, NewRefreshSession } from "../src/auth/auth.repository.js";
import { createAuthRouter, REFRESH_COOKIE_NAME } from "../src/auth/auth.router.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AuthError,
  AuthService,
  hashPassword,
  hashRefreshToken,
  REFRESH_SESSION_TTL_MS,
  type SafeAuthUser,
} from "../src/auth/auth.service.js";
import {
  type GoogleIdentity,
  type GoogleIdentityVerifier,
  GoogleOAuthService,
} from "../src/auth/google-oauth.service.js";
import type { RefreshSessionDocument, UserDocument } from "../src/database/schema.js";

const JWT_SECRET = "local-test-secret-with-at-least-32-bytes";
const FIXED_NOW = new Date("2026-10-10T12:00:00.000Z");

class FakeAuthRepository implements AuthRepository {
  user: WithId<UserDocument> | null = null;
  readonly sessions = new Map<string, WithId<RefreshSessionDocument>>();
  lastEmailLookup = "";

  async findActiveUserByEmail(normalizedEmail: string): Promise<WithId<UserDocument> | null> {
    this.lastEmailLookup = normalizedEmail;
    return this.user?.normalizedEmail === normalizedEmail && this.user.status === "active"
      ? this.user
      : null;
  }

  async findActiveUserById(userId: ObjectId): Promise<WithId<UserDocument> | null> {
    return this.user?._id.equals(userId) && this.user.status === "active" ? this.user : null;
  }

  async linkGoogleSubject(
    userId: ObjectId,
    googleSubject: string,
    now: Date,
  ): Promise<WithId<UserDocument> | null> {
    if (!this.user?._id.equals(userId) || this.user.status !== "active") return null;
    if (this.user.googleSubject && this.user.googleSubject !== googleSubject) return null;
    this.user.googleSubject = googleSubject;
    this.user.authProvider = "google";
    this.user.updatedAt = now;
    return this.user;
  }

  async createRefreshSession(session: NewRefreshSession): Promise<void> {
    const created: WithId<RefreshSessionDocument> = { ...session, _id: new ObjectId() };
    this.sessions.set(created._id.toHexString(), created);
  }

  async rotateRefreshSession(
    currentTokenHash: string,
    nextTokenHash: string,
    now: Date,
  ): Promise<WithId<RefreshSessionDocument> | null> {
    const current = [...this.sessions.values()].find(
      (session) =>
        session.tokenHash === currentTokenHash && !session.revokedAt && session.expiresAt > now,
    );

    if (current) {
      current.usedTokenHashes.push(currentTokenHash);
      current.tokenHash = nextTokenHash;
      current.lastUsedAt = now;
      current.updatedAt = now;
      return current;
    }

    const replayed = [...this.sessions.values()].find((session) =>
      session.usedTokenHashes.includes(currentTokenHash),
    );
    if (replayed && !replayed.revokedAt) {
      replayed.revokedAt = now;
      replayed.updatedAt = now;
    }
    return null;
  }

  async revokeRefreshToken(tokenHash: string, now: Date): Promise<void> {
    const session = [...this.sessions.values()].find(
      (candidate) =>
        candidate.tokenHash === tokenHash || candidate.usedTokenHashes.includes(tokenHash),
    );
    if (session && !session.revokedAt) {
      session.revokedAt = now;
      session.updatedAt = now;
    }
  }

  async revokeRefreshSession(sessionId: ObjectId, now: Date): Promise<void> {
    const session = this.sessions.get(sessionId.toHexString());
    if (session && !session.revokedAt) {
      session.revokedAt = now;
      session.updatedAt = now;
    }
  }
}

async function createTestService(repository: FakeAuthRepository) {
  const passwordHash = await hashPassword("correct-horse-battery-staple");
  repository.user = {
    _id: new ObjectId(),
    name: "Test Customer",
    email: "Test.Customer@example.com",
    normalizedEmail: "test.customer@example.com",
    role: "Customer",
    restaurantId: null,
    status: "active",
    authProvider: "email",
    passwordHash,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
  return new AuthService(repository, JWT_SECRET, () => new Date(FIXED_NOW));
}

class FakeGoogleVerifier implements GoogleIdentityVerifier {
  constructor(private readonly identity: GoogleIdentity | null) {}

  async verifyIdToken(idToken: string): Promise<GoogleIdentity | null> {
    return idToken === "signed-google-id-token" ? this.identity : null;
  }
}

async function withServer<T>(
  app: express.Express,
  callback: (baseUrl: string) => Promise<T>,
): Promise<T> {
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

function sessionCookie(response: Response): string {
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  assert.match(cookie, new RegExp(`^${REFRESH_COOKIE_NAME}=`));
  return cookie.split(";", 1)[0];
}

test("login returns a short-lived access token and stores only a refresh-token hash", async () => {
  const repository = new FakeAuthRepository();
  const service = await createTestService(repository);
  const session = await service.login(
    "  TEST.CUSTOMER@EXAMPLE.COM ",
    "correct-horse-battery-staple",
  );

  assert.equal(repository.lastEmailLookup, "test.customer@example.com");
  assert.equal(session.user.role, "Customer");
  assert.equal(session.user.restaurantId, null);
  assert.equal(
    session.accessTokenExpiresAt.getTime() - FIXED_NOW.getTime(),
    ACCESS_TOKEN_TTL_SECONDS * 1_000,
  );
  assert.equal(
    session.refreshTokenExpiresAt.getTime() - FIXED_NOW.getTime(),
    REFRESH_SESSION_TTL_MS,
  );
  assert.equal(repository.sessions.size, 1);

  const stored = [...repository.sessions.values()][0];
  assert.equal(stored.tokenHash, hashRefreshToken(session.refreshToken));
  assert.equal(JSON.stringify(stored).includes(session.refreshToken), false);
  assert.deepEqual(await service.verifyAccessToken(session.accessToken), {
    userId: repository.user?._id.toHexString(),
    role: "Customer",
    restaurantId: null,
  });
});

test("invalid credentials use one generic rejection and do not create a session", async () => {
  const repository = new FakeAuthRepository();
  const service = await createTestService(repository);

  await assert.rejects(
    service.login("test.customer@example.com", "wrong-password"),
    (error: unknown) => error instanceof AuthError && error.statusCode === 401,
  );
  await assert.rejects(
    service.login("not-found@example.com", "wrong-password"),
    (error: unknown) => error instanceof AuthError && error.statusCode === 401,
  );
  assert.equal(repository.sessions.size, 0);
});

test("Google login links a verified identity to an existing active account", async () => {
  const repository = new FakeAuthRepository();
  const authService = await createTestService(repository);
  const googleService = new GoogleOAuthService(
    repository,
    authService,
    new FakeGoogleVerifier({
      subject: "google-subject-123",
      email: "TEST.CUSTOMER@example.com",
      emailVerified: true,
    }),
    () => new Date(FIXED_NOW),
  );

  const session = await googleService.login("signed-google-id-token");
  assert.equal(repository.user?.googleSubject, "google-subject-123");
  assert.equal(repository.user?.authProvider, "google");
  assert.equal(session.user.email, "Test.Customer@example.com");
  assert.equal(repository.sessions.size, 1);
});

test("Google login rejects unverified and unregistered identities without creating accounts", async () => {
  const unverifiedRepository = new FakeAuthRepository();
  const unverifiedAuthService = await createTestService(unverifiedRepository);
  const unverifiedService = new GoogleOAuthService(
    unverifiedRepository,
    unverifiedAuthService,
    new FakeGoogleVerifier({
      subject: "google-subject-123",
      email: "test.customer@example.com",
      emailVerified: false,
    }),
  );
  await assert.rejects(
    unverifiedService.login("signed-google-id-token"),
    (error: unknown) => error instanceof AuthError && error.statusCode === 401,
  );
  assert.equal(unverifiedRepository.user?.googleSubject, undefined);

  const unregisteredRepository = new FakeAuthRepository();
  const unregisteredAuthService = new AuthService(
    unregisteredRepository,
    JWT_SECRET,
    () => new Date(FIXED_NOW),
  );
  const unregisteredService = new GoogleOAuthService(
    unregisteredRepository,
    unregisteredAuthService,
    new FakeGoogleVerifier({
      subject: "google-subject-123",
      email: "new.customer@example.com",
      emailVerified: true,
    }),
  );
  await assert.rejects(
    unregisteredService.login("signed-google-id-token"),
    (error: unknown) => error instanceof AuthError && error.statusCode === 401,
  );
  assert.equal(unregisteredRepository.user, null);
  assert.equal(unregisteredRepository.sessions.size, 0);
});

test("refresh rotates the token, preserves absolute expiry and revokes the family on replay", async () => {
  const repository = new FakeAuthRepository();
  const service = await createTestService(repository);
  const initial = await service.login("test.customer@example.com", "correct-horse-battery-staple");
  const rotated = await service.refresh(initial.refreshToken);

  assert.notEqual(rotated.refreshToken, initial.refreshToken);
  assert.equal(rotated.refreshTokenExpiresAt.getTime(), initial.refreshTokenExpiresAt.getTime());
  const stored = [...repository.sessions.values()][0];
  assert.equal(stored.tokenHash, hashRefreshToken(rotated.refreshToken));
  assert.ok(stored.usedTokenHashes.includes(hashRefreshToken(initial.refreshToken)));

  await assert.rejects(
    service.refresh(initial.refreshToken),
    (error: unknown) => error instanceof AuthError && error.statusCode === 401,
  );
  assert.ok(stored.revokedAt);
});

test("JWT secret must have at least 32 bytes", () => {
  assert.throws(() => new AuthService(new FakeAuthRepository(), "too-short"), /JWT_SECRET/);
});

test("bearer middleware attaches a verified principal and rejects missing or invalid tokens", async () => {
  const repository = new FakeAuthRepository();
  const service = await createTestService(repository);
  const session = await service.login("test.customer@example.com", "correct-horse-battery-staple");
  const app = express();
  app.get(
    "/private",
    authenticateAccessToken((token) => service.verifyAccessToken(token)),
    (request, response) => {
      response.json({ userId: request.auth?.userId, role: request.auth?.role });
    },
  );

  await withServer(app, async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/private`);
    assert.equal(missing.status, 401);

    const invalid = await fetch(`${baseUrl}/private`, {
      headers: { authorization: "Bearer not-a-valid-token" },
    });
    assert.equal(invalid.status, 401);

    const valid = await fetch(`${baseUrl}/private`, {
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), {
      userId: repository.user?._id.toHexString(),
      role: "Customer",
    });
  });
});

test("production refresh cookies are Secure and require an Origin header", async () => {
  const repository = new FakeAuthRepository();
  const service = await createTestService(repository);
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/auth",
    createAuthRouter({
      createService: async () => service,
      webOrigin: "https://frontend.example",
      nodeEnvironment: "production",
    }),
  );

  await withServer(app, async (baseUrl) => {
    const missingOrigin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "test.customer@example.com",
        password: "correct-horse-battery-staple",
      }),
    });
    assert.equal(missingOrigin.status, 403);

    const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://frontend.example",
      },
      body: JSON.stringify({
        email: "test.customer@example.com",
        password: "correct-horse-battery-staple",
      }),
    });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /SameSite=None/i);
  });
});

test("auth HTTP routes keep refresh credentials in HttpOnly cookies and reject untrusted origins", async () => {
  const repository = new FakeAuthRepository();
  const service = await createTestService(repository);
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/auth",
    createAuthRouter({
      createService: async () => service,
      googleSession: async (idToken) => {
        assert.equal(idToken, "signed-google-id-token");
        assert.ok(repository.user);
        return service.issueSessionForUser(repository.user);
      },
      webOrigin: "http://localhost:3000",
      nodeEnvironment: "test",
    }),
  );

  await withServer(app, async (baseUrl) => {
    const rejected = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({
        email: "test.customer@example.com",
        password: "correct-horse-battery-staple",
      }),
    });
    assert.equal(rejected.status, 403);

    const googleLogin = await fetch(`${baseUrl}/api/v1/auth/google`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ idToken: "signed-google-id-token" }),
    });
    assert.equal(googleLogin.status, 200);
    assert.match(googleLogin.headers.get("set-cookie") ?? "", /HttpOnly/i);

    const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({
        email: "test.customer@example.com",
        password: "correct-horse-battery-staple",
      }),
    });
    assert.equal(login.status, 200);
    const loginBody = (await login.json()) as { accessToken: string; user: SafeAuthUser };
    assert.ok(loginBody.accessToken);
    assert.equal("refreshToken" in loginBody, false);
    assert.equal(loginBody.user.restaurantId, null);
    const oldCookie = sessionCookie(login);
    assert.match(login.headers.get("set-cookie") ?? "", /HttpOnly/i);

    const refresh = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { origin: "http://localhost:3000", cookie: oldCookie },
    });
    assert.equal(refresh.status, 200);
    const refreshBody = (await refresh.json()) as { accessToken: string };
    assert.ok(refreshBody.accessToken);
    const newCookie = sessionCookie(refresh);
    assert.notEqual(newCookie, oldCookie);

    const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: "POST",
      headers: { origin: "http://localhost:3000", cookie: newCookie },
    });
    assert.equal(logout.status, 204);
    assert.ok([...repository.sessions.values()].some((session) => session.revokedAt));
  });
});
