import type { ObjectId } from "mongodb";

export const TABLE_STATUSES = [
  "available",
  "reserved",
  "occupied",
  "disabled",
  "out_of_service",
] as const;

export type TableOperationalStatus = (typeof TABLE_STATUSES)[number];

export interface TableStatusRecord {
  id: ObjectId;
  tableNumber: string;
  capacity: number;
  zone?: string;
  status: TableOperationalStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface TableStatusUpdateResult {
  table: TableStatusRecord;
  changed: boolean;
}

export const TABLE_LIST_LIMIT = 200;

export interface TableListResult {
  tables: TableStatusRecord[];
  truncated: boolean;
}

export interface TableStatusRepository {
  /** Tenant-scoped floor plan ordered by table number, capped at `limit`. */
  listForRestaurant(restaurantId: ObjectId, limit: number): Promise<TableListResult>;
  updateStatusForRestaurant(
    restaurantId: ObjectId,
    tableId: ObjectId,
    status: TableOperationalStatus,
    now: Date,
  ): Promise<TableStatusUpdateResult | null>;
}

export interface TableStatusServiceReader {
  list(restaurantId: ObjectId): Promise<TableListResult>;
  updateStatus(
    restaurantId: ObjectId,
    tableId: ObjectId,
    status: TableOperationalStatus,
  ): Promise<TableStatusRecord>;
}
