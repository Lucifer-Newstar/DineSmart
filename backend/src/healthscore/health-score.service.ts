import type { ObjectId } from "mongodb";
import {
  HEALTH_SCORE_WEIGHTS,
  type HealthScoreComponent,
  type HealthScoreComponents,
  type HealthScoreIncident,
  type HealthScoreOrder,
  type HealthScoreRepository,
  type HealthScoreResult,
  type HealthScoreSnapshot,
} from "./health-score.types.js";

const DAY_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_KITCHEN_WARNING_MINUTES = 15;
const DEFAULT_KITCHEN_CRITICAL_MINUTES = 25;
const DEFAULT_ORDER_WARNING_MINUTES = 20;
const RESERVATION_SUCCESS_STATUSES = new Set(["seated", "completed"]);
const RESERVATION_NO_SHOW_STATUSES = new Set(["no_show", "no-show", "noshow"]);
const ORDER_COMPLETED_STATUSES = new Set(["served", "completed"]);
const ORDER_CANCELLED_STATUSES = new Set(["cancelled", "canceled"]);
const EXCLUDED_TABLE_STATUSES = new Set(["disabled", "out_of_service", "out-of-service"]);

export const HEALTH_SCORE_RECORD_LIMIT = 2_000;

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizedStatus(value: string): string {
  return value.trim().toLowerCase().replaceAll(" ", "_");
}

