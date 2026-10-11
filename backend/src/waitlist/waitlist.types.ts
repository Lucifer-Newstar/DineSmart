import type { ObjectId } from "mongodb";
import type { WaitlistStatus } from "../database/schema.js";

export const WAITLIST_LIST_LIMIT = 200;
export const WAITLIST_MAX_PARTY_SIZE = 12;
export const WAITLIST_GUEST_NAME_MAX_LENGTH = 100;
export const WAITLIST_PHONE_MAX_LENGTH = 20;
export const WAITLIST_NOTES_MAX_LENGTH = 500;

export interface WaitlistCreateInput {
  guestName: string;
  partySize: number;
  phone?: string;
  notes?: string;
}

export type WaitlistResolutionStatus = Extract<WaitlistStatus, "seated" | "cancelled" | "no_show">;

export interface WaitlistResolution {
  status: WaitlistResolutionStatus;
  tableId?: ObjectId;
}

export interface WaitlistRecord {
  id: ObjectId;
  restaurantId: ObjectId;
  guestName: string;
  partySize: number;
  phone?: string;
  notes?: string;
  status: WaitlistStatus;
  tableId?: ObjectId;
  seatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WaitlistListResult {
  entries: WaitlistRecord[];
  truncated: boolean;
}

export interface WaitlistRepository {
  listWaitingForRestaurant(restaurantId: ObjectId): Promise<WaitlistListResult>;
  addForRestaurant(
    restaurantId: ObjectId,
    input: WaitlistCreateInput,
    now: Date,
  ): Promise<WaitlistRecord>;
  resolveWaitingForRestaurant(
    restaurantId: ObjectId,
    entryId: ObjectId,
    resolution: WaitlistResolution,
    now: Date,
  ): Promise<WaitlistRecord | null>;
}

export interface WaitlistServiceReader {
  list(restaurantId: ObjectId): Promise<WaitlistListResult>;
  add(restaurantId: ObjectId, input: WaitlistCreateInput): Promise<WaitlistRecord>;
  resolve(
    restaurantId: ObjectId,
    entryId: ObjectId,
    resolution: WaitlistResolution,
  ): Promise<WaitlistRecord>;
}
