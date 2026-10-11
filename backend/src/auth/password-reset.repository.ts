import type { Db, ObjectId } from "mongodb";
import { COLLECTIONS, type RefreshSessionDocument, type UserDocument } from "../database/schema.js";
import { PASSWORD_RESET_OTP_MAX_ATTEMPTS } from "./password-reset.constants.js";

export interface PasswordResetTarget {
  id: ObjectId;
  email: string;
}

export interface PasswordResetRepository {
  issuePasswordResetCode(
    normalizedEmail: string,
    codeHash: string,
    now: Date,
    expiresAt: Date,
    resendAt: Date,
  ): Promise<PasswordResetTarget | null>;
  replacePasswordWithResetCode(
    normalizedEmail: string,
    codeHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<ObjectId | null>;
  revokeActiveRefreshSessions(userId: ObjectId, now: Date): Promise<void>;
}

export class MongoPasswordResetRepository implements PasswordResetRepository {
  private readonly users;
  private readonly sessions;

  constructor(db: Db) {
    this.users = db.collection<UserDocument>(COLLECTIONS.users);
    this.sessions = db.collection<RefreshSessionDocument>(COLLECTIONS.refreshSessions);
  }

  async issuePasswordResetCode(
    normalizedEmail: string,
    codeHash: string,
    now: Date,
    expiresAt: Date,
    resendAt: Date,
  ): Promise<PasswordResetTarget | null> {
    const updated = await this.users.findOneAndUpdate(
      {
        normalizedEmail,
        status: "active",
        passwordHash: { $type: "string", $ne: "" },
        $or: [
          { passwordResetResendAt: { $exists: false } },
          { passwordResetResendAt: { $lte: now } },
        ],
      },
      {
        $set: {
          passwordResetCodeHash: codeHash,
          passwordResetExpiresAt: expiresAt,
          passwordResetResendAt: resendAt,
          passwordResetAttempts: 0,
          updatedAt: now,
        },
      },
      { returnDocument: "after", includeResultMetadata: false },
    );
    if (!updated?._id) return null;
    return { id: updated._id, email: updated.email };
  }

  async replacePasswordWithResetCode(
    normalizedEmail: string,
    codeHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<ObjectId | null> {
    const updated = await this.users.findOneAndUpdate(
      {
        normalizedEmail,
        status: "active",
        passwordHash: { $type: "string", $ne: "" },
        passwordResetCodeHash: codeHash,
        passwordResetExpiresAt: { $gt: now },
        passwordResetAttempts: { $lt: PASSWORD_RESET_OTP_MAX_ATTEMPTS },
      },
      {
        $set: {
          passwordHash,
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
      },
      { returnDocument: "after", includeResultMetadata: false, projection: { _id: 1 } },
    );
    if (updated?._id) return updated._id;

    await this.users.updateOne(
      {
        normalizedEmail,
        status: "active",
        passwordHash: { $type: "string", $ne: "" },
        passwordResetExpiresAt: { $gt: now },
        passwordResetAttempts: { $lt: PASSWORD_RESET_OTP_MAX_ATTEMPTS },
      },
      { $inc: { passwordResetAttempts: 1 }, $set: { updatedAt: now } },
    );
    return null;
  }

  async revokeActiveRefreshSessions(userId: ObjectId, now: Date): Promise<void> {
    await this.sessions.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: now, updatedAt: now } },
    );
  }
}
