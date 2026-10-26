import type { IncidentSeverity } from "../database/schema.js";
import type {
  DetectionOrder,
  DetectionReservation,
  IncidentCandidate,
  IncidentDetectionSnapshot,
  IncidentEvaluation,
  RuleManagedIncidentType,
} from "./incident.types.js";
import { incidentIdentityKey } from "./incident.types.js";

export const DEFAULT_INCIDENT_THRESHOLDS = {
  kitchenDelayWarningMinutes: 15,
  kitchenDelayCriticalMinutes: 25,
  orderDelayWarningMinutes: 20,
  orderDelayCriticalMinutes: 30,
  kitchenCongestionWarningOrders: 8,
  kitchenCongestionCriticalOrders: 12,
  kitchenCongestionOldestCriticalMinutes: 30,
  queueCongestionWarningParties: 4,
  queueCongestionCriticalParties: 7,
  queueCongestionWarningWaitMinutes: 25,
  queueCongestionCriticalWaitMinutes: 45,
} as const;

const ACTIVE_KITCHEN_STATUSES = new Set(["Accepted", "Preparing", "Ready"]);
const ORDER_DELAY_STATUSES = new Set(["Accepted", "Preparing"]);
const ACTIVE_RESERVATION_STATUSES = new Set(["Confirmed", "Arrived", "Seated"]);
const DISABLED_TABLE_STATUSES = new Set(["disabled", "out_of_service"]);
const SEVERITY_RANK: Record<IncidentSeverity, number> = { info: 0, warning: 1, critical: 2 };
const MINUTE_MS = 60_000;

interface NormalizedThresholds {
  kitchenDelayWarningMinutes: number;
  kitchenDelayCriticalMinutes: number;
  orderDelayWarningMinutes: number;
  orderDelayCriticalMinutes: number;
  kitchenCongestionWarningOrders: number;
  kitchenCongestionCriticalOrders: number;
  kitchenCongestionOldestCriticalMinutes: number;
  queueCongestionWarningParties: number;
  queueCongestionCriticalParties: number;
  queueCongestionWarningWaitMinutes: number;
  queueCongestionCriticalWaitMinutes: number;
}

function positiveNumber(value: unknown, fallback: number, integer = false): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    (integer && !Number.isInteger(value))
  ) {
    return fallback;
  }
  return value;
}

function thresholdPair(
  configured: Record<string, unknown>,
  warningName: keyof typeof DEFAULT_INCIDENT_THRESHOLDS,
  criticalName: keyof typeof DEFAULT_INCIDENT_THRESHOLDS,
  integer = false,
): [number, number] {
  const defaultWarning = DEFAULT_INCIDENT_THRESHOLDS[warningName];
  const defaultCritical = DEFAULT_INCIDENT_THRESHOLDS[criticalName];
  const warning = positiveNumber(configured[warningName], defaultWarning, integer);
  const critical = positiveNumber(configured[criticalName], defaultCritical, integer);
  return critical > warning ? [warning, critical] : [defaultWarning, defaultCritical];
}

export function normalizeIncidentThresholds(value: Record<string, unknown>): NormalizedThresholds {
  const [kitchenDelayWarningMinutes, kitchenDelayCriticalMinutes] = thresholdPair(
    value,
    "kitchenDelayWarningMinutes",
    "kitchenDelayCriticalMinutes",
  );
  const [orderDelayWarningMinutes, orderDelayCriticalMinutes] = thresholdPair(
    value,
    "orderDelayWarningMinutes",
    "orderDelayCriticalMinutes",
  );
  const [kitchenCongestionWarningOrders, kitchenCongestionCriticalOrders] = thresholdPair(
    value,
    "kitchenCongestionWarningOrders",
    "kitchenCongestionCriticalOrders",
    true,
  );
  return {
    kitchenDelayWarningMinutes,
    kitchenDelayCriticalMinutes,
    orderDelayWarningMinutes,
    orderDelayCriticalMinutes,
    kitchenCongestionWarningOrders,
    kitchenCongestionCriticalOrders,
    kitchenCongestionOldestCriticalMinutes: positiveNumber(
      value.kitchenCongestionOldestCriticalMinutes,
      DEFAULT_INCIDENT_THRESHOLDS.kitchenCongestionOldestCriticalMinutes,
    ),
    ...queueCongestionThresholds(value),
  };
}

