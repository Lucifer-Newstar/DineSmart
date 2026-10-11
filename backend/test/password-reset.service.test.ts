import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { AuthConfigurationError, AuthError, verifyPassword } from "../src/auth/auth.service.js";
import { hashRegistrationOtp } from "../src/auth/email-otp.service.js";
import type {
  PasswordResetRepository,
  PasswordResetTarget,
} from "../src/auth/password-reset.repository.js";
import {
  hashPasswordResetOtp,
  type PasswordResetEmailSender,
  PasswordResetService,
} from "../src/auth/password-reset.service.js";

const secret = "local-test-secret-with-at-least-32-bytes";
const now = new Date("2026-10-11T12:00:00.000Z");
const userId = new ObjectId();

class FakePasswordResetRepository implements PasswordResetRepository {
  target: PasswordResetTarget | null = { id: userId, email: "Ananya@example.test" };
  completedUserId: ObjectId | null = userId;
  issued?: {
    normalizedEmail: string;
    codeHash: string;
    now: Date;
    expiresAt: Date;
    resendAt: Date;
  };
  replacement?: {
    normalizedEmail: string;
    codeHash: string;
    passwordHash: string;
    now: Date;
  };
  revoked?: { userId: ObjectId; now: Date };
  failRevocation = false;

  async issuePasswordResetCode(
    normalizedEmail: string,
    codeHash: string,
    at: Date,
    expiresAt: Date,
    resendAt: Date,
  ): Promise<PasswordResetTarget | null> {
    this.issued = { normalizedEmail, codeHash, now: at, expiresAt, resendAt };
    return this.target;
  }

  async replacePasswordWithResetCode(
    normalizedEmail: string,
    codeHash: string,
    passwordHash: string,
    at: Date,
  ): Promise<ObjectId | null> {
    this.replacement = { normalizedEmail, codeHash, passwordHash, now: at };
    return this.completedUserId;
  }

  async revokeActiveRefreshSessions(userIdArg: ObjectId, at: Date): Promise<void> {
    this.revoked = { userId: userIdArg, now: at };
    if (this.failRevocation) throw new Error("injected revocation failure");
  }
}

class CapturingPasswordResetSender implements PasswordResetEmailSender {
  sent: Array<{ email: string; code: string }> = [];

  async sendPasswordResetCode(email: string, code: string): Promise<void> {
    this.sent.push({ email, code });
  }
}

function createService(
  repository = new FakePasswordResetRepository(),
  sender = new CapturingPasswordResetSender(),
  nodeEnvironment = "development",
  emailProvider = "mock",
) {
  const service = new PasswordResetService(
    repository,
    secret,
    emailProvider,
    nodeEnvironment,
    sender,
    () => now,
    () => "123456",
  );
  return { repository, sender, service };
}

test("password reset request normalizes email, stores only a domain-separated HMAC, and returns a dev-only code", async () => {
  const { repository, sender, service } = createService();
  const result = await service.requestReset("  ANANYA@example.test ");

  assert.equal(
    result.message,
    "If an eligible account exists, password reset instructions have been sent.",
  );
  assert.equal(result.developmentCode, "123456");
  assert.deepEqual(repository.issued, {
    normalizedEmail: "ananya@example.test",
    codeHash: hashPasswordResetOtp(secret, "ananya@example.test", "123456"),
    now,
    expiresAt: new Date(now.getTime() + 10 * 60_000),
    resendAt: new Date(now.getTime() + 60_000),
  });
  assert.notEqual(repository.issued?.codeHash, "123456");
  assert.deepEqual(sender.sent, [{ email: "Ananya@example.test", code: "123456" }]);
  assert.notEqual(
    hashPasswordResetOtp(secret, "ananya@example.test", "123456"),
    hashRegistrationOtp(secret, "ananya@example.test", "123456"),
  );
});

