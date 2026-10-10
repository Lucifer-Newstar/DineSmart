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
}