function queueCongestionThresholds(value: Record<string, unknown>): {
  queueCongestionWarningParties: number;
  queueCongestionCriticalParties: number;
  queueCongestionWarningWaitMinutes: number;
  queueCongestionCriticalWaitMinutes: number;
} {
  const [queueCongestionWarningParties, queueCongestionCriticalParties] = thresholdPair(
    value,
    "queueCongestionWarningParties",
    "queueCongestionCriticalParties",
    true,
  );
  const [queueCongestionWarningWaitMinutes, queueCongestionCriticalWaitMinutes] = thresholdPair(
    value,
    "queueCongestionWarningWaitMinutes",
    "queueCongestionCriticalWaitMinutes",
  );
  return {
    queueCongestionWarningParties,
    queueCongestionCriticalParties,
    queueCongestionWarningWaitMinutes,
    queueCongestionCriticalWaitMinutes,
  };
}

function elapsedMs(startAt: Date, now: Date): number {
  if (!Number.isFinite(startAt.getTime())) return 0;
  return Math.max(0, now.getTime() - startAt.getTime());
}

function elapsedMinutes(startAt: Date, now: Date): number {
  return Math.ceil(elapsedMs(startAt, now) / MINUTE_MS);
}

function nextThresholdAt(startAt: Date, thresholds: number[], now: Date): Date | null {
  for (const threshold of thresholds) {
    const dueAt = new Date(startAt.getTime() + threshold * MINUTE_MS + 1);
    if (dueAt > now) return dueAt;
  }
  return null;
}

function addNextTime(times: Date[], startAt: Date, thresholds: number[], now: Date): void {
  const next = nextThresholdAt(startAt, thresholds, now);
  if (next) times.push(next);
}

function addIncident(
  incidents: Map<string, IncidentCandidate>,
  candidate: IncidentCandidate,
): void {
  const key = incidentIdentityKey(candidate);
  const current = incidents.get(key);
  if (!current) {
    incidents.set(key, candidate);
    return;
  }
  const winner =
    SEVERITY_RANK[candidate.severity] > SEVERITY_RANK[current.severity] ? candidate : current;
  incidents.set(key, {
    ...winner,
    triggerSnapshot: { ...current.triggerSnapshot, ...candidate.triggerSnapshot },
  });
}

function severityAtElapsed(
  ageMs: number,
  warningMinutes: number,
  criticalMinutes: number,
): Exclude<IncidentSeverity, "info"> | null {
  if (ageMs > criticalMinutes * MINUTE_MS) return "critical";
  if (ageMs > warningMinutes * MINUTE_MS) return "warning";
  return null;
}

function acceptedAt(order: DetectionOrder): Date {
  return order.statusTimestamps?.Accepted ?? order.createdAt;
}

function managedType(type: RuleManagedIncidentType): RuleManagedIncidentType {
  return type;
}

