import type { ObjectId } from "mongodb";

export type ReservationStatus =
  | "Awaiting"
  | "Confirmed"
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
}

export interface ReservationChanges {
  status?: ReservationStatus;
  tableId?: ObjectId | null;
  partySize?: number;
  startAt?: Date;
  endAt?: Date;
  notes?: string;
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
}

export interface CustomerReservationRequest {
  userId: ObjectId;
  restaurantId: ObjectId;
  partySize: number;
  startAt: Date;
  notes?: string;
}

export interface StaffReservationRequest {
  restaurantId: ObjectId;
  customerId: ObjectId;
  partySize: number;
  startAt: Date;
  tableId?: ObjectId | null;
  notes?: string;
}

export interface CustomerReservationUpdate {
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
