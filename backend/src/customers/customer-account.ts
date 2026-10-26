import type { Db, ObjectId } from "mongodb";
import { COLLECTIONS, type CustomerDocument, type UserDocument } from "../database/schema.js";
import { MongoCustomerProfileRepository } from "./customer-profile.repository.js";

/**
 * The signed-in customer's own account (S5-02): profile and contact preferences.
 * Phone numbers are deliberately not collected here.
 */

export const ACCOUNT_NAME_MAX_LENGTH = 100;
export const CONTACT_PREFERENCE_KEYS = ["email", "offers"] as const;
export type ContactPreferenceKey = (typeof CONTACT_PREFERENCE_KEYS)[number];
export type ContactPreferences = Record<ContactPreferenceKey, boolean>;

export const DEFAULT_CONTACT_PREFERENCES: Readonly<ContactPreferences> = Object.freeze({
  email: true,
  offers: false,
});

export interface CustomerAccountProfile {
  name: string;
  email: string;
  contactPreferences: ContactPreferences;
  hasPassword: boolean;
}

export interface CustomerAccountChanges {
  name?: string;
  contactPreferences?: Partial<ContactPreferences>;
}

export class AccountError extends Error {
  constructor(
    readonly statusCode: 400 | 401 | 403 | 404 | 409 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AccountError";
  }
}

export function contactPreferencesOf(
  stored: Record<string, boolean> | undefined,
): ContactPreferences {
  return {
    email: stored?.email ?? DEFAULT_CONTACT_PREFERENCES.email,
    offers: stored?.offers ?? DEFAULT_CONTACT_PREFERENCES.offers,
  };
}

/** Accepts a trimmed name and known boolean preferences only. */
export function parseAccountChanges(value: unknown): CustomerAccountChanges | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "name" && key !== "contactPreferences")) return null;
  const changes: CustomerAccountChanges = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string") return null;
    const name = body.name.trim().replace(/\s+/g, " ");
    if (!name || name.length > ACCOUNT_NAME_MAX_LENGTH) return null;
    changes.name = name;
  }
  if (body.contactPreferences !== undefined) {
    const prefs = body.contactPreferences;
    if (typeof prefs !== "object" || prefs === null || Array.isArray(prefs)) return null;
    const entries = Object.entries(prefs as Record<string, unknown>);
    if (
      entries.length === 0 ||
      entries.some(
        ([key, flag]) =>
          !(CONTACT_PREFERENCE_KEYS as readonly string[]).includes(key) ||
          typeof flag !== "boolean",
      )
    ) {
      return null;
    }
    changes.contactPreferences = Object.fromEntries(entries) as Partial<ContactPreferences>;
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

export class MongoCustomerAccountRepository {
  protected readonly users;
  protected readonly customers;
  protected readonly customerProfiles: MongoCustomerProfileRepository;

  constructor(protected readonly db: Db) {
    this.users = db.collection<UserDocument>(COLLECTIONS.users);
    this.customers = db.collection<CustomerDocument>(COLLECTIONS.customers);
    this.customerProfiles = new MongoCustomerProfileRepository(db);
  }

  /** The active customer user and their (created on demand) customer record. */
  protected async owner(userId: ObjectId, now: Date) {
    const user = await this.users.findOne({ _id: userId, role: "Customer", status: "active" });
    if (!user) throw new AccountError(403, "customer_account_required", "Sign in as a customer.");
    const customerId = await this.customerProfiles.getCustomerIdForUser(userId, now);
    if (!customerId) {
      throw new AccountError(403, "customer_account_required", "Sign in as a customer.");
    }
    const customer = await this.customers.findOne({ _id: customerId });
    if (!customer) throw new AccountError(404, "customer_not_found", "The account was not found.");
    return { user, customerId, customer };
  }

  async getProfile(userId: ObjectId, now: Date): Promise<CustomerAccountProfile> {
    const { user, customer } = await this.owner(userId, now);
    return {
      name: user.name,
      email: user.email,
      contactPreferences: contactPreferencesOf(customer.contactPreferences),
      hasPassword: typeof user.passwordHash === "string",
    };
  }

  async updateProfile(
    userId: ObjectId,
    changes: CustomerAccountChanges,
    now: Date,
  ): Promise<CustomerAccountProfile> {
    const { customerId, customer } = await this.owner(userId, now);
    if (changes.name !== undefined) {
      await this.users.updateOne({ _id: userId }, { $set: { name: changes.name, updatedAt: now } });
    }
    const customerSet: Record<string, unknown> = { updatedAt: now };
    if (changes.name !== undefined) customerSet.displayName = changes.name;
    if (changes.contactPreferences) {
      customerSet.contactPreferences = {
        ...contactPreferencesOf(customer.contactPreferences),
        ...changes.contactPreferences,
      };
    }
    await this.customers.updateOne({ _id: customerId }, { $set: customerSet });
    return this.getProfile(userId, now);
  }
}

export function accountProfileToJson(profile: CustomerAccountProfile) {
  return {
    name: profile.name,
    email: profile.email,
    contactPreferences: profile.contactPreferences,
    hasPassword: profile.hasPassword,
  };
}
