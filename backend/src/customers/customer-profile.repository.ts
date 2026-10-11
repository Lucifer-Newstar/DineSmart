import type { Db, ObjectId } from "mongodb";
import { COLLECTIONS, type CustomerDocument, type UserDocument } from "../database/schema.js";

/** Resolves one global Customer profile for an active Customer account. */
export class MongoCustomerProfileRepository {
  private readonly customers;
  private readonly users;

  constructor(db: Db) {
    this.customers = db.collection<CustomerDocument>(COLLECTIONS.customers);
    this.users = db.collection<UserDocument>(COLLECTIONS.users);
  }

  async getCustomerIdForUser(userId: ObjectId, now: Date): Promise<ObjectId | null> {
    const user = await this.users.findOne({ _id: userId, role: "Customer", status: "active" });
    if (user?.role !== "Customer" || user.status !== "active") return null;

    try {
      const customer = await this.customers.findOneAndUpdate(
        { userId },
        {
          $setOnInsert: {
            userId,
            displayName: user.name,
            email: user.email,
            contactPreferences: { email: true },
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true, returnDocument: "after", includeResultMetadata: false },
      );
      if (customer) return customer._id;
    } catch (error) {
      // A concurrent first customer workflow can create the profile first.
      if (!isDuplicateKeyError(error)) throw error;
    }

    const existing = await this.customers.findOne({ userId }, { projection: { _id: 1 } });
    return existing?._id ?? null;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
