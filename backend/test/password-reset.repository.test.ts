import assert from "node:assert/strict";
import { test } from "node:test";
import { type Db, ObjectId } from "mongodb";
import { MongoPasswordResetRepository } from "../src/auth/password-reset.repository.js";
import {
  COLLECTIONS,
  type RefreshSessionDocument,
  type UserDocument,
} from "../src/database/schema.js";

const now = new Date("2026-10-11T12:00:00.000Z");

function fixture(
  options: {
    status?: UserDocument["status"];
    passwordHash?: string | null;
    resendAt?: Date;
    expiresAt?: Date;
    attempts?: number;
    codeHash?: string;
    failBulkRevoke?: boolean;
  } = {},
) {
  const userId = new ObjectId();
  const normalizedEmail = "ananya@example.test";
  const user: UserDocument & { _id: ObjectId } = {
    _id: userId,
    name: "Ananya Menon",
    email: "Ananya@example.test",
    normalizedEmail,
    role: "Customer",
    restaurantId: null,
    status: options.status ?? "active",
    ...(options.passwordHash === null
      ? {}
      : { passwordHash: options.passwordHash ?? "argon2id-old-hash" }),
    createdAt: now,
    updatedAt: now,
    ...(options.resendAt ? { passwordResetResendAt: options.resendAt } : {}),
    ...(options.expiresAt ? { passwordResetExpiresAt: options.expiresAt } : {}),
    ...(options.attempts === undefined ? {} : { passwordResetAttempts: options.attempts }),
    ...(options.codeHash ? { passwordResetCodeHash: options.codeHash } : {}),
  };
  const calls: {
    issueFilter?: Record<string, unknown>;
    issueUpdate?: Record<string, unknown>;
    replaceFilter?: Record<string, unknown>;
    replaceUpdate?: Record<string, unknown>;
    attemptFilter?: Record<string, unknown>;
    attemptUpdate?: Record<string, unknown>;
    sessionFilter?: Record<string, unknown>;
    sessionUpdate?: Record<string, unknown>;
  } = {};
  const sessions: Array<RefreshSessionDocument & { _id: ObjectId }> = [
    {
      _id: new ObjectId(),
      userId,
      tokenHash: "current-hash",
      usedTokenHashes: [],
      expiresAt: new Date(now.getTime() + 60_000),
      revokedAt: null,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const db = {
    collection(name: string) {
      return {
        async findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>) {
          if (name !== COLLECTIONS.users) return null;
          const set = update.$set as Record<string, unknown> | undefined;
          if (filter.passwordResetCodeHash !== undefined) {
            calls.replaceFilter = filter;
            calls.replaceUpdate = update;
            const timeLimit = (filter.passwordResetExpiresAt as { $gt?: Date } | undefined)?.$gt;
            const matches =
              user.normalizedEmail === filter.normalizedEmail &&
              user.status === "active" &&
              typeof user.passwordHash === "string" &&
              user.passwordHash.length > 0 &&
              user.passwordResetCodeHash === filter.passwordResetCodeHash &&
              !!timeLimit &&
              !!user.passwordResetExpiresAt &&
              user.passwordResetExpiresAt > timeLimit &&
              (user.passwordResetAttempts ?? 0) < 5;
            if (!matches) return null;
            Object.assign(user, set);
            const unset = update.$unset as Record<string, unknown> | undefined;
            if (unset) {
              for (const key of Object.keys(unset)) delete (user as Record<string, unknown>)[key];
            }
            return { _id: user._id };
          }

          calls.issueFilter = filter;
          calls.issueUpdate = update;
          const cooldowns = filter.$or as Array<Record<string, Record<string, unknown>>>;
          const eligible =
            user.normalizedEmail === filter.normalizedEmail &&
            user.status === "active" &&
            typeof user.passwordHash === "string" &&
            user.passwordHash.length > 0 &&
            cooldowns.some((entry) => {
              const condition = entry.passwordResetResendAt;
              if (condition?.$exists === false) return user.passwordResetResendAt === undefined;
              const resendAt = condition?.$lte;
              return (
                resendAt instanceof Date &&
                !!user.passwordResetResendAt &&
                user.passwordResetResendAt <= resendAt
              );
            });
          if (!eligible) return null;
          Object.assign(user, set);
          return { _id: user._id, email: user.email };
        },
        async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>) {
          calls.attemptFilter = filter;
          calls.attemptUpdate = update;
          const timeLimit = (filter.passwordResetExpiresAt as { $gt?: Date } | undefined)?.$gt;
          if (
            user.normalizedEmail === filter.normalizedEmail &&
            user.status === "active" &&
            typeof user.passwordHash === "string" &&
            user.passwordHash.length > 0 &&
            timeLimit &&
            user.passwordResetExpiresAt &&
            user.passwordResetExpiresAt > timeLimit &&
            (user.passwordResetAttempts ?? 0) < 5
          ) {
            user.passwordResetAttempts = (user.passwordResetAttempts ?? 0) + 1;
          }
          return { matchedCount: 1 };
        },
        async updateMany(filter: Record<string, unknown>, update: Record<string, unknown>) {
          calls.sessionFilter = filter;
          calls.sessionUpdate = update;
          if (options.failBulkRevoke) throw new Error("injected session revocation failure");
          for (const session of sessions) {
            if (session.userId.equals(filter.userId as ObjectId) && session.revokedAt === null) {
              session.revokedAt = (update.$set as { revokedAt: Date }).revokedAt;
            }
          }
          return { modifiedCount: sessions.length };
        },
      };
    },
  } as unknown as Db;

  return {
    repository: new MongoPasswordResetRepository(db),
    calls,
    userId,
    normalizedEmail,
    get user() {
      return user;
    },
    sessions,
  };
}

