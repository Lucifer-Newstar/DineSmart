import type { Db, Document, IndexDescription, ObjectId } from "mongodb";

export const COLLECTIONS = {
  users: "users",
  refreshSessions: "refresh_sessions",
  restaurants: "restaurants",
  customers: "customers",
  staff: "staff",
  menuItems: "menu_items",
  orders: "orders",
  orderItems: "order_items",
  reservations: "reservations",
  tables: "tables",
  inventoryItems: "inventory_items",
  incidents: "incidents",
  recommendations: "recommendations",
  notifications: "notifications",
  bills: "bills",
} as const;

export type CollectionName = keyof typeof COLLECTIONS;
export type UserRole = "Customer" | "Reception" | "Kitchen Staff" | "Manager" | "Administrator";
export type OrderStatus =
  | "Created"
  | "Accepted"
  | "Preparing"
  | "Ready"
  | "Served"
  | "Completed"
  | "Cancelled";
export type PreparationStatus = "Created" | "Preparing" | "Ready";
export type IncidentSeverity = "info" | "warning" | "critical";

/** Trim and case-normalize email addresses for the unique login identifier. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

interface TimestampedDocument extends Document {
  _id?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

interface UserBaseDocument extends TimestampedDocument {
  name: string;
  /** The address as entered by the user; normalizedEmail is used for lookups. */
  email: string;
  normalizedEmail: string;
  status: "pending" | "active" | "disabled";
  authProvider?: "email" | "google";
  googleSubject?: string;
  passwordHash?: string;
  emailOtpCodeHash?: string;
  emailOtpExpiresAt?: Date;
  emailOtpResendAt?: Date;
  emailOtpAttempts?: number;
  passwordResetCodeHash?: string;
  passwordResetExpiresAt?: Date;
  passwordResetResendAt?: Date;
  passwordResetAttempts?: number;
  passwordChangedAt?: Date;
}

export interface CustomerUserDocument extends UserBaseDocument {
  role: "Customer";
  /** Customer accounts are global identities and need not belong to a restaurant. */
  restaurantId: ObjectId | null;
}

export interface RestaurantUserDocument extends UserBaseDocument {
  role: Exclude<UserRole, "Customer">;
  restaurantId: ObjectId;
}

export type UserDocument = CustomerUserDocument | RestaurantUserDocument;

export interface RefreshSessionDocument extends TimestampedDocument {
  userId: ObjectId;
  /** SHA-256 hash of the current 256-bit opaque refresh token. */
  tokenHash: string;
  /** Hashes retained to detect replay of any previously rotated token. */
  usedTokenHashes: string[];
  /** Absolute expiry; rotation does not extend the seven-day session lifetime. */
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
}

export interface RestaurantDocument extends TimestampedDocument {
  name: string;
  contact?: Record<string, string>;
  address?: Record<string, string>;
  timezone: string;
  currency: string;
  operatingHours?: Record<string, unknown>;
  thresholds?: Record<string, number>;
  status: string;
}

export interface CustomerDocument extends TimestampedDocument {
  userId?: ObjectId;
  displayName: string;
  email?: string;
  phone?: string;
  contactPreferences?: Record<string, boolean>;
}

export interface StaffDocument extends TimestampedDocument {
  restaurantId: ObjectId;
  userId: ObjectId;
  role: Exclude<UserRole, "Customer">;
  isActive: boolean;
}

export interface MenuItemDocument extends TimestampedDocument {
  restaurantId: ObjectId;
  category: string;
  name: string;
  description?: string;
  /** Integer minor units in the restaurant's configured currency. */
  priceMinor: number;
  isAvailable: boolean;
  dietaryLabels?: string[];
  allergenLabels?: string[];
}

export interface TableDocument extends TimestampedDocument {
  restaurantId: ObjectId;
  tableNumber: string;
  capacity: number;
  zone?: string;
  status: string;
  currentReservationId?: ObjectId | null;
  currentOrderId?: ObjectId | null;
}

export interface ReservationDocument extends TimestampedDocument {
  restaurantId: ObjectId;
  customerId: ObjectId;
  partySize: number;
  startAt: Date;
  endAt: Date;
  tableId?: ObjectId | null;
  status: string;
  notes?: string;
}

export interface OrderDocument extends TimestampedDocument {
  restaurantId: ObjectId;
  customerId: ObjectId;
  reservationId?: ObjectId | null;
  tableId?: ObjectId | null;
  totalMinor: number;
  currency: string;
  status: OrderStatus;
  statusTimestamps?: Partial<Record<OrderStatus, Date>>;
}

export interface OrderItemDocument extends TimestampedDocument {
  restaurantId: ObjectId;
  orderId: ObjectId;
  menuItemId: ObjectId;
  nameSnapshot: string;
  unitPriceMinor: number;
  quantity: number;
  notes?: string;
  preparationStatus: PreparationStatus;
}

export interface InventoryItemDocument extends TimestampedDocument {
  restaurantId: ObjectId;
  name: string;
  quantity: number;
  unit: string;
  lowStockThreshold: number;
  lastAdjustedAt: Date;
}

export interface IncidentDocument extends TimestampedDocument {
  restaurantId: ObjectId;
  type: string;
  severity: IncidentSeverity;
  status: string;
  /** Present only while a rule-managed incident remains active. */
  activeKey?: string;
  triggerSnapshot: Document;
  affectedEntity: { type: string; id: ObjectId };
  rootCause?: string;
  resolvedAt?: Date | null;
  resolutionReason?: string;
}