function evaluateOrderAndKitchenRules(
  snapshot: IncidentDetectionSnapshot,
  now: Date,
  thresholds: NormalizedThresholds,
  incidents: Map<string, IncidentCandidate>,
  nextChecks: Date[],
): void {
  const orderById = new Map(snapshot.orders.map((order) => [order.id.toHexString(), order]));
  const activeOrders = snapshot.orders.filter((order) => ACTIVE_KITCHEN_STATUSES.has(order.status));

  for (const order of snapshot.orders) {
    if (!ORDER_DELAY_STATUSES.has(order.status)) continue;
    const startedAt = acceptedAt(order);
    const age = elapsedMs(startedAt, now);
    const severity = severityAtElapsed(
      age,
      thresholds.orderDelayWarningMinutes,
      thresholds.orderDelayCriticalMinutes,
    );
    if (severity) {
      const thresholdMinutes =
        severity === "critical"
          ? thresholds.orderDelayCriticalMinutes
          : thresholds.orderDelayWarningMinutes;
      addIncident(incidents, {
        type: managedType("order_delay"),
        severity,
        affectedEntity: { type: "order", id: order.id },
        triggerSnapshot: {
          elapsedMinutes: elapsedMinutes(startedAt, now),
          thresholdMinutes,
        },
        rootCause:
          "The order has remained accepted or in preparation beyond its configured ready-time threshold.",
      });
    }
    addNextTime(
      nextChecks,
      startedAt,
      [thresholds.orderDelayWarningMinutes, thresholds.orderDelayCriticalMinutes],
      now,
    );
  }

  for (const item of snapshot.orderItems) {
    const order = orderById.get(item.orderId.toHexString());
    if (
      !order ||
      (order.status !== "Accepted" && order.status !== "Preparing") ||
      item.preparationStatus !== "Preparing"
    )
      continue;
    const age = elapsedMs(item.updatedAt, now);
    const severity = severityAtElapsed(
      age,
      thresholds.kitchenDelayWarningMinutes,
      thresholds.kitchenDelayCriticalMinutes,
    );
    if (severity) {
      const thresholdMinutes =
        severity === "critical"
          ? thresholds.kitchenDelayCriticalMinutes
          : thresholds.kitchenDelayWarningMinutes;
      addIncident(incidents, {
        type: managedType("kitchen_delay"),
        severity,
        affectedEntity: { type: "order", id: item.orderId },
        triggerSnapshot: {
          elapsedMinutes: elapsedMinutes(item.updatedAt, now),
          thresholdMinutes,
        },
        rootCause:
          "One or more order items have remained in preparation beyond the configured kitchen-delay threshold.",
      });
    }
    addNextTime(
      nextChecks,
      item.updatedAt,
      [thresholds.kitchenDelayWarningMinutes, thresholds.kitchenDelayCriticalMinutes],
      now,
    );
  }

  if (activeOrders.length > 0) {
    const oldestStartedAt = activeOrders.reduce((oldest, order) => {
      const startedAt = acceptedAt(order);
      return startedAt < oldest ? startedAt : oldest;
    }, acceptedAt(activeOrders[0]));
    const oldestMinutes = elapsedMinutes(oldestStartedAt, now);
    const count = activeOrders.length;
    if (count >= thresholds.kitchenCongestionWarningOrders) {
      const critical =
        count >= thresholds.kitchenCongestionCriticalOrders ||
        elapsedMs(oldestStartedAt, now) >
          thresholds.kitchenCongestionOldestCriticalMinutes * MINUTE_MS;
      addIncident(incidents, {
        type: managedType("kitchen_congestion"),
        severity: critical ? "critical" : "warning",
        affectedEntity: { type: "restaurant", id: snapshot.restaurantId },
        triggerSnapshot: {
          queueLength: count,
          activeOrderCount: count,
          oldestActiveOrderMinutes: oldestMinutes,
        },
        rootCause:
          "The active kitchen queue has crossed the configured order-count or oldest-order threshold.",
      });
    } else if (
      elapsedMs(oldestStartedAt, now) >
      thresholds.kitchenCongestionOldestCriticalMinutes * MINUTE_MS
    ) {
      addIncident(incidents, {
        type: managedType("kitchen_congestion"),
        severity: "critical",
        affectedEntity: { type: "restaurant", id: snapshot.restaurantId },
        triggerSnapshot: {
          queueLength: count,
          activeOrderCount: count,
          oldestActiveOrderMinutes: oldestMinutes,
        },
        rootCause: "The oldest active kitchen order has exceeded the configured critical age.",
      });
    }

    for (const order of activeOrders) {
      addNextTime(
        nextChecks,
        acceptedAt(order),
        [thresholds.kitchenCongestionOldestCriticalMinutes],
        now,
      );
    }
  }
}

