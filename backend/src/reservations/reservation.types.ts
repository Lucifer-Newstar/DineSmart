import type { ObjectId } from "mongodb";
import type { GuestOutcome, GuestProfileSummary } from "../customers/guest-profile.repository.js";

export const RESERVATION_OCCASIONS = [
  "birthday",
  "anniversary",
  "date",
  "business",
  "celebration",
  "other",
] as const;

export type ReservationOccasion = (typeof RESERVATION_OCCASIONS)[number];

/** Optional guest context on a booking (S5-01). Null clears a field on update. */
export interface ReservationGuestDetails {
  occasion?: ReservationOccasion | null;
  dietaryNotes?: string | null;
}

export type ReservationStatus =
  | "Awaiting"
  | "Confirmed"
  | "Arrived"
  | "Seated"
  | "Completed"
  | "Cancelled"
  | "NoShow";

export interface ReservationRecord {
  id: ObjectId;
  restaurantId: ObjectId;
  restaurantName: string;
  guestName: string;
  partySize: number;
  startAt: Date;
  endAt: Date;
  tableId: ObjectId | null;
  tableNumber: string | null;
  status: string;
  notes?: string;
  occasion?: ReservationOccasion | null;
  dietaryNotes?: string | null;
  arrivedAt?: Date | null;
  seatedAt?: Date | null;
  /** Staff reads only (S5-02): who booked and what this restaurant knows about them. */
  customerId?: ObjectId;
  guestProfile?: GuestProfileSummary;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReservationListResult {
  reservations: ReservationRecord[];
  truncated: boolean;
}

export interface ReservationSchedule {
  timeZone: string;
  operatingHours?: Record<string, unknown>;
  /** Stored booking rules; `resolveBookingRules` supplies defaults when absent. */
  bookingRules?: unknown;
}

/** Answers whether some table can still seat the party for the whole turn (S5-01). */
export type ReservationSlotGuard = (request: {
  restaurantId: ObjectId;
  partySize: number;
  startAt: Date;
  endAt: Date;
  excludingReservationId?: ObjectId;
}) => Promise<boolean>;

export interface NewReservation {
  restaurantId: ObjectId;
  customerId: ObjectId;
  partySize: number;
  startAt: Date;
  endAt: Date;
  tableId: ObjectId | null;
  status: ReservationStatus;
  notes?: string;
  occasion?: ReservationOccasion;
  dietaryNotes?: string;
}

export interface ReservationChanges {
  status?: ReservationStatus;
  tableId?: ObjectId | null;
  partySize?: number;
  startAt?: Date;
  endAt?: Date;
  notes?: string;
  occasion?: ReservationOccasion | null;
  dietaryNotes?: string | null;
  arrivedAt?: Date;
  seatedAt?: Date;
}

export interface ReservationRepository {
  getCustomerIdForUser(userId: ObjectId, now: Date): Promise<ObjectId | null>;
  getActiveRestaurant(restaurantId: ObjectId): Promise<ReservationSchedule | null>;
  customerExists(customerId: ObjectId): Promise<boolean>;
  getTable(
    restaurantId: ObjectId,
    tableId: ObjectId,
  ): Promise<{ capacity: number; status: string; tableNumber: string } | null>;
  hasTableConflict(
    restaurantId: ObjectId,
    tableId: ObjectId,
    startAt: Date,
    endAt: Date,
    excludingReservationId?: ObjectId,
  ): Promise<boolean>;
  createReservation(reservation: NewReservation, now: Date): Promise<ReservationRecord>;
  listForRestaurant(restaurantId: ObjectId): Promise<ReservationListResult>;
  listForCustomer(customerId: ObjectId): Promise<ReservationListResult>;
  findForRestaurant(
    reservationId: ObjectId,
    restaurantId: ObjectId,
  ): Promise<ReservationRecord | null>;
  findForCustomer(reservationId: ObjectId, customerId: ObjectId): Promise<ReservationRecord | null>;
  updateForRestaurant(
    reservationId: ObjectId,
    restaurantId: ObjectId,
    expectedUpdatedAt: Date,
    changes: ReservationChanges,
    now: Date,
  ): Promise<ReservationRecord | null>;
  updateForCustomer(
    reservationId: ObjectId,
    customerId: ObjectId,
    expectedUpdatedAt: Date,
    changes: ReservationChanges,
    now: Date,
  ): Promise<ReservationRecord | null>;
  /**
   * Occupies a table for a seated booking, or frees it (reservationId null) when the
   * visit completes. Freeing only applies while `releasingReservationId` still holds it.
   * Returns whether the table changed. Optional so read-only fakes need not implement it.
   */
  setTableOccupancy?(
    restaurantId: ObjectId,
    tableId: ObjectId,
    reservationId: ObjectId | null,
    now: Date,
    releasingReservationId?: ObjectId,
  ): Promise<boolean>;
  /** Adds a seated visit or a no-show to the booking guest's profile (S5-02). */
  recordGuestOutcome?(
    restaurantId: ObjectId,
    reservationId: ObjectId,
    outcome: GuestOutcome,
    at: Date,
  ): Promise<void>;
}

export interface CustomerReservationRequest extends ReservationGuestDetails {
  userId: ObjectId;
  restaurantId: ObjectId;
  partySize: number;
  startAt: Date;
  notes?: string;
}

export interface StaffReservationRequest extends ReservationGuestDetails {
  restaurantId: ObjectId;
  customerId: ObjectId;
  partySize: number;
  startAt: Date;
  tableId?: ObjectId | null;
  notes?: string;
}

export interface CustomerReservationUpdate extends ReservationGuestDetails {
  userId: ObjectId;
  reservationId: ObjectId;
  /** Cancel; cannot be combined with other changes. */
  status?: "Cancelled";
  startAt?: Date;
  partySize?: number;
  notes?: string;
}

export interface StaffReservationUpdate {
  restaurantId: ObjectId;
  reservationId: ObjectId;
  changes: ReservationChanges;
}

export interface ReservationServiceReader {
  listForCustomer(userId: ObjectId): Promise<ReservationListResult>;
  listForRestaurant(restaurantId: ObjectId): Promise<ReservationListResult>;
  createForCustomer(request: CustomerReservationRequest): Promise<ReservationRecord>;
  createForStaff(request: StaffReservationRequest): Promise<ReservationRecord>;
  updateForCustomer(request: CustomerReservationUpdate): Promise<ReservationRecord>;
  updateForStaff(request: StaffReservationUpdate): Promise<ReservationRecord>;
}