export interface RecommendationDocument extends TimestampedDocument {
  restaurantId: ObjectId;
  incidentId: ObjectId;
  summary: string;
  rootCause: string;
  priority: IncidentSeverity;
  actions: Array<{ description: string; rationale: string; expectedImpact: string }>;
  confidence: number;
  source: "gemini" | "fallback" | "demo";
  provider: string;
  generatedAt: Date;
}

export interface NotificationDocument extends TimestampedDocument {
  restaurantId: ObjectId;
  recipientUserId: ObjectId;
  type: string;
  title: string;
  body: string;
  relatedEntity?: { type: string; id: ObjectId };
  deliveredAt?: Date | null;
  readAt?: Date | null;
}

export interface BillDocument extends TimestampedDocument {
  restaurantId: ObjectId;
  orderId: ObjectId;
  lineItems: Array<{ nameSnapshot: string; quantity: number; unitPriceMinor: number }>;
  subtotalMinor: number;
  taxMinor: number;
  adjustmentsMinor: number;
  totalMinor: number;
  currency: string;
  status: string;
}

export const COLLECTION_INDEXES: Record<CollectionName, IndexDescription[]> = {
  users: [
    { key: { normalizedEmail: 1 }, name: "users_normalized_email_unique", unique: true },
    {
      key: { googleSubject: 1 },
      name: "users_google_subject_unique",
      unique: true,
      partialFilterExpression: { googleSubject: { $type: "string" } },
    },
    { key: { restaurantId: 1, role: 1, status: 1 }, name: "users_restaurant_role_status" },
  ],
  refreshSessions: [
    { key: { tokenHash: 1 }, name: "refresh_sessions_token_hash_unique", unique: true },
    { key: { usedTokenHashes: 1 }, name: "refresh_sessions_used_token_hashes" },
    { key: { userId: 1, revokedAt: 1, expiresAt: 1 }, name: "refresh_sessions_user_active_expiry" },
    { key: { expiresAt: 1 }, name: "refresh_sessions_expiry_ttl", expireAfterSeconds: 0 },
  ],
  restaurants: [{ key: { status: 1, name: 1 }, name: "restaurants_status_name" }],
  customers: [
    {
      key: { userId: 1 },
      name: "customers_user_unique",
      unique: true,
      partialFilterExpression: { userId: { $type: "objectId" } },
    },
  ],
  staff: [
    { key: { restaurantId: 1, userId: 1 }, name: "staff_restaurant_user_unique", unique: true },
    { key: { restaurantId: 1, isActive: 1, role: 1 }, name: "staff_restaurant_active_role" },
  ],
  menuItems: [
    {
      key: { restaurantId: 1, isAvailable: 1, category: 1, name: 1 },
      name: "menu_items_restaurant_availability_category",
    },
  ],
  orders: [
    {
      key: { restaurantId: 1, status: 1, createdAt: -1 },
      name: "orders_restaurant_status_created",
    },
    { key: { restaurantId: 1, createdAt: -1 }, name: "orders_restaurant_created" },
    { key: { customerId: 1, createdAt: -1 }, name: "orders_customer_created" },
  ],
  orderItems: [{ key: { restaurantId: 1, orderId: 1 }, name: "order_items_restaurant_order" }],
  reservations: [
    {
      key: { restaurantId: 1, startAt: 1, status: 1 },
      name: "reservations_restaurant_start_status",
    },
    {
      key: { restaurantId: 1, tableId: 1, startAt: 1 },
      name: "reservations_restaurant_table_start",
    },
    { key: { customerId: 1, startAt: -1 }, name: "reservations_customer_start" },
  ],
  tables: [
    {
      key: { restaurantId: 1, tableNumber: 1 },
      name: "tables_restaurant_number_unique",
      unique: true,
    },
  ],
  inventoryItems: [
    { key: { restaurantId: 1, name: 1 }, name: "inventory_restaurant_name" },
    { key: { restaurantId: 1, quantity: 1 }, name: "inventory_restaurant_quantity" },
  ],
  incidents: [
    {
      key: { restaurantId: 1, status: 1, createdAt: -1 },
      name: "incidents_restaurant_status_created",
    },
    {
      key: { restaurantId: 1, severity: 1, status: 1 },
      name: "incidents_restaurant_severity_status",
    },
    {
      key: { restaurantId: 1, activeKey: 1 },
      name: "incidents_restaurant_active_key_unique",
      unique: true,
      partialFilterExpression: { activeKey: { $type: "string" } },
    },
  ],
  recommendations: [
    {
      key: { restaurantId: 1, incidentId: 1 },
      name: "recommendations_restaurant_incident_unique",
      unique: true,
    },
  ],
  notifications: [
    {
      key: { restaurantId: 1, recipientUserId: 1, readAt: 1, createdAt: -1 },
      name: "notifications_restaurant_recipient_read_created",
    },
    {
      key: { restaurantId: 1, recipientUserId: 1, createdAt: -1, _id: -1 },
      name: "notifications_restaurant_recipient_created",
    },
    {
      key: { recipientUserId: 1, createdAt: -1, _id: -1 },
      name: "notifications_recipient_created",
    },
  ],
  bills: [
    { key: { restaurantId: 1, orderId: 1 }, name: "bills_restaurant_order_unique", unique: true },
  ],
};

export async function initializeDatabaseSchema(db: Db): Promise<void> {
  for (const collectionName of Object.keys(COLLECTIONS) as CollectionName[]) {
    await db
      .collection(COLLECTIONS[collectionName])
      .createIndexes(COLLECTION_INDEXES[collectionName]);
  }
}
