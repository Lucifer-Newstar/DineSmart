import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { HealthScoreRefreshScheduler } from "../src/healthscore/health-score.scheduler.js";
import type {
  HealthScoreRepository,
  HealthScoreSnapshot,
} from "../src/healthscore/health-score.types.js";

function emptySnapshot(): HealthScoreSnapshot {
  return {
    orders: [],
    inventoryItems: [],
    reservations: [],
    tables: [],
    incidents: [],
    thresholds: {},
    truncatedCollections: [],
  };
}

class FakeHealthScoreRepository implements HealthScoreRepository {
  readonly reads: string[] = [];

  constructor(readonly activeRestaurantIds: ObjectId[] = []) {}

  async getSnapshot(restaurantId: ObjectId): Promise<HealthScoreSnapshot> {
    this.reads.push(restaurantId.toHexString());
    return emptySnapshot();
  }

  async listActiveRestaurantIds(): Promise<ObjectId[]> {
    return this.activeRestaurantIds;
  }
}

test("health-score scheduler caches for an hour and operational events refresh immediately", async () => {
  const restaurantId = new ObjectId();
  const repository = new FakeHealthScoreRepository();
  let currentTime = new Date("2026-10-11T12:00:00.000Z");
  const scheduler = new HealthScoreRefreshScheduler(async () => repository, {
    clock: () => new Date(currentTime),
  });

  const first = await scheduler.getScore(restaurantId);
  const cached = await scheduler.getScore(restaurantId);
  assert.equal(repository.reads.length, 1);
  assert.strictEqual(cached, first);

  currentTime = new Date(currentTime.getTime() + 60 * 60 * 1_000);
  await scheduler.getScore(restaurantId);
  assert.equal(repository.reads.length, 2);

  scheduler.requestRefresh(restaurantId);
  const refreshed = await scheduler.getScore(restaurantId);
  assert.equal(repository.reads.length, 3);
  assert.equal(refreshed.calculatedAt, currentTime.toISOString());
});

test("an operational event during a refresh schedules one follow-up calculation", async () => {
  const restaurantId = new ObjectId();
  let reads = 0;
  let markFirstReadStarted!: () => void;
  let releaseFirstRead!: () => void;
  const firstReadStarted = new Promise<void>((resolve) => {
    markFirstReadStarted = resolve;
  });
  const firstReadGate = new Promise<void>((resolve) => {
    releaseFirstRead = resolve;
  });
  const repository: HealthScoreRepository = {
    async getSnapshot() {
      reads += 1;
      if (reads === 1) {
        markFirstReadStarted();
        await firstReadGate;
      }
      return emptySnapshot();
    },
    async listActiveRestaurantIds() {
      return [];
    },
  };
  const scheduler = new HealthScoreRefreshScheduler(async () => repository);

  scheduler.requestRefresh(restaurantId);
  await firstReadStarted;
  scheduler.requestRefresh(restaurantId);
  releaseFirstRead();
  await scheduler.getScore(restaurantId);

  assert.equal(reads, 2);
});

test("hourly scheduler refreshes active tenants at startup and on each interval", async () => {
  const restaurantIds = [new ObjectId(), new ObjectId()];
  const repository = new FakeHealthScoreRepository(restaurantIds);
  let currentTime = new Date("2026-10-11T12:00:00.000Z");
  let scheduledCallback: (() => void) | undefined;
  let scheduledMilliseconds = 0;
  let wasCancelled = false;
  const intervalHandle = { unref() {} } as unknown as ReturnType<typeof setInterval>;
  const scheduler = new HealthScoreRefreshScheduler(async () => repository, {
    clock: () => new Date(currentTime),
    scheduleInterval: (callback, milliseconds) => {
      scheduledCallback = callback;
      scheduledMilliseconds = milliseconds;
      return intervalHandle;
    },
    cancelInterval: (handle) => {
      assert.strictEqual(handle, intervalHandle);
      wasCancelled = true;
    },
  });

  await scheduler.startHourlyRefresh();
  assert.equal(scheduledMilliseconds, 60 * 60 * 1_000);
  assert.deepEqual(
    repository.reads,
    restaurantIds.map((id) => id.toHexString()),
  );

  currentTime = new Date(currentTime.getTime() + 60 * 60 * 1_000);
  assert.ok(scheduledCallback);
  scheduledCallback();
  await scheduler.refreshAll();
  assert.deepEqual(repository.reads, [
    ...restaurantIds.map((id) => id.toHexString()),
    ...restaurantIds.map((id) => id.toHexString()),
  ]);

  scheduler.stopHourlyRefresh();
  assert.equal(wasCancelled, true);
});

test("hourly sweeps evict scores for restaurants that are no longer active", async () => {
  const restaurantId = new ObjectId();
  const repository = new FakeHealthScoreRepository([restaurantId]);
  const scheduler = new HealthScoreRefreshScheduler(async () => repository);

  await scheduler.getScore(restaurantId);
  repository.activeRestaurantIds.length = 0;
  await scheduler.refreshAll();
  await scheduler.getScore(restaurantId);

  assert.equal(repository.reads.length, 2);
});

test("hourly scheduler rejects intervals shorter than the documented cadence", async () => {
  const scheduler = new HealthScoreRefreshScheduler(async () => new FakeHealthScoreRepository());
  await assert.rejects(scheduler.startHourlyRefresh(30 * 60 * 1_000), RangeError);
});