test("unknown, disabled, passwordless, or cooling-down accounts get the same generic response", async () => {
  const noAccountRepository = new FakePasswordResetRepository();
  noAccountRepository.target = null;
  const noAccount = createService(noAccountRepository);
  const noAccountResult = await noAccount.service.requestReset("ananya@example.test");

  const coolingRepository = new FakePasswordResetRepository();
  coolingRepository.target = null;
  const cooling = createService(coolingRepository);
  const coolingResult = await cooling.service.requestReset("ananya@example.test");

  assert.deepEqual(noAccountResult, coolingResult);
  assert.equal(noAccountResult.developmentCode, undefined);
  assert.deepEqual(noAccount.sender.sent, []);
  assert.deepEqual(cooling.sender.sent, []);
});

test("password reset request rejects malformed email and fails closed without a development mock provider", async () => {
  const { repository, service } = createService();
  await assert.rejects(
    service.requestReset("not an email"),
    (error: unknown) => error instanceof AuthError && error.code === "invalid_request",
  );
  assert.equal(repository.issued, undefined);

  for (const config of [
    { nodeEnvironment: "production", emailProvider: "mock" },
    { nodeEnvironment: "development", emailProvider: "smtp" },
  ]) {
    const unavailable = createService(
      new FakePasswordResetRepository(),
      new CapturingPasswordResetSender(),
      config.nodeEnvironment,
      config.emailProvider,
    );
    await assert.rejects(
      unavailable.service.requestReset("ananya@example.test"),
      AuthConfigurationError,
    );
    assert.equal(unavailable.repository.issued, undefined);
  }
});

test("request response omits the code outside development even when the mock provider is used", async () => {
  const { sender, service } = createService(
    new FakePasswordResetRepository(),
    new CapturingPasswordResetSender(),
    "test",
  );
  const result = await service.requestReset("ananya@example.test");
  assert.equal(result.developmentCode, undefined);
  assert.deepEqual(sender.sent, [{ email: "Ananya@example.test", code: "123456" }]);
});

test("confirmation hashes the replacement password, consumes the code, and revokes all user sessions", async () => {
  const { repository, service } = createService();
  await service.confirmReset("ANANYA@example.test", "123456", "a-new-password-123");

  assert.equal(repository.replacement?.normalizedEmail, "ananya@example.test");
  assert.equal(
    repository.replacement?.codeHash,
    hashPasswordResetOtp(secret, "ananya@example.test", "123456"),
  );
  const passwordHash = repository.replacement?.passwordHash;
  assert.ok(passwordHash?.startsWith("$argon2id$"));
  assert.ok(passwordHash);
  assert.equal(await verifyPassword("a-new-password-123", passwordHash), true);
  assert.deepEqual(repository.revoked, { userId, now });
});

test("confirmation requires the approved password bounds and a six-digit code", async () => {
  const { repository, service } = createService();
  const invalid = [
    { email: "ananya@example.test", code: "12345", password: "a-new-password-123" },
    { email: "ananya@example.test", code: "123456", password: "short-pass" },
    { email: "ananya@example.test", code: "123456", password: `a${"é".repeat(600)}` },
  ];
  for (const attempt of invalid) {
    await assert.rejects(
      service.confirmReset(attempt.email, attempt.code, attempt.password),
      (error: unknown) => error instanceof AuthError && error.statusCode === 400,
    );
  }
  assert.equal(repository.replacement, undefined);
});

test("invalid or expired reset code is generic and does not revoke sessions", async () => {
  const repository = new FakePasswordResetRepository();
  repository.completedUserId = null;
  const { service } = createService(repository);
  await assert.rejects(
    service.confirmReset("ananya@example.test", "123456", "a-new-password-123"),
    (error: unknown) => error instanceof AuthError && error.code === "invalid_password_reset_code",
  );
  assert.equal(repository.revoked, undefined);
});

test("bulk session-revocation failure reports completed password replacement without exposing internals", async () => {
  const repository = new FakePasswordResetRepository();
  repository.failRevocation = true;
  const { service } = createService(repository);
  await assert.rejects(
    service.confirmReset("ananya@example.test", "123456", "a-new-password-123"),
    (error: unknown) =>
      error instanceof AuthError &&
      error.statusCode === 503 &&
      error.code === "password_reset_sessions_pending" &&
      !error.message.includes("injected"),
  );
  assert.ok(repository.replacement?.passwordHash.startsWith("$argon2id$"));
  assert.equal(repository.replacement?.now, now);
});
