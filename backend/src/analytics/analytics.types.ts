import type { ObjectId } from "mongodb";
import type { OrderStatus } from "../database/schema.js";

export const ANALYTICS_RECORD_LIMIT = 2_000;
export const ANALYTICS_RANGES = ["7d", "30d"] as const;

export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export interface AnalyticsOrder {
  status: OrderStatus | string;
  createdAt: Date;
  statusTimestamps?: Partial<Record<OrderStatus, Date>>;
}

export interface AnalyticsReservation {
  status: string;
  startAt: Date;
}

export interface AnalyticsInventoryItem {
  quantity: number;
  lowStockThreshold: number;
}

export interface AnalyticsSnapshot {
  orders: AnalyticsOrder[];
  reservations: AnalyticsReservation[];
  inventoryItems: AnalyticsInventoryItem[];
  truncatedCollections: string[];
}

export interface AnalyticsRepository {
  getRestaurantTimeZone(restaurantId: ObjectId): Promise<string | null>;
  getSnapshot(restaurantId: ObjectId, from: Date, until: Date): Promise<AnalyticsSnapshot>;
}

export interface AnalyticsDailyPoint {
  date: string;
  ordersPlaced: number;
  reservationsScheduled: number;
}

export interface AnalyticsHourlyPoint {
  hour: number;
  ordersPlaced: number;
}

export interface AnalyticsResult {
  range: AnalyticsRange;
  period: {
    startAt: string;
    endAt: string;
    timeZone: string;
  };
  generatedAt: string;
  summary: {
    ordersPlaced: number;
    ordersFulfilled: number;
    ordersCancelled: number;
    ordersInProgress: number;
    averagePrepMinutes: number | null;
    averagePrepObservations: number;
    reservationsScheduled: number;
    reservationsConfirmed: number;
    reservationsSeated: number;
    reservationsCompleted: number;
    reservationsNoShow: number;
    inventoryItems: number;
    lowStockItems: number;
    outOfStockItems: number;
  };
  daily: AnalyticsDailyPoint[];
  hourly: AnalyticsHourlyPoint[];
  sampling: {
    perCollectionLimit: number;
    truncatedCollections: string[];
  };
}

export interface AnalyticsServiceReader {
  getAnalytics(restaurantId: ObjectId, range: AnalyticsRange): Promise<AnalyticsResult>;
}
