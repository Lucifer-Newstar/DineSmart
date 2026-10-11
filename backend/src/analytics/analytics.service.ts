import type { ObjectId } from "mongodb";
import {
  ANALYTICS_RECORD_LIMIT,
  type AnalyticsRange,
  type AnalyticsRepository,
  type AnalyticsResult,
  type AnalyticsServiceReader,
} from "./analytics.types.js";

const RANGE_DAYS: Record<AnalyticsRange, number> = { "7d": 7, "30d": 30 };
const FULFILLED_ORDER_STATUSES = new Set(["served", "completed"]);
const CANCELLED_ORDER_STATUSES = new Set(["cancelled", "canceled"]);
const NO_SHOW_RESERVATION_STATUSES = new Set(["no_show", "no-show", "noshow"]);

function recordStatus(value: string): string {
  return value.trim().toLowerCase().replaceAll(" ", "_");
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function validTimeZone(value: string | null): string {
  if (!value?.trim()) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return value;
  } catch {
    return "UTC";
  }
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function localDateKey(date: Date, formatter: Intl.DateTimeFormat): string {
  const parts = formatter.formatToParts(date);
  return `${partValue(parts, "year")}-${partValue(parts, "month")}-${partValue(parts, "day")}`;
}

function shiftDateKey(dateKey: string, dayOffset: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + dayOffset)).toISOString().slice(0, 10);
}

function timeZoneOffsetMilliseconds(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const wallClockAsUtc = Date.UTC(
    Number(partValue(parts, "year")),
    Number(partValue(parts, "month")) - 1,
    Number(partValue(parts, "day")),
    Number(partValue(parts, "hour")),
    Number(partValue(parts, "minute")),
    Number(partValue(parts, "second")),
  );
  return wallClockAsUtc - (instant.getTime() - instant.getUTCMilliseconds());
}

function startOfLocalDay(dateKey: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const localMidnightAsUtc = Date.UTC(year, month - 1, day);
  const initialGuess = new Date(localMidnightAsUtc);
  const firstOffset = timeZoneOffsetMilliseconds(initialGuess, timeZone);
  const firstCandidate = new Date(localMidnightAsUtc - firstOffset);
  const correctedOffset = timeZoneOffsetMilliseconds(firstCandidate, timeZone);
  return new Date(localMidnightAsUtc - correctedOffset);
}

function localHour(date: Date, formatter: Intl.DateTimeFormat): number {
  const parts = formatter.formatToParts(date);
  return Number(partValue(parts, "hour"));
}

function roundedToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export class AnalyticsService implements AnalyticsServiceReader {
  constructor(
    private readonly repository: AnalyticsRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async getAnalytics(restaurantId: ObjectId, range: AnalyticsRange): Promise<AnalyticsResult> {
    const generatedAt = this.clock();
    const timeZone = validTimeZone(await this.repository.getRestaurantTimeZone(restaurantId));
    const dateFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const hourFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    });
    const days = RANGE_DAYS[range];
    const currentDateKey = localDateKey(generatedAt, dateFormatter);
    const dates = Array.from({ length: days }, (_, index) =>
      shiftDateKey(currentDateKey, index - days + 1),
    );
    const startAt = startOfLocalDay(dates[0], timeZone);
    const snapshot = await this.repository.getSnapshot(restaurantId, startAt, generatedAt);

    const daily = new Map(
      dates.map((date) => [date, { date, ordersPlaced: 0, reservationsScheduled: 0 }]),
    );
    const hourlyCounts = Array.from({ length: 24 }, () => 0);
    let ordersPlaced = 0;
    let ordersFulfilled = 0;
    let ordersCancelled = 0;
    const prepDurationsMinutes: number[] = [];

    for (const order of snapshot.orders) {
      if (!validDate(order.createdAt)) continue;
      const dateKey = localDateKey(order.createdAt, dateFormatter);
      const day = daily.get(dateKey);
      if (!day) continue;
      day.ordersPlaced += 1;
      ordersPlaced += 1;
      hourlyCounts[localHour(order.createdAt, hourFormatter)] += 1;

      const status = recordStatus(order.status);
      if (FULFILLED_ORDER_STATUSES.has(status)) ordersFulfilled += 1;
      if (CANCELLED_ORDER_STATUSES.has(status)) ordersCancelled += 1;

      const preparingAt = order.statusTimestamps?.Preparing;
      const readyAt = order.statusTimestamps?.Ready;
      if (
        validDate(preparingAt) &&
        validDate(readyAt) &&
        readyAt.getTime() >= preparingAt.getTime()
      ) {
        prepDurationsMinutes.push((readyAt.getTime() - preparingAt.getTime()) / 60_000);
      }
    }

    let reservationsScheduled = 0;
    let reservationsConfirmed = 0;
    let reservationsSeated = 0;
    let reservationsCompleted = 0;
    let reservationsNoShow = 0;
    for (const reservation of snapshot.reservations) {
      if (!validDate(reservation.startAt)) continue;
      const day = daily.get(localDateKey(reservation.startAt, dateFormatter));
      if (!day) continue;
      day.reservationsScheduled += 1;
      reservationsScheduled += 1;

      const status = recordStatus(reservation.status);
      if (status === "confirmed") reservationsConfirmed += 1;
      if (status === "seated") reservationsSeated += 1;
      if (status === "completed") reservationsCompleted += 1;
      if (NO_SHOW_RESERVATION_STATUSES.has(status)) reservationsNoShow += 1;
    }

    const lowStockItems = snapshot.inventoryItems.filter(
      (item) => item.quantity <= item.lowStockThreshold,
    ).length;
    const outOfStockItems = snapshot.inventoryItems.filter((item) => item.quantity <= 0).length;
    const averagePrepMinutes = prepDurationsMinutes.length
      ? roundedToOneDecimal(
          prepDurationsMinutes.reduce((total, duration) => total + duration, 0) /
            prepDurationsMinutes.length,
        )
      : null;

    return {
      range,
      period: {
        startAt: startAt.toISOString(),
        endAt: generatedAt.toISOString(),
        timeZone,
      },
      generatedAt: generatedAt.toISOString(),
      summary: {
        ordersPlaced,
        ordersFulfilled,
        ordersCancelled,
        ordersInProgress: Math.max(0, ordersPlaced - ordersFulfilled - ordersCancelled),
        averagePrepMinutes,
        averagePrepObservations: prepDurationsMinutes.length,
        reservationsScheduled,
        reservationsConfirmed,
        reservationsSeated,
        reservationsCompleted,
        reservationsNoShow,
        inventoryItems: snapshot.inventoryItems.length,
        lowStockItems,
        outOfStockItems,
      },
      daily: [...daily.values()],
      hourly: hourlyCounts.map((ordersPlaced, hour) => ({ hour, ordersPlaced })),
      sampling: {
        perCollectionLimit: ANALYTICS_RECORD_LIMIT,
        truncatedCollections: [...snapshot.truncatedCollections],
      },
    };
  }
}
