import type { Document, ObjectId } from "mongodb";
import type { IncidentSeverity, OrderStatus, PreparationStatus } from "../database/schema.js";

export const RULE_MANAGED_INCIDENT_TYPES = [
  "kitchen_delay",
  "order_delay",
  "kitchen_congestion",
  "inventory_shortage",
  "reservation_conflict",
  "queue_congestion",
  "table_congestion",
] as const;

export type RuleManagedIncidentType = (typeof RULE_MANAGED_INCIDENT_TYPES)[number];

export interface IncidentAffectedEntity {
  type: string;
  id: ObjectId;
}

export interface IncidentCandidate {
  type: RuleManagedIncidentType;
  severity: Exclude<IncidentSeverity, "info">;
  triggerSnapshot: Document;
  affectedEntity: IncidentAffectedEntity;
  rootCause: string;
}

export interface IncidentRecord {
  id: ObjectId;
  restaurantId: ObjectId;
  type: string;
  severity: IncidentSeverity;
  status: string;
  triggerSnapshot: Document;
  affectedEntity: IncidentAffectedEntity;
  rootCause?: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date | null;
  resolutionReason?: string;
}

export interface IncidentListResult {
  incidents: IncidentRecord[];
  truncated: boolean;
}

export interface DetectionOrder {
  id: ObjectId;
  status: OrderStatus;
  createdAt: Date;
  statusTimestamps?: Partial<Record<OrderStatus, Date>>;
}

export interface DetectionOrderItem {
  id: ObjectId;
  orderId: ObjectId;
  preparationStatus: PreparationStatus;
  updatedAt: Date;
}

export interface DetectionInventoryItem {
  id: ObjectId;
  quantity: number;
  lowStockThreshold: number;
  unit: string;
}

export interface DetectionReservation {
  id: ObjectId;
  partySize: number;
  startAt: Date;
  endAt: Date;
  tableId?: ObjectId | null;
  status: string;
}

export interface DetectionTable {
  id: ObjectId;
  capacity: number;
  status: string;
}

export interface DetectionWaitlistEntry {
  id: ObjectId;
  partySize: number;
  status: string;
  createdAt: Date;
}

export interface IncidentDetectionSnapshot {
  restaurantId: ObjectId;
  thresholds: Record<string, unknown>;
  orders: DetectionOrder[];
  orderItems: DetectionOrderItem[];
  inventoryItems: DetectionInventoryItem[];
  reservations: DetectionReservation[];
  tables: DetectionTable[];
  waitlistEntries: DetectionWaitlistEntry[];
  truncatedSources: string[];
}

export interface IncidentEvaluation {
  incidents: IncidentCandidate[];
  nextEvaluationAt: Date | null;
  truncatedSources: string[];
}

export interface IncidentEvaluationSummary extends IncidentEvaluation {
  resolvedCount: number;
  upsertedCount: number;
}

export interface IncidentDetectionRepository {
  listActiveRestaurantIds(): Promise<ObjectId[]>;
  getSnapshot(restaurantId: ObjectId, now: Date): Promise<IncidentDetectionSnapshot>;
  listActiveIncidents(restaurantId: ObjectId): Promise<IncidentListResult>;
  upsertActiveIncident(
    restaurantId: ObjectId,
    incident: IncidentCandidate,
    now: Date,
  ): Promise<void>;
  resolveActiveIncident(restaurantId: ObjectId, incidentId: ObjectId, now: Date): Promise<void>;
  listForRestaurant(restaurantId: ObjectId): Promise<IncidentListResult>;
}

export type IncidentDetectionNotifier = (restaurantId: ObjectId) => void;

export interface IncidentServiceReader {
  listForRestaurant(restaurantId: ObjectId): Promise<IncidentListResult>;
}

export function incidentIdentityKey(
  incident:
    | Pick<IncidentCandidate, "type" | "affectedEntity">
    | Pick<IncidentRecord, "type" | "affectedEntity">,
): string {
  return JSON.stringify([
    incident.type,
    incident.affectedEntity.type,
    incident.affectedEntity.id.toHexString(),
  ]);
}

export function incidentActiveKey(
  restaurantId: ObjectId,
  incident: Pick<IncidentCandidate, "type" | "affectedEntity">,
): string {
  return JSON.stringify([
    restaurantId.toHexString(),
    incident.type,
    incident.affectedEntity.type,
    incident.affectedEntity.id.toHexString(),
  ]);
}