test("reset-code issuance is an atomic update limited to active password-backed users", async () => {
  const harness = fixture();
  const target = await harness.repository.issuePasswordResetCode(
    harness.normalizedEmail,
    "hashed-otp",
    now,
    new Date(now.getTime() + 600_000),
    new Date(now.getTime() + 60_000),
  );
  assert.deepEqual(target, { id: harness.userId, email: "Ananya@example.test" });
  assert.deepEqual(harness.calls.issueFilter, {
    normalizedEmail: harness.normalizedEmail,
    status: "active",
    passwordHash: { $type: "string", $ne: "" },
    $or: [{ passwordResetResendAt: { $exists: false } }, { passwordResetResendAt: { $lte: now } }],
  });
  assert.deepEqual(harness.calls.issueUpdate, {
    $set: {
      passwordResetCodeHash: "hashed-otp",
      passwordResetExpiresAt: new Date(now.getTime() + 600_000),
      passwordResetResendAt: new Date(now.getTime() + 60_000),
      passwordResetAttempts: 0,
      updatedAt: now,
    },
  });
  assert.equal("code" in harness.user, false);
});

test("reset-code issuance returns no target for ineligible or cooling-down accounts", async () => {
  for (const options of [
    { status: "pending" as const },
    { status: "disabled" as const },
    { passwordHash: null },
    { passwordHash: "" },
    { resendAt: new Date(now.getTime() + 60_000) },
  ]) {
    const harness = fixture(options);
    const target = await harness.repository.issuePasswordResetCode(
      harness.normalizedEmail,
      "hmac",
      now,
      new Date(now.getTime() + 600_000),
      new Date(now.getTime() + 60_000),
    );
    assert.equal(target, null);
  }
});

test("valid reset code atomically replaces the hash, stamps passwordChangedAt, and clears reset state", async () => {
  const expiresAt = new Date(now.getTime() + 600_000);
  const harness = fixture({
    codeHash: "valid-hmac",
    expiresAt,
    attempts: 0,
    resendAt: new Date(now.getTime() + 60_000),
  });
  const userId = await harness.repository.replacePasswordWithResetCode(
    harness.normalizedEmail,
    "valid-hmac",
    "argon2id-new-hash",
    now,
  );

  assert.equal(userId, harness.userId);
  assert.deepEqual(harness.calls.replaceFilter, {
    normalizedEmail: harness.normalizedEmail,
    status: "active",
    passwordHash: { $type: "string", $ne: "" },
    passwordResetCodeHash: "valid-hmac",
    passwordResetExpiresAt: { $gt: now },
    passwordResetAttempts: { $lt: 5 },
  });
  assert.deepEqual(harness.calls.replaceUpdate, {
    $set: {
      passwordHash: "argon2id-new-hash",
      passwordChangedAt: now,
      authProvider: "email",
      updatedAt: now,
    },
    $unset: {
      passwordResetCodeHash: "",
      passwordResetExpiresAt: "",
      passwordResetResendAt: "",
      passwordResetAttempts: "",
    },
  });
  assert.equal(harness.user.passwordHash, "argon2id-new-hash");
  assert.equal(harness.user.passwordChangedAt, now);
  assert.equal(harness.user.passwordResetCodeHash, undefined);
  assert.equal(harness.user.passwordResetExpiresAt, undefined);
});

test("invalid code increments attempts only while a reset is live and below the lockout limit", async () => {
  const harness = fixture({
    codeHash: "different-hmac",
    expiresAt: new Date(now.getTime() + 600_000),
    attempts: 1,
  });
  const result = await harness.repository.replacePasswordWithResetCode(
    harness.normalizedEmail,
    "wrong-hmac",
    "argon2id-hash",
    now,
  );
  assert.equal(result, null);
  assert.deepEqual(harness.calls.attemptUpdate, {
    $inc: { passwordResetAttempts: 1 },
    $set: { updatedAt: now },
  });
  assert.equal(harness.user.passwordResetAttempts, 2);

  const locked = fixture({
    codeHash: "hmac",
    expiresAt: new Date(now.getTime() + 600_000),
    attempts: 5,
  });
  await locked.repository.replacePasswordWithResetCode(
    locked.normalizedEmail,
    "wrong",
    "hash",
    now,
  );
  assert.equal(locked.user.passwordResetAttempts, 5);
});

test("refresh-session revocation filters the user and only currently active sessions", async () => {
  const harness = fixture();
  await harness.repository.revokeActiveRefreshSessions(harness.userId, now);
  assert.deepEqual(harness.calls.sessionFilter, { userId: harness.userId, revokedAt: null });
  assert.deepEqual(harness.calls.sessionUpdate, { $set: { revokedAt: now, updatedAt: now } });
  assert.equal(harness.sessions[0]?.revokedAt, now);
});