function configuredThreshold(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function inWindow(date: Date, from: Date, until: Date): boolean {
  return date >= from && date <= until;
}

function makeComponent(
  score: number,
  weight: number,
  observations: number,
  detail: string,
  emptyScore = 50,
): HealthScoreComponent {
  const hasObservations = observations > 0;
  return {
    score: roundToOneDecimal(hasObservations ? clamp(score) : emptyScore),
    weight,
    observations,
    status: hasObservations ? "observed" : "insufficient_data",
    detail: hasObservations
      ? detail
      : `No eligible observations; using neutral score ${emptyScore}.`,
  };
}

function kitchenEfficiency(
  snapshot: HealthScoreSnapshot,
  from: Date,
  until: Date,
): HealthScoreComponent {
  const warningMinutes = configuredThreshold(
    snapshot.thresholds.kitchenDelayWarningMinutes,
    DEFAULT_KITCHEN_WARNING_MINUTES,
  );
  const configuredCritical = configuredThreshold(
    snapshot.thresholds.kitchenDelayCriticalMinutes,
    DEFAULT_KITCHEN_CRITICAL_MINUTES,
  );
  const criticalMinutes =
    configuredCritical > warningMinutes ? configuredCritical : warningMinutes + 1;
  const durations = snapshot.orders.flatMap((order) => {
    const preparingAt = order.statusTimestamps?.Preparing;
    const readyAt = order.statusTimestamps?.Ready;
    if (
      !validDate(preparingAt) ||
      !validDate(readyAt) ||
      !inWindow(readyAt, from, until) ||
      readyAt < preparingAt
    ) {
      return [];
    }
    return [(readyAt.getTime() - preparingAt.getTime()) / 60_000];
  });

  if (durations.length === 0) {
    return makeComponent(
      50,
      HEALTH_SCORE_WEIGHTS.kitchenEfficiency,
      0,
      "No completed prep durations.",
    );
  }

  const averageMinutes = durations.reduce((total, value) => total + value, 0) / durations.length;
  const score =
    averageMinutes <= warningMinutes
      ? 100
      : 100 - ((averageMinutes - warningMinutes) / (criticalMinutes - warningMinutes)) * 100;
  return makeComponent(
    score,
    HEALTH_SCORE_WEIGHTS.kitchenEfficiency,
    durations.length,
    `Average completed prep time ${roundToOneDecimal(averageMinutes)} min; target ${warningMinutes} min, critical ${criticalMinutes} min.`,
  );
}

function inventoryHealth(snapshot: HealthScoreSnapshot): HealthScoreComponent {
  const validItems = snapshot.inventoryItems.filter(
    (item) =>
      Number.isFinite(item.quantity) &&
      Number.isFinite(item.lowStockThreshold) &&
      item.lowStockThreshold >= 0,
  );
  if (validItems.length === 0) {
    return makeComponent(
      50,
      HEALTH_SCORE_WEIGHTS.inventoryHealth,
      0,
      "No inventory items available.",
    );
  }

  const healthyItems = validItems.filter((item) => item.quantity > item.lowStockThreshold).length;
  return makeComponent(
    (healthyItems / validItems.length) * 100,
    HEALTH_SCORE_WEIGHTS.inventoryHealth,
    validItems.length,
    `${healthyItems} of ${validItems.length} observed items are above their low-stock threshold.`,
  );
}

function orderCompletionRate(
  snapshot: HealthScoreSnapshot,
  from: Date,
  until: Date,
): HealthScoreComponent {
  const warningMinutes = configuredThreshold(
    snapshot.thresholds.orderDelayWarningMinutes,
    DEFAULT_ORDER_WARNING_MINUTES,
  );
  const matureBefore = until.getTime() - warningMinutes * 60_000;
  const eligibleOrders = snapshot.orders.filter((order: HealthScoreOrder) => {
    if (!validDate(order.createdAt) || !inWindow(order.createdAt, from, until)) return false;
    const status = normalizedStatus(order.status);
    if (ORDER_CANCELLED_STATUSES.has(status)) return false;
    return ORDER_COMPLETED_STATUSES.has(status) || order.createdAt.getTime() <= matureBefore;
  });

  if (eligibleOrders.length === 0) {
    return makeComponent(
      50,
      HEALTH_SCORE_WEIGHTS.orderCompletionRate,
      0,
      "No mature non-cancelled orders.",
    );
  }

  const completedCount = eligibleOrders.filter((order) =>
    ORDER_COMPLETED_STATUSES.has(normalizedStatus(order.status)),
  ).length;
  return makeComponent(
    (completedCount / eligibleOrders.length) * 100,
    HEALTH_SCORE_WEIGHTS.orderCompletionRate,
    eligibleOrders.length,
    `${completedCount} of ${eligibleOrders.length} mature non-cancelled orders are served or completed.`,
  );
}

function reservationEfficiency(
  snapshot: HealthScoreSnapshot,
  from: Date,
  until: Date,
): HealthScoreComponent {
  const outcomes = snapshot.reservations.filter((reservation) => {
    if (!validDate(reservation.startAt) || !validDate(reservation.endAt)) return false;
    if (!inWindow(reservation.startAt, from, until) || reservation.endAt > until) return false;
    const status = normalizedStatus(reservation.status);
    return RESERVATION_SUCCESS_STATUSES.has(status) || RESERVATION_NO_SHOW_STATUSES.has(status);
  });

  if (outcomes.length === 0) {
    return makeComponent(
      50,
      HEALTH_SCORE_WEIGHTS.reservationEfficiency,
      0,
      "No ended reservations with a recorded seating or no-show outcome.",
    );
  }

  const seatedCount = outcomes.filter((reservation) =>
    RESERVATION_SUCCESS_STATUSES.has(normalizedStatus(reservation.status)),
  ).length;
  return makeComponent(
    (seatedCount / outcomes.length) * 100,
    HEALTH_SCORE_WEIGHTS.reservationEfficiency,
    outcomes.length,
    `${seatedCount} of ${outcomes.length} ended reservations were seated or completed; cancellations and unrecorded outcomes are excluded.`,
  );
}

function tableUtilization(snapshot: HealthScoreSnapshot): HealthScoreComponent {
  const activeTables = snapshot.tables.filter(
    (table) => !EXCLUDED_TABLE_STATUSES.has(normalizedStatus(table.status)),
  );
  if (activeTables.length === 0) {
    return makeComponent(
      50,
      HEALTH_SCORE_WEIGHTS.tableUtilization,
      0,
      "No active tables available.",
    );
  }

  const occupiedTables = activeTables.filter(
    (table) => normalizedStatus(table.status) === "occupied",
  ).length;
  return makeComponent(
    (occupiedTables / activeTables.length) * 100,
    HEALTH_SCORE_WEIGHTS.tableUtilization,
    activeTables.length,
    `${occupiedTables} of ${activeTables.length} active tables are occupied at calculation time.`,
  );
}

function isOpenIncident(incident: HealthScoreIncident, from: Date, until: Date): boolean {
  if (!validDate(incident.createdAt) || !inWindow(incident.createdAt, from, until)) return false;
  return ["open", "active"].includes(normalizedStatus(incident.status));
}

function incidentFrequency(
  snapshot: HealthScoreSnapshot,
  from: Date,
  until: Date,
): HealthScoreComponent {
  const activeIncidents = snapshot.incidents.filter((incident) =>
    isOpenIncident(incident, from, until),
  );
  const penalty = activeIncidents.reduce((total, incident) => {
    switch (incident.severity) {
      case "critical":
        return total + 35;
      case "warning":
        return total + 15;
      case "info":
        return total + 5;
      default:
        return total;
    }
  }, 0);

  // A successful empty query is meaningful here: no incidents in the window scores 100.
  return {
    score: roundToOneDecimal(clamp(100 - penalty)),
    weight: HEALTH_SCORE_WEIGHTS.incidentFrequency,
    observations: Math.max(1, activeIncidents.length),
    status: "observed",
    detail: `${activeIncidents.length} open incidents in the window; severity penalties are 35/15/5 points for critical/warning/info.`,
  };
}

export function calculateHealthScore(
  snapshot: HealthScoreSnapshot,
  calculatedAt: Date,
): HealthScoreResult {
  const windowStart = new Date(calculatedAt.getTime() - DAY_MS);
  const components: HealthScoreComponents = {
    kitchenEfficiency: kitchenEfficiency(snapshot, windowStart, calculatedAt),
    inventoryHealth: inventoryHealth(snapshot),
    orderCompletionRate: orderCompletionRate(snapshot, windowStart, calculatedAt),
    reservationEfficiency: reservationEfficiency(snapshot, windowStart, calculatedAt),
    tableUtilization: tableUtilization(snapshot),
    incidentFrequency: incidentFrequency(snapshot, windowStart, calculatedAt),
  };
  const weightedScore = Object.entries(components).reduce(
    (total, [key, component]) =>
      total + component.score * HEALTH_SCORE_WEIGHTS[key as keyof typeof HEALTH_SCORE_WEIGHTS],
    0,
  );

  return {
    score: Math.round(weightedScore / 100),
    calculatedAt: calculatedAt.toISOString(),
    windowStart: windowStart.toISOString(),
    windowEnd: calculatedAt.toISOString(),
    components,
    sampling: {
      perCollectionLimit: HEALTH_SCORE_RECORD_LIMIT,
      truncatedCollections: [...snapshot.truncatedCollections],
    },
  };
}

export class HealthScoreService {
  constructor(
    private readonly repository: HealthScoreRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async getScore(restaurantId: ObjectId): Promise<HealthScoreResult> {
    const until = this.clock();
    const from = new Date(until.getTime() - DAY_MS);
    const snapshot = await this.repository.getSnapshot(restaurantId, from, until);
    return calculateHealthScore(snapshot, until);
  }
}
