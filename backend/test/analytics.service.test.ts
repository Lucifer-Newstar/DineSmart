import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { AnalyticsService } from "../src/analytics/analytics.service.js";
import type { AnalyticsRepository, AnalyticsSnapshot } from "../src/analytics/analytics.types.js";

class FakeAnalyticsRepository implements AnalyticsRepository {
  from: Date | undefined;
  until: Date | undefined;

  constructor(
    private readonly snapshot: AnalyticsSnapshot,
    private readonly timeZone: string | null = "UTC",
  ) {}

  async getRestaurantTimeZone(): Promise<string | null> {
    return this.timeZone;
  }

  async getSnapshot(_restaurantId: ObjectId, from: Date, until: Date): Promise<AnalyticsSnapshot> {
    this.from = from;
    this.until = until;
    return this.snapshot;
  }
}

function emptySnapshot(): AnalyticsSnapshot {
  return { orders: [], reservations: [], inventoryItems: [], truncatedCollections: [] };
}

test("analytics service builds tenant-local daily/hourly aggregates and operational summaries", async () => {
  const restaurantId = new ObjectId();
  const now = new Date("2026-10-11T20:00:00.000Z");
  const snapshot = emptySnapshot();
  snapshot.orders = [
    {
      status: "Completed",
      createdAt: new Date("2026-10-05T18:31:00.000Z"),
      statusTimestamps: {
        Preparing: new Date("2026-10-05T18:41:00.000Z"),
        Ready: new Date("2026-10-05T18:51:00.000Z"),
      },
    },
    { status: "Cancelled", createdAt: new Date("2026-10-11T19:00:00.000Z") },
    { status: "Accepted", createdAt: now },
  ];
  snapshot.reservations = [
    { status: "Confirmed", startAt: new Date("2026-10-05T19:00:00.000Z") },
    { status: "NoShow", startAt: new Date("2026-10-11T18:40:00.000Z") },
  ];
  snapshot.inventoryItems = [
    { quantity: 2, lowStockThreshold: 4 },
    { quantity: 0, lowStockThreshold: 3 },
    { quantity: 5, lowStockThreshold: 4 },
  ];
  snapshot.truncatedCollections = ["orders"];
  const repository = new FakeAnalyticsRepository(snapshot, "Asia/Kolkata");
  const service = new AnalyticsService(repository, () => now);

  const result = await service.getAnalytics(restaurantId, "7d");

  assert.equal(result.range, "7d");
  assert.deepEqual(result.period, {
    startAt: "2026-10-05T18:30:00.000Z",
    endAt: now.toISOString(),
    timeZone: "Asia/Kolkata",
  });
  assert.equal(repository.from?.toISOString(), "2026-10-05T18:30:00.000Z");
  assert.equal(repository.until?.toISOString(), now.toISOString());
  assert.deepEqual(result.summary, {
    ordersPlaced: 3,
    ordersFulfilled: 1,
    ordersCancelled: 1,
    ordersInProgress: 1,
    averagePrepMinutes: 10,
    averagePrepObservations: 1,
    reservationsScheduled: 2,
    reservationsConfirmed: 1,
    reservationsSeated: 0,
    reservationsCompleted: 0,
    reservationsNoShow: 1,
    inventoryItems: 3,
    lowStockItems: 2,
    outOfStockItems: 1,
  });
  assert.equal(result.daily.length, 7);
  assert.deepEqual(result.daily[0], {
    date: "2026-10-06",
    ordersPlaced: 1,
    reservationsScheduled: 1,
  });
  assert.deepEqual(result.daily[6], {
    date: "2026-10-12",
    ordersPlaced: 2,
    reservationsScheduled: 1,
  });
  assert.equal(result.hourly.length, 24);
  assert.equal(result.hourly[0].ordersPlaced, 2);
  assert.equal(result.hourly[1].ordersPlaced, 1);
  assert.deepEqual(result.sampling.truncatedCollections, ["orders"]);
});

test("analytics service falls back to UTC for an invalid restaurant timezone and supports 30 days", async () => {
  const now = new Date("2026-01-15T03:30:00.000Z");
  const repository = new FakeAnalyticsRepository(emptySnapshot(), "Invalid/Timezone");
  const service = new AnalyticsService(repository, () => now);

  const result = await service.getAnalytics(new ObjectId(), "30d");

  assert.equal(result.period.timeZone, "UTC");
  assert.equal(result.period.startAt, "2025-12-17T00:00:00.000Z");
  assert.equal(result.daily.length, 30);
  assert.deepEqual(result.daily.at(-1), {
    date: "2026-01-15",
    ordersPlaced: 0,
    reservationsScheduled: 0,
  });
  assert.equal(result.summary.averagePrepMinutes, null);
  assert.equal(result.summary.averagePrepObservations, 0);
});
