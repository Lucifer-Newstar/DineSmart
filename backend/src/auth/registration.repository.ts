import type { Db, ObjectId, WithId } from "mongodb";
import { COLLECTIONS, type UserDocument } from "../database/schema.js";

export interface NewPendingUser {
  name: string;
  email: string;
  normalizedEmail: string;
  role: "Customer";
  restaurantId: null;
  status: "pending";
  authProvider: "email";
  emailOtpCodeHash: string;
  emailOtpExpiresAt: Date;
  emailOtpResendAt: Date;
  emailOtpAttempts: number;
  /** Unverified sign-ups are removed by a TTL index once this passes. */
  pendingExpiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegistrationOtpRepository {
  findUserByNormalizedEmail(normalizedEmail: string): Promise<WithId<UserDocument> | null>;
  createPendingUser(user: NewPendingUser): Promise<WithId<UserDocument>>;
  replaceRegistrationOtp(
    userId: ObjectId,
    currentTime: Date,
    codeHash: string,
    expiresAt: Date,
    resendAvailableAt: Date,
    pendingExpiresAt: Date,
    name?: string,
  ): Promise<WithId<UserDocument> | null>;
  /**
   * Activates a pending sign-up and stores the password supplied together with the
   * code. A pending account never carries a password before this point, so whoever
   * started the sign-up cannot choose the password of an address they do not own.
   */
  verifyRegistrationOtp(
    normalizedEmail: string,
    codeHash: string,
    now: Date,
    passwordHash: string,
  ): Promise<WithId<UserDocument> | null>;
}

export class MongoRegistrationOtpRepository implements RegistrationOtpRepository {
  private readonly users;

  constructor(db: Db) {
    this.users = db.collection<UserDocument>(COLLECTIONS.users);
  }

  findUserByNormalizedEmail(normalizedEmail: string): Promise<WithId<UserDocument> | null> {
    return this.users.findOne({ normalizedEmail });
  }

  async createPendingUser(user: NewPendingUser): Promise<WithId<UserDocument>> {
    const result = await this.users.insertOne(user);
    return { ...user, _id: result.insertedId };
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
    return this.users.findOneAndUpdate(
      {
        _id: userId,
        status: "pending",
        emailOtpResendAt: { $lte: currentTime },
      },
      {
        $set: {
          emailOtpCodeHash: codeHash,
          emailOtpExpiresAt: expiresAt,
          emailOtpResendAt: resendAvailableAt,
          emailOtpAttempts: 0,
          pendingExpiresAt,
          ...(name ? { name } : {}),
          updatedAt: currentTime,
        },
      },
      { returnDocument: "after", includeResultMetadata: false },
    );
  }

  async verifyRegistrationOtp(
    normalizedEmail: string,
    codeHash: string,
    now: Date,
    passwordHash: string,
  ): Promise<WithId<UserDocument> | null> {
    const activated = await this.users.findOneAndUpdate(
      {
        normalizedEmail,
        status: "pending",
        emailOtpCodeHash: codeHash,
        emailOtpExpiresAt: { $gt: now },
        emailOtpAttempts: { $lt: 5 },
      },
      {
        $set: {
          status: "active",
          authProvider: "email",
          passwordHash,
          updatedAt: now,
        },
        $unset: {
          pendingExpiresAt: "",
          emailOtpCodeHash: "",
          emailOtpExpiresAt: "",
          emailOtpResendAt: "",
          emailOtpAttempts: "",
        },
      },
      { returnDocument: "after", includeResultMetadata: false },
    );

    if (activated) return activated;

    await this.users.updateOne(
      {
        normalizedEmail,
        status: "pending",
        emailOtpExpiresAt: { $gt: now },
        emailOtpAttempts: { $lt: 5 },
      },
      { $inc: { emailOtpAttempts: 1 }, $set: { updatedAt: now } },
    );
    return null;
  }
}
