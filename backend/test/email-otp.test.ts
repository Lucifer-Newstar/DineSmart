import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId, type WithId } from "mongodb";
import type { AuthRepository, NewRefreshSession } from "../src/auth/auth.repository.js";
import { createAuthRouter } from "../src/auth/auth.router.js";
import { AuthError, AuthService, verifyPassword } from "../src/auth/auth.service.js";
import {
  type EmailOtpSender,
  EmailOtpService,
  hashRegistrationOtp,
  PENDING_REGISTRATION_TTL_MS,
} from "../src/auth/email-otp.service.js";
import type {
  NewPendingUser,
  RegistrationOtpRepository,
} from "../src/auth/registration.repository.js";
import type { RefreshSessionDocument, UserDocument } from "../src/database/schema.js";

const JWT_SECRET = "local-test-secret-with-at-least-32-bytes";
const FIXED_NOW = new Date("2026-10-10T12:00:00.000Z");
const REGISTRATION_PASSWORD = "a-long-password-123";

class FakeRegistrationRepository implements RegistrationOtpRepository {
  readonly users = new Map<string, WithId<UserDocument>>();

  async findUserByNormalizedEmail(normalizedEmail: string): Promise<WithId<UserDocument> | null> {
    return this.users.get(normalizedEmail) ?? null;
  }

  async createPendingUser(user: NewPendingUser): Promise<WithId<UserDocument>> {
    const created: WithId<UserDocument> = { ...user, _id: new ObjectId() };
    this.users.set(user.normalizedEmail, created);
    return created;
  }

  async replaceRegistrationOtp(
    userId: ObjectId,
    currentTime: Date,
    codeHash: string,
    expiresAt: Date,
    resendAvailableAt: Date,
    pendingExpiresAt: Date,
    name?: string,
  ): Promise<WithId<UserDocument> | null> {
    const user = [...this.users.values()].find((candidate) => candidate._id.equals(userId));
    if (
      user?.status !== "pending" ||
      !user.emailOtpResendAt ||
      user.emailOtpResendAt > currentTime
    ) {
      return null;
    }

    user.emailOtpCodeHash = codeHash;
    user.emailOtpExpiresAt = expiresAt;
    user.emailOtpResendAt = resendAvailableAt;
    user.emailOtpAttempts = 0;
    user.pendingExpiresAt = pendingExpiresAt;
    if (name) user.name = name;
    user.updatedAt = currentTime;
    return user;
  }

  async verifyRegistrationOtp(
    normalizedEmail: string,
    codeHash: string,
    now: Date,
    passwordHash: string,
  ): Promise<WithId<UserDocument> | null> {
    const user = this.users.get(normalizedEmail);
    if (user?.status !== "pending") return null;

    if (
      user.emailOtpCodeHash === codeHash &&
      user.emailOtpExpiresAt &&
      user.emailOtpExpiresAt > now &&
      (user.emailOtpAttempts ?? 0) < 5
    ) {
      user.status = "active";
      user.authProvider = "email";
      user.passwordHash = passwordHash;
      user.updatedAt = now;
      delete user.pendingExpiresAt;
      delete user.emailOtpCodeHash;
      delete user.emailOtpExpiresAt;
      delete user.emailOtpResendAt;
      delete user.emailOtpAttempts;
      return user;
    }

    if (
      user.emailOtpExpiresAt &&
      user.emailOtpExpiresAt > now &&
      (user.emailOtpAttempts ?? 0) < 5
    ) {
      user.emailOtpAttempts = (user.emailOtpAttempts ?? 0) + 1;
      user.updatedAt = now;
    }
    return null;
  }
}

class FakeAuthRepository implements AuthRepository {
  readonly sessions: Array<NewRefreshSession & { _id: ObjectId }> = [];

  async findActiveUserByEmail(): Promise<WithId<UserDocument> | null> {
    return null;
  }

  async findActiveUserById(): Promise<WithId<UserDocument> | null> {
    return null;
  }

  async linkGoogleSubject(): Promise<WithId<UserDocument> | null> {
    return null;
  }

  async createRefreshSession(session: NewRefreshSession): Promise<void> {
    this.sessions.push({ ...session, _id: new ObjectId() });
  }

  async rotateRefreshSession(): Promise<WithId<RefreshSessionDocument> | null> {
    return null;
  }

  async revokeRefreshToken(): Promise<void> {}

  async revokeRefreshSession(): Promise<void> {}
}

class CapturingEmailSender implements EmailOtpSender {
  readonly sent: Array<{ email: string; code: string }> = [];

