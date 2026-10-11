import type { ObjectId } from "mongodb";
import type {
  IncidentDocument,
  InventoryItemDocument,
  OrderDocument,
  ReservationDocument,
  TableDocument,
} from "../database/schema.js";

export const HEALTH_SCORE_WEIGHTS = {
  kitchenEfficiency: 25,
  inventoryHealth: 20,
  orderCompletionRate: 20,
  reservationEfficiency: 15,
  tableUtilization: 10,
  incidentFrequency: 10,
} as const;

export type HealthScoreComponentName = keyof typeof HEALTH_SCORE_WEIGHTS;
export type HealthScoreComponentStatus = "observed" | "insufficient_data";

export interface HealthScoreComponent {
  score: number;
  weight: number;
  observations: number;
  status: HealthScoreComponentStatus;
  detail: string;
}

export type HealthScoreComponents = Record<HealthScoreComponentName, HealthScoreComponent>;

export interface HealthScoreOrder {
  status: OrderDocument["status"] | string;
  createdAt: Date;
  statusTimestamps?: OrderDocument["statusTimestamps"];
}

export type HealthScoreInventoryItem = Pick<
  InventoryItemDocument,
  "quantity" | "lowStockThreshold"
>;
export type HealthScoreReservation = Pick<ReservationDocument, "status" | "startAt" | "endAt">;
export type HealthScoreTable = Pick<TableDocument, "status">;
export type HealthScoreIncident = Pick<IncidentDocument, "status" | "severity" | "createdAt">;

export interface HealthScoreThresholds {
  kitchenDelayWarningMinutes?: number;
  kitchenDelayCriticalMinutes?: number;
  orderDelayWarningMinutes?: number;
}

export interface HealthScoreSnapshot {
  orders: HealthScoreOrder[];
  inventoryItems: HealthScoreInventoryItem[];
  reservations: HealthScoreReservation[];
  tables: HealthScoreTable[];
  incidents: HealthScoreIncident[];
  thresholds: HealthScoreThresholds;
  truncatedCollections: string[];
}

export interface HealthScoreRepository {
  getSnapshot(restaurantId: ObjectId, from: Date, until: Date): Promise<HealthScoreSnapshot>;
  listActiveRestaurantIds(): Promise<ObjectId[]>;
}

/** Event hook for operational write services to invalidate and refresh a tenant score. */
export type HealthScoreRefreshNotifier = (restaurantId: ObjectId) => void;

export interface HealthScoreResult {
  score: number;
  calculatedAt: string;
  windowStart: string;
  windowEnd: string;
  components: HealthScoreComponents;
  sampling: {
    perCollectionLimit: number;
    truncatedCollections: string[];
  };
}
