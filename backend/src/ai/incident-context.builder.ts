import { ObjectId, type WithId } from "mongodb";
import type {
  IncidentDocument,
  InventoryItemDocument,
  OrderDocument,
  ReservationDocument,
  RestaurantDocument,
} from "../database/schema.js";
import type { IncidentRecommendationContext } from "./contracts.js";

const SAFE_TRIGGER_FIELDS = new Set([
  "elapsedMinutes",
  "thresholdMinutes",
  "queueLength",
  "activeOrderCount",
  "oldestActiveOrderMinutes",
  "available",
  "lowStockThreshold",
  "partySize",
  "estimatedWaitMinutes",
  "conflictCount",
  "unit",
]);

const ALLOWED_INCIDENT_TYPES = new Set([
  "kitchen_delay",
  "order_delay",
  "kitchen_congestion",
  "inventory_shortage",
  "reservation_conflict",
  "queue_congestion",
  "table_congestion",
  "staff_shortage",
]);

export class RecommendationInputError extends Error {
  constructor(
    readonly statusCode: 400 | 404,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RecommendationInputError";
  }
}

export interface IncidentContextSource {
  findIncident(
    restaurantId: ObjectId,
    incidentId: ObjectId,
  ): Promise<WithId<IncidentDocument> | null>;
  findRestaurant(restaurantId: ObjectId): Promise<WithId<RestaurantDocument> | null>;
  findActiveOrders(restaurantId: ObjectId): Promise<Array<WithId<OrderDocument>>>;
  findLowStockItems(restaurantId: ObjectId): Promise<Array<WithId<InventoryItemDocument>>>;
  findUpcomingReservations(
    restaurantId: ObjectId,
    now: Date,
  ): Promise<Array<WithId<ReservationDocument>>>;
}

function safeTriggerSnapshot(
  snapshot: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (!SAFE_TRIGGER_FIELDS.has(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) safe[key] = value;
    else if (typeof value === "boolean") safe[key] = value;
    else if (typeof value === "string" && value.length <= 120)
      safe[key] = operationalLabel(value, 60);
  }
  return safe;
}

function numericThresholds(thresholds: Record<string, number> | undefined): Record<string, number> {
  const safe: Record<string, number> = {};
  for (const [key, value] of Object.entries(thresholds ?? {})) {
    if (/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key) && Number.isFinite(value)) safe[key] = value;
  }
  return safe;
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
}

function validateSeverity(value: unknown): IncidentDocument["severity"] {
  if (value === "info" || value === "warning" || value === "critical") return value;
  throw new Error("Incident severity is not valid for an AI recommendation.");
}

function operationalLabel(value: string, maxLength: number): string {
  return value
    .replace(/[\r\n]/g, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
    .replace(/\+?\d[\d ().-]{7,}\d/g, "[redacted]")
    .slice(0, maxLength);
}

export class IncidentContextBuilder {
  constructor(private readonly source: IncidentContextSource) {}

  async build(
    restaurantIdText: string,
    incidentIdText: string,
    now = new Date(),
  ): Promise<IncidentRecommendationContext> {
    if (!ObjectId.isValid(restaurantIdText) || !ObjectId.isValid(incidentIdText)) {
      throw new RecommendationInputError(
        400,
        "invalid_incident_reference",
        "A valid incident reference is required.",
      );
    }

    const restaurantId = new ObjectId(restaurantIdText);
    const incidentId = new ObjectId(incidentIdText);
    const incident = await this.source.findIncident(restaurantId, incidentId);
    if (!incident) {
      throw new RecommendationInputError(404, "incident_not_found", "The incident was not found.");
    }

    const [restaurant, orders, lowStockItems, reservations] = await Promise.all([
      this.source.findRestaurant(restaurantId),
      this.source.findActiveOrders(restaurantId),
      this.source.findLowStockItems(restaurantId),
      this.source.findUpcomingReservations(restaurantId, now),
    ]);
    if (!restaurant) {
      throw new RecommendationInputError(
        404,
        "restaurant_not_found",
        "The restaurant was not found.",
      );
    }

    const snapshot = incident.triggerSnapshot as Record<string, unknown>;
    const severity = validateSeverity(incident.severity);
    return {
      incident: {
        type: ALLOWED_INCIDENT_TYPES.has(incident.type) ? incident.type : "unknown",
        severity,
        status: /^[a-z_]{1,32}$/.test(incident.status) ? incident.status : "unknown",
        ageMinutes: minutesBetween(incident.createdAt, now),
        trigger: safeTriggerSnapshot(snapshot),
      },
      restaurant: {
        timezone: restaurant.timezone.slice(0, 64),
        currency: restaurant.currency.slice(0, 8),
        thresholds: numericThresholds(restaurant.thresholds),
      },
      operations: {
        activeOrders: orders.slice(0, 20).map((order) => {
          const startedAt = order.statusTimestamps?.[order.status] ?? order.createdAt;
          return { status: order.status, ageMinutes: minutesBetween(startedAt, now) };
        }),
        lowStockItems: lowStockItems.slice(0, 20).map((item) => ({
          name: operationalLabel(item.name, 80),
          quantity: item.quantity,
          unit: operationalLabel(item.unit, 24),
          lowStockThreshold: item.lowStockThreshold,
        })),
        upcomingReservations: reservations.slice(0, 20).map((reservation) => ({
          partySize: reservation.partySize,
          startsInMinutes: minutesBetween(now, reservation.startAt),
        })),
      },
    };
  }
}
