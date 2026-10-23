import { type Db, ObjectId, type WithId } from "mongodb";
import {
  COLLECTIONS,
  normalizeEmail,
  type RestaurantDocument,
  type StaffDocument,
  type UserDocument,
  type UserRole,
} from "./schema.js";

/**
 * First-run onboarding for a real deployment: creates a restaurant and its first
 * restaurant-scoped account, or adds a staff account to an existing restaurant.
 * The API has no public endpoint for either (see the API specification), so a
 * deploy is bootstrapped from the command line against the production database.
 */
export type StaffRole = Exclude<UserRole, "Customer">;
export const STAFF_ROLES: readonly StaffRole[] = [
  "Administrator",
  "Manager",
  "Reception",
  "Kitchen Staff",
];

export class BootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BootstrapError";
  }
}

export interface StaffAccountInput {
  name: string;
  email: string;
  role: StaffRole;
  passwordHash: string;
}

export interface RestaurantInput {
  name: string;
  timezone?: string;
  currency?: string;
}

export const DEFAULT_THRESHOLDS = {
  kitchenDelayWarningMinutes: 15,
  kitchenDelayCriticalMinutes: 25,
  orderDelayWarningMinutes: 20,
  orderDelayCriticalMinutes: 30,
  lowStockDefault: 5,
} as const;

function cleanName(value: string, label: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || Array.from(trimmed).length > 120) {
    throw new BootstrapError(`${label} is required (at most 120 characters).`);
  }
  return trimmed;
}

function cleanEmail(value: string): { email: string; normalizedEmail: string } {
  const email = typeof value === "string" ? value.trim() : "";
  const normalizedEmail = normalizeEmail(email);
  if (
    !normalizedEmail.includes("@") ||
    /\s/.test(normalizedEmail) ||
    normalizedEmail.length > 320
  ) {
    throw new BootstrapError("A valid email address is required.");
  }
  return { email, normalizedEmail };
}

export function parseStaffRole(value: unknown): StaffRole {
  const match = STAFF_ROLES.find(
    (role) => typeof value === "string" && role.toLowerCase() === value.trim().toLowerCase(),
  );
  if (!match) throw new BootstrapError(`Role must be one of: ${STAFF_ROLES.join(", ")}.`);
  return match;
}

export function buildRestaurant(input: RestaurantInput, now: Date): WithId<RestaurantDocument> {
  const currency = (input.currency ?? "INR").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new BootstrapError("Currency must be a three-letter ISO code, e.g. INR.");
  }
  const timezone = (input.timezone ?? "Asia/Kolkata").trim();
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    throw new BootstrapError(`Unknown time zone "${timezone}".`);
  }
  return {
    _id: new ObjectId(),
    name: cleanName(input.name, "Restaurant name"),
    timezone,
    currency,
    thresholds: { ...DEFAULT_THRESHOLDS },
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

export function buildStaffAccount(
  restaurantId: ObjectId,
  input: StaffAccountInput,
  now: Date,
): { user: WithId<UserDocument>; staff: WithId<StaffDocument> } {
  const userId = new ObjectId();
  const { email, normalizedEmail } = cleanEmail(input.email);
  const role = parseStaffRole(input.role);
  const user = {
    _id: userId,
    name: cleanName(input.name, "Name"),
    email,
    normalizedEmail,
    role,
    restaurantId,
    status: "active",
    authProvider: "email",
    passwordHash: input.passwordHash,
    createdAt: now,
    updatedAt: now,
  } as WithId<UserDocument>;
  const staff: WithId<StaffDocument> = {
    _id: userId,
    restaurantId,
    userId,
    role,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  return { user, staff };
}

async function assertEmailAvailable(db: Db, normalizedEmail: string): Promise<void> {
  const existing = await db
    .collection<UserDocument>(COLLECTIONS.users)
    .findOne({ normalizedEmail }, { projection: { _id: 1 } });
  if (existing) throw new BootstrapError("An account with that email already exists.");
}

export async function addStaffAccount(
  db: Db,
  restaurantId: ObjectId,
  input: StaffAccountInput,
  now = new Date(),
): Promise<WithId<UserDocument>> {
  const restaurant = await db
    .collection<RestaurantDocument>(COLLECTIONS.restaurants)
    .findOne({ _id: restaurantId }, { projection: { _id: 1 } });
  if (!restaurant) throw new BootstrapError("No restaurant exists with that ID.");

  const { user, staff } = buildStaffAccount(restaurantId, input, now);
  await assertEmailAvailable(db, user.normalizedEmail);
  await db.collection<UserDocument>(COLLECTIONS.users).insertOne(user);
  try {
    await db.collection<StaffDocument>(COLLECTIONS.staff).insertOne(staff);
  } catch (error) {
    await db.collection<UserDocument>(COLLECTIONS.users).deleteOne({ _id: user._id });
    throw error;
  }
  return user;
}

export async function bootstrapRestaurant(
  db: Db,
  restaurantInput: RestaurantInput,
  admin: StaffAccountInput,
  now = new Date(),
): Promise<{ restaurant: WithId<RestaurantDocument>; admin: WithId<UserDocument> }> {
  const restaurant = buildRestaurant(restaurantInput, now);
  // Validate the account before writing anything.
  const { normalizedEmail } = cleanEmail(admin.email);
  parseStaffRole(admin.role);
  cleanName(admin.name, "Name");
  await assertEmailAvailable(db, normalizedEmail);

  await db.collection<RestaurantDocument>(COLLECTIONS.restaurants).insertOne(restaurant);
  try {
    const created = await addStaffAccount(db, restaurant._id, admin, now);
    return { restaurant, admin: created };
  } catch (error) {
    await db.collection<RestaurantDocument>(COLLECTIONS.restaurants).deleteOne({
      _id: restaurant._id,
    });
    throw error;
  }
}
