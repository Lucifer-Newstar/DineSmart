import type { Db, ObjectId, WithId } from "mongodb";
import { COLLECTIONS, type RefreshSessionDocument, type UserDocument } from "../database/schema.js";

export interface NewRefreshSession {
  userId: ObjectId;
  tokenHash: string;
  usedTokenHashes: string[];
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthRepository {
  findActiveUserByEmail(normalizedEmail: string): Promise<WithId<UserDocument> | null>;
  findActiveUserById(userId: ObjectId): Promise<WithId<UserDocument> | null>;
  linkGoogleSubject(
    userId: ObjectId,
    googleSubject: string,
    now: Date,
  ): Promise<WithId<UserDocument> | null>;
  createRefreshSession(session: NewRefreshSession): Promise<void>;
  rotateRefreshSession(
    currentTokenHash: string,
    nextTokenHash: string,
    now: Date,
  ): Promise<WithId<RefreshSessionDocument> | null>;
  revokeRefreshToken(tokenHash: string, now: Date): Promise<void>;
  revokeRefreshSession(sessionId: ObjectId, now: Date): Promise<void>;
  /** Atomically counts one wrong password and returns the new total. */
  recordFailedLogin(userId: ObjectId, now: Date): Promise<number>;
  /** Locks password sign-in until the given time and restarts the count. */
  lockLogin(userId: ObjectId, until: Date, now: Date): Promise<void>;
  clearFailedLogins(userId: ObjectId, now: Date): Promise<void>;
  setSessionDeviceLabel(tokenHash: string, deviceLabel: string): Promise<void>;
  /** Unrevoked, unexpired sessions for one user, most recently used first. */
  listActiveSessions(userId: ObjectId, now: Date): Promise<WithId<RefreshSessionDocument>[]>;
  /** Revokes one of the user's sessions; false when it is not theirs or already ended. */
  revokeUserSession(userId: ObjectId, sessionId: ObjectId, now: Date): Promise<boolean>;
  /** Revokes every active session of the user except the one holding keepTokenHash. */
  revokeOtherSessions(userId: ObjectId, keepTokenHash: string | null, now: Date): Promise<number>;
}

export class MongoAuthRepository implements AuthRepository {
  private readonly users;
  private readonly sessions;

  constructor(db: Db) {
    this.users = db.collection<UserDocument>(COLLECTIONS.users);
    this.sessions = db.collection<RefreshSessionDocument>(COLLECTIONS.refreshSessions);
  }

  findActiveUserByEmail(normalizedEmail: string): Promise<WithId<UserDocument> | null> {
    return this.users.findOne({ normalizedEmail, status: "active" });
  }

  findActiveUserById(userId: ObjectId): Promise<WithId<UserDocument> | null> {
    return this.users.findOne({ _id: userId, status: "active" });
  }

  async linkGoogleSubject(
    userId: ObjectId,
    googleSubject: string,
    now: Date,
  ): Promise<WithId<UserDocument> | null> {
    const linked = await this.users.findOneAndUpdate(
      {
        _id: userId,
        status: "active",
        googleSubject: { $exists: false },
      },
      { $set: { googleSubject, authProvider: "google", updatedAt: now } },
      { returnDocument: "after", includeResultMetadata: false },
    );

    if (linked) return linked;
    return this.users.findOne({ _id: userId, status: "active", googleSubject });
  }

  async createRefreshSession(session: NewRefreshSession): Promise<void> {
    await this.sessions.insertOne(session);
  }

  async rotateRefreshSession(
    currentTokenHash: string,
    nextTokenHash: string,
    now: Date,
  ): Promise<WithId<RefreshSessionDocument> | null> {
    const rotated = await this.sessions.findOneAndUpdate(
      { tokenHash: currentTokenHash, revokedAt: null, expiresAt: { $gt: now } },
      {
        $set: { tokenHash: nextTokenHash, lastUsedAt: now, updatedAt: now },
        $addToSet: { usedTokenHashes: currentTokenHash },
      },
      { returnDocument: "after", includeResultMetadata: false },
    );

    if (rotated) return rotated;

    // A previously rotated token is a replay: revoke the entire session family.
    const replayed = await this.sessions.findOne({
      usedTokenHashes: currentTokenHash,
      revokedAt: null,
      expiresAt: { $gt: now },
    });
    if (replayed) {
      await this.sessions.updateOne(
        { _id: replayed._id, revokedAt: null },
        { $set: { revokedAt: now, updatedAt: now } },
      );
    }

    return null;
  }

  async revokeRefreshToken(tokenHash: string, now: Date): Promise<void> {
    await this.sessions.updateOne(
      {
        $or: [{ tokenHash }, { usedTokenHashes: tokenHash }],
        revokedAt: null,
      },
      { $set: { revokedAt: now, updatedAt: now } },
    );
  }

  async revokeRefreshSession(sessionId: ObjectId, now: Date): Promise<void> {
    await this.sessions.updateOne(
      { _id: sessionId, revokedAt: null },
      { $set: { revokedAt: now, updatedAt: now } },
    );
  }

  async recordFailedLogin(userId: ObjectId, now: Date): Promise<number> {
    const user = await this.users.findOneAndUpdate(
      { _id: userId },
      { $inc: { failedLoginAttempts: 1 }, $set: { updatedAt: now } },
      { returnDocument: "after", projection: { failedLoginAttempts: 1 } },
    );
    return user?.failedLoginAttempts ?? 0;
  }

  async lockLogin(userId: ObjectId, until: Date, now: Date): Promise<void> {
    await this.users.updateOne(
      { _id: userId },
      { $set: { loginLockedUntil: until, failedLoginAttempts: 0, updatedAt: now } },
    );
  }

  async clearFailedLogins(userId: ObjectId, now: Date): Promise<void> {
    await this.users.updateOne(
      { _id: userId },
      { $set: { failedLoginAttempts: 0, updatedAt: now }, $unset: { loginLockedUntil: "" } },
    );
  }

  async setSessionDeviceLabel(tokenHash: string, deviceLabel: string): Promise<void> {
    await this.sessions.updateOne({ tokenHash, revokedAt: null }, { $set: { deviceLabel } });
  }

  listActiveSessions(userId: ObjectId, now: Date): Promise<WithId<RefreshSessionDocument>[]> {
    return this.sessions
      .find(
        { userId, revokedAt: null, expiresAt: { $gt: now } },
        { projection: { usedTokenHashes: 0 } },
      )
      .sort({ lastUsedAt: -1, createdAt: -1 })
      .limit(50)
      .toArray();
  }

  async revokeUserSession(userId: ObjectId, sessionId: ObjectId, now: Date): Promise<boolean> {
    const result = await this.sessions.updateOne(
      { _id: sessionId, userId, revokedAt: null },
      { $set: { revokedAt: now, updatedAt: now } },
    );
    return result.modifiedCount === 1;
  }

  async revokeOtherSessions(
    userId: ObjectId,
    keepTokenHash: string | null,
    now: Date,
  ): Promise<number> {
    const result = await this.sessions.updateMany(
      {
        userId,
        revokedAt: null,
        ...(keepTokenHash ? { tokenHash: { $ne: keepTokenHash } } : {}),
      },
      { $set: { revokedAt: now, updatedAt: now } },
    );
    return result.modifiedCount;
  }
}
