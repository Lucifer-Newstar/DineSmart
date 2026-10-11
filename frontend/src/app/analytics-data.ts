export type AnalyticsRange = "7d" | "30d";

export interface AnalyticsDailyPoint {
  date: string;
  ordersPlaced: number;
  reservationsScheduled: number;
}

export interface AnalyticsHourlyPoint {
  hour: number;
  ordersPlaced: number;
}

export interface AnalyticsData {
  range: AnalyticsRange;
  period: { startAt: string; endAt: string; timeZone: string };
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
  sampling: { perCollectionLimit: number; truncatedCollections: string[] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isValidDailyPoint(value: unknown): value is AnalyticsDailyPoint {
  return (
    isRecord(value) &&
    typeof value.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.date) &&
    isNonNegativeInteger(value.ordersPlaced) &&
    isNonNegativeInteger(value.reservationsScheduled)
  );
}

function isValidHourlyPoint(value: unknown, expectedHour: number): value is AnalyticsHourlyPoint {
  return isRecord(value) && value.hour === expectedHour && isNonNegativeInteger(value.ordersPlaced);
}

export function parseAnalyticsData(value: unknown): AnalyticsData | null {
  if (!isRecord(value) || (value.range !== "7d" && value.range !== "30d")) return null;
  if (
    !isRecord(value.period) ||
    !isIsoTimestamp(value.period.startAt) ||
    !isIsoTimestamp(value.period.endAt) ||
    typeof value.period.timeZone !== "string" ||
    !isIsoTimestamp(value.generatedAt) ||
    !isRecord(value.summary) ||
    !isRecord(value.sampling) ||
    !Array.isArray(value.daily) ||
    value.daily.length !== (value.range === "7d" ? 7 : 30) ||
    !value.daily.every(isValidDailyPoint) ||
    !Array.isArray(value.hourly) ||
    value.hourly.length !== 24 ||
    !value.hourly.every((point, index) => isValidHourlyPoint(point, index)) ||
    !isNonNegativeInteger(value.sampling.perCollectionLimit) ||
    !Array.isArray(value.sampling.truncatedCollections) ||
    !value.sampling.truncatedCollections.every((name) => typeof name === "string")
  ) {
    return null;
  }

  const summary = value.summary;
  const countKeys = [
    "ordersPlaced",
    "ordersFulfilled",
    "ordersCancelled",
    "ordersInProgress",
    "averagePrepObservations",
    "reservationsScheduled",
    "reservationsConfirmed",
    "reservationsSeated",
    "reservationsCompleted",
    "reservationsNoShow",
    "inventoryItems",
    "lowStockItems",
    "outOfStockItems",
  ] as const;
  if (!countKeys.every((key) => isNonNegativeInteger(summary[key]))) return null;
  if (
    summary.averagePrepMinutes !== null &&
    (typeof summary.averagePrepMinutes !== "number" ||
      !Number.isFinite(summary.averagePrepMinutes) ||
      summary.averagePrepMinutes < 0)
  ) {
    return null;
  }

  return value as unknown as AnalyticsData;
}