function evaluateInventoryRules(
  snapshot: IncidentDetectionSnapshot,
  incidents: Map<string, IncidentCandidate>,
): void {
  for (const item of snapshot.inventoryItems) {
    if (!Number.isFinite(item.quantity) || !Number.isFinite(item.lowStockThreshold)) continue;
    if (item.quantity > item.lowStockThreshold) continue;
    addIncident(incidents, {
      type: managedType("inventory_shortage"),
      severity: item.quantity <= 0 ? "critical" : "warning",
      affectedEntity: { type: "inventory_item", id: item.id },
      triggerSnapshot: {
        available: item.quantity,
        lowStockThreshold: item.lowStockThreshold,
        unit: item.unit,
      },
      rootCause:
        item.quantity <= 0
          ? "Available inventory is depleted."
          : "Available inventory is at or below the item's configured low-stock threshold.",
    });
  }
}

function normalizeState(status: string): string {
  return status
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizedTableStatus(status: string): string {
  return normalizeState(status);
}

function validActiveReservation(reservation: DetectionReservation, now: Date): boolean {
  return (
    ACTIVE_RESERVATION_STATUSES.has(reservation.status) &&
    Number.isFinite(reservation.startAt.getTime()) &&
    Number.isFinite(reservation.endAt.getTime()) &&
    reservation.endAt > now
  );
}

function overlaps(left: DetectionReservation, right: DetectionReservation): boolean {
  return left.startAt < right.endAt && right.startAt < left.endAt;
}

function evaluateReservationRules(
  snapshot: IncidentDetectionSnapshot,
  now: Date,
  incidents: Map<string, IncidentCandidate>,
  nextChecks: Date[],
): void {
  const tables = new Map(snapshot.tables.map((table) => [table.id.toHexString(), table]));
  const reservations = snapshot.reservations.filter((reservation) =>
    validActiveReservation(reservation, now),
  );
  const byTable = new Map<string, DetectionReservation[]>();

  for (const reservation of reservations) {
    if (!reservation.tableId) continue;
    const key = reservation.tableId.toHexString();
    const table = tables.get(key);
    if (
      reservation.status === "Confirmed" &&
      (!table || DISABLED_TABLE_STATUSES.has(normalizedTableStatus(table.status)))
    ) {
      nextChecks.push(new Date(reservation.endAt.getTime() + 1));
      addIncident(incidents, {
        type: managedType("reservation_conflict"),
        severity: "critical",
        affectedEntity: { type: "table", id: reservation.tableId },
        triggerSnapshot: {
          partySize: reservation.partySize,
          ...(table ? { tableStatus: table.status } : { tableStatus: "missing" }),
        },
        rootCause: "A confirmed reservation is assigned to a table that is missing or unavailable.",
      });
    }
    if (table && reservation.partySize > table.capacity) {
      nextChecks.push(new Date(reservation.endAt.getTime() + 1));
      addIncident(incidents, {
        type: managedType("reservation_conflict"),
        severity: "warning",
        affectedEntity: { type: "reservation", id: reservation.id },
        triggerSnapshot: { partySize: reservation.partySize, capacity: table.capacity },
        rootCause: "The reserved party is larger than the assigned table's configured capacity.",
      });
    }
    const grouped = byTable.get(key) ?? [];
    grouped.push(reservation);
    byTable.set(key, grouped);
  }

  for (const [tableKey, assigned] of byTable) {
    let conflictCount = 0;
    let maximumPartySize = 0;
    for (let leftIndex = 0; leftIndex < assigned.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < assigned.length; rightIndex += 1) {
        const left = assigned[leftIndex];
        const right = assigned[rightIndex];
        if (!overlaps(left, right)) continue;
        nextChecks.push(new Date(Math.min(left.endAt.getTime(), right.endAt.getTime()) + 1));
        conflictCount += 1;
        maximumPartySize = Math.max(maximumPartySize, left.partySize, right.partySize);
      }
    }
    if (conflictCount === 0) continue;
    const table = tables.get(tableKey);
    const tableId = assigned[0].tableId;
    if (!tableId) continue;
    addIncident(incidents, {
      type: managedType("reservation_conflict"),
      severity: "warning",
      affectedEntity: { type: "table", id: tableId },
      triggerSnapshot: {
        conflictCount,
        partySize: maximumPartySize,
        ...(table ? { capacity: table.capacity } : {}),
      },
      rootCause: "Two or more active reservations overlap on the same assigned table.",
    });
  }
}