  async sendRegistrationCode(email: string, code: string): Promise<void> {
    this.sent.push({ email, code });
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

function createOtpService(
  registrationRepository: FakeRegistrationRepository,
  authRepository: FakeAuthRepository,
  sender: CapturingEmailSender,
  nodeEnvironment = "test",
  clock: () => Date = () => new Date(FIXED_NOW),
) {
  const authService = new AuthService(authRepository, JWT_SECRET, clock);
  const otpService = new EmailOtpService(
    registrationRepository,
    authService,
    JWT_SECRET,
    "mock",
    nodeEnvironment,
    sender,
    clock,
  );
  return { authService, otpService };
}

test("registration stores only a keyed OTP hash, enforces resend cooldown, then activates and issues a session", async () => {
  const registrationRepository = new FakeRegistrationRepository();
  const authRepository = new FakeAuthRepository();
  const sender = new CapturingEmailSender();
  let now = new Date(FIXED_NOW);
  const { authService, otpService } = createOtpService(
    registrationRepository,
    authRepository,
    sender,
    "development",
    () => new Date(now),
  );

  const requested = await otpService.register(
    "  Test Customer  ",
    " Test.Customer@Example.COM ",
    REGISTRATION_PASSWORD,
  );
  assert.equal(requested.developmentCode, sender.sent[0].code);
  assert.match(sender.sent[0].code, /^\d{6}$/);

  const user = registrationRepository.users.get("test.customer@example.com");
  assert.ok(user);
  assert.equal(user.status, "pending");
  assert.notEqual(user.emailOtpCodeHash, sender.sent[0].code);
  assert.equal(
    user.emailOtpCodeHash,
    hashRegistrationOtp(JWT_SECRET, "test.customer@example.com", sender.sent[0].code),
  );
  assert.equal(user.passwordHash, undefined, "a pending sign-up stores no password");

  await otpService.requestRegistrationOtp("test.customer@example.com");
  assert.equal(sender.sent.length, 1, "cooldown should suppress a resend");

  now = new Date(now.getTime() + 60_000);
  await otpService.requestRegistrationOtp("test.customer@example.com");
  assert.equal(sender.sent.length, 2);
  assert.notEqual(sender.sent[1].code, sender.sent[0].code);

  await assert.rejects(
    otpService.verifyRegistrationOtp(
      "test.customer@example.com",
      sender.sent[0].code,
      REGISTRATION_PASSWORD,
    ),
    (error: unknown) => error instanceof AuthError && error.statusCode === 401,
  );
  const session = await otpService.verifyRegistrationOtp(
    "test.customer@example.com",
    sender.sent[1].code,
    REGISTRATION_PASSWORD,
  );
  assert.equal(user.status, "active");
  assert.ok(String(user.passwordHash).startsWith("$argon2id$"));
  assert.equal(user.emailOtpCodeHash, undefined);
  assert.equal(authRepository.sessions.length, 1);
  assert.equal(
    (await authService.verifyAccessToken(session.accessToken)).userId,
    user._id.toHexString(),
  );
});

test("a registration code is locked after five invalid attempts", async () => {
  const registrationRepository = new FakeRegistrationRepository();
  const authRepository = new FakeAuthRepository();
  const sender = new CapturingEmailSender();
  const { otpService } = createOtpService(registrationRepository, authRepository, sender);
  await otpService.register("Test Customer", "locked@example.com", REGISTRATION_PASSWORD);
  const code = sender.sent[0].code;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(
      otpService.verifyRegistrationOtp(
        "locked@example.com",
        code === "000000" ? "000001" : "000000",
        REGISTRATION_PASSWORD,
      ),
      (error: unknown) => error instanceof AuthError && error.statusCode === 401,
    );
  }

  await assert.rejects(
    otpService.verifyRegistrationOtp("locked@example.com", code, REGISTRATION_PASSWORD),
    (error: unknown) => error instanceof AuthError && error.statusCode === 401,
  );
  assert.equal(registrationRepository.users.get("locked@example.com")?.status, "pending");
  assert.equal(registrationRepository.users.get("locked@example.com")?.emailOtpAttempts, 5);
});

test("registration enforces the recommended password minimum and rejects mock email in production", async () => {
  const repository = new FakeRegistrationRepository();
  const authRepository = new FakeAuthRepository();
  const sender = new CapturingEmailSender();
  const { otpService } = createOtpService(repository, authRepository, sender);

  await assert.rejects(
    otpService.register("Short Password", "short@example.com", "short"),
    (error: unknown) => error instanceof AuthError && error.statusCode === 400,
  );

  const productionService = new EmailOtpService(
    repository,
    new AuthService(authRepository, JWT_SECRET),
    JWT_SECRET,
    "mock",
    "production",
    sender,
  );
  await assert.rejects(
    productionService.register("Prod User", "prod@example.com", REGISTRATION_PASSWORD),
  );
});

test("OTP HTTP routes expose a development code only in mock development and establish a session on verification", async () => {
  const registrationRepository = new FakeRegistrationRepository();
  const authRepository = new FakeAuthRepository();
  const sender = new CapturingEmailSender();
  const { authService, otpService } = createOtpService(
    registrationRepository,
    authRepository,
    sender,
    "development",
  );
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/auth",
    createAuthRouter({
      createService: async () => authService,
      createEmailOtpService: async () => otpService,
      webOrigin: "http://localhost:3000",
      nodeEnvironment: "development",
    }),
  );

  await withServer(app, async (baseUrl) => {
    const registration = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({
        name: "Test Customer",
        email: "otp@example.com",
        password: REGISTRATION_PASSWORD,
      }),
    });
    assert.equal(registration.status, 202);
    const registrationBody = (await registration.json()) as { developmentCode: string };
    assert.match(registrationBody.developmentCode, /^\d{6}$/);

    const verification = await fetch(`${baseUrl}/api/v1/auth/otp/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({
        email: "otp@example.com",
        code: registrationBody.developmentCode,
        password: REGISTRATION_PASSWORD,
      }),
    });
    assert.equal(verification.status, 200);
    assert.match(verification.headers.get("set-cookie") ?? "", /HttpOnly/i);
    assert.ok(((await verification.json()) as { accessToken: string }).accessToken);
  });
});

test("a pending sign-up started by someone else cannot set the password of the verified account", async () => {
  const registrationRepository = new FakeRegistrationRepository();
  const authRepository = new FakeAuthRepository();
  const sender = new CapturingEmailSender();
  let now = new Date(FIXED_NOW);
  const { otpService } = createOtpService(
    registrationRepository,
    authRepository,
    sender,
    "development",
    () => new Date(now),
  );

  await otpService.register("Attacker", "victim@example.com", "attacker-password-123");
  const pending = registrationRepository.users.get("victim@example.com");
  assert.ok(pending);
  assert.equal(pending.passwordHash, undefined);

  now = new Date(now.getTime() + 60_000);
  await otpService.register("Real Owner", "victim@example.com", REGISTRATION_PASSWORD);
  assert.equal(sender.sent.length, 2, "re-registering a pending address re-issues the code");
  assert.equal(pending.name, "Real Owner");

  await assert.rejects(
    otpService.verifyRegistrationOtp(
      "victim@example.com",
      sender.sent[0].code,
      "attacker-password-123",
    ),
    (error: unknown) => error instanceof AuthError && error.statusCode === 401,
    "the first code stops working once a new one is issued",
  );

  await otpService.verifyRegistrationOtp(
    "victim@example.com",
    sender.sent[1].code,
    REGISTRATION_PASSWORD,
  );
  assert.equal(pending.status, "active");
  assert.equal(await verifyPassword(REGISTRATION_PASSWORD, String(pending.passwordHash)), true);
  assert.equal(await verifyPassword("attacker-password-123", String(pending.passwordHash)), false);
});

test("pending sign-ups carry an expiry for the TTL index and lose it on activation", async () => {
  const registrationRepository = new FakeRegistrationRepository();
  const authRepository = new FakeAuthRepository();
  const sender = new CapturingEmailSender();
  const { otpService } = createOtpService(
    registrationRepository,
    authRepository,
    sender,
    "development",
    () => new Date(FIXED_NOW),
  );

  await otpService.register("Pending", "pending@example.com", REGISTRATION_PASSWORD);
  const user = registrationRepository.users.get("pending@example.com");
  assert.ok(user?.pendingExpiresAt);
  assert.equal(user.pendingExpiresAt.getTime() - FIXED_NOW.getTime(), PENDING_REGISTRATION_TTL_MS);

  await otpService.verifyRegistrationOtp(
    "pending@example.com",
    sender.sent[0].code,
    REGISTRATION_PASSWORD,
  );
  assert.equal(user.pendingExpiresAt, undefined);
});

test("verification requires a valid password alongside the code", async () => {
  const registrationRepository = new FakeRegistrationRepository();
  const { otpService } = createOtpService(
    registrationRepository,
    new FakeAuthRepository(),
    new CapturingEmailSender(),
  );
  await assert.rejects(
    otpService.verifyRegistrationOtp("someone@example.com", "123456", "short"),
    (error: unknown) => error instanceof AuthError && error.statusCode === 400,
  );
});