/**
 * Queue rules are scoped to the restaurant: one `queue_congestion` incident for
 * the whole waiting queue, and one `table_congestion` incident when no free
 * table can seat the largest party that is still waiting.
 */
function evaluateQueueRules(
  snapshot: IncidentDetectionSnapshot,
  now: Date,
  thresholds: NormalizedThresholds,
  incidents: Map<string, IncidentCandidate>,
  nextChecks: Date[],
): void {
  const waiting = snapshot.waitlistEntries.filter(
    (entry) => normalizeState(entry.status) === "waiting",
  );
  if (waiting.length === 0) return;

  const queueLength = waiting.length;
  const oldestStartedAt = waiting.reduce(
    (oldest, entry) => (entry.createdAt < oldest ? entry.createdAt : oldest),
    waiting[0].createdAt,
  );
  const oldestWaitMinutes = elapsedMinutes(oldestStartedAt, now);
  const largestParty = waiting.reduce((largest, entry) => Math.max(largest, entry.partySize), 0);

  for (const entry of waiting) {
    addNextTime(
      nextChecks,
      entry.createdAt,
      [thresholds.queueCongestionWarningWaitMinutes, thresholds.queueCongestionCriticalWaitMinutes],
      now,
    );
  }

  const overCount = queueLength >= thresholds.queueCongestionWarningParties;
  const overWait =
    elapsedMs(oldestStartedAt, now) > thresholds.queueCongestionWarningWaitMinutes * MINUTE_MS;
  if (!overCount && !overWait) return;

  const critical =
    queueLength >= thresholds.queueCongestionCriticalParties ||
    elapsedMs(oldestStartedAt, now) > thresholds.queueCongestionCriticalWaitMinutes * MINUTE_MS;

  addIncident(incidents, {
    type: managedType("queue_congestion"),
    severity: critical ? "critical" : "warning",
    affectedEntity: { type: "restaurant", id: snapshot.restaurantId },
    triggerSnapshot: {
      queueLength,
      partySize: largestParty,
      elapsedMinutes: oldestWaitMinutes,
      thresholdMinutes: critical
        ? thresholds.queueCongestionCriticalWaitMinutes
        : thresholds.queueCongestionWarningWaitMinutes,
    },
    rootCause:
      "The waiting queue has crossed the configured party-count or longest-wait threshold.",
  });

  const availableTables = snapshot.tables.filter(
    (table) => normalizeState(table.status) === "available",
  );
  const largestAvailableCapacity = availableTables.reduce(
    (largest, table) => Math.max(largest, table.capacity),
    0,
  );
  const canSeatSomeone = availableTables.some((table) => table.capacity >= largestParty);
  if (availableTables.length > 0 && canSeatSomeone) return;

  addIncident(incidents, {
    type: managedType("table_congestion"),
    severity: critical ? "critical" : "warning",
    affectedEntity: { type: "restaurant", id: snapshot.restaurantId },
    triggerSnapshot: {
      queueLength,
      partySize: largestParty,
      available: availableTables.length,
      capacity: largestAvailableCapacity,
      elapsedMinutes: oldestWaitMinutes,
    },
    rootCause:
      availableTables.length === 0
        ? "No table is available while parties are waiting."
        : "No available table can seat the largest waiting party.",
  });
}

export function evaluateIncidentRules(
  snapshot: IncidentDetectionSnapshot,
  now: Date,
): IncidentEvaluation {
  const thresholds = normalizeIncidentThresholds(snapshot.thresholds);
  const incidents = new Map<string, IncidentCandidate>();
  const nextChecks: Date[] = [];

  evaluateOrderAndKitchenRules(snapshot, now, thresholds, incidents, nextChecks);
  evaluateInventoryRules(snapshot, incidents);
  evaluateReservationRules(snapshot, now, incidents, nextChecks);
  evaluateQueueRules(snapshot, now, thresholds, incidents, nextChecks);

  const nextEvaluationAt = nextChecks.reduce<Date | null>(
    (earliest, candidate) => (earliest && earliest <= candidate ? earliest : candidate),
    null,
  );
  return {
    incidents: [...incidents.values()],
    nextEvaluationAt,
    truncatedSources: [...snapshot.truncatedSources],
  };
}
