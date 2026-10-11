import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import {
  INCIDENT_RETRY_DELAY_MS,
  INCIDENT_SWEEP_INTERVAL_MS,
  IncidentDetectionScheduler,
} from "../src/incidents/incident.scheduler.js";
import type { IncidentEvaluationSummary } from "../src/incidents/incident.types.js";

const restaurantId = new ObjectId();

function summary(nextEvaluationAt: Date | null): IncidentEvaluationSummary {
  return {
    incidents: [],
    nextEvaluationAt,
    truncatedSources: [],
    resolvedCount: 0,
    upsertedCount: 0,
  };
}

function fakeTimers() {
  let nextId = 0;
  const timeouts = new Map<
    ReturnType<typeof setTimeout>,
    { callback: () => void; delay: number }
  >();
  const intervals = new Map<
    ReturnType<typeof setInterval>,
    { callback: () => void; delay: number }
  >();
  return {
    timeouts,
    intervals,
    scheduleTimeout(callback: () => void, delay: number) {
      const handle = { id: ++nextId } as unknown as ReturnType<typeof setTimeout>;
      timeouts.set(handle, { callback, delay });
      return handle;
    },
    cancelTimeout(handle: ReturnType<typeof setTimeout>) {
      timeouts.delete(handle);
    },
    scheduleInterval(callback: () => void, delay: number) {
      const handle = { id: ++nextId } as unknown as ReturnType<typeof setInterval>;
      intervals.set(handle, { callback, delay });
      return handle;
    },
    cancelInterval(handle: ReturnType<typeof setInterval>) {
      intervals.delete(handle);
    },
  };
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  assert.fail("the scheduled operation did not complete in time");
}

test("startup sweep evaluates active restaurants and schedules the next timed threshold", async () => {
  const timers = fakeTimers();
  let evaluations = 0;
  const scheduler = new IncidentDetectionScheduler(
    async () => ({
      async listActiveRestaurantIds() {
        return [restaurantId];
      },
      async evaluateRestaurant() {
        evaluations += 1;
        return summary(new Date(Date.now() + 5_000));
      },
    }),
    {
      scheduleInterval: timers.scheduleInterval,
      cancelInterval: timers.cancelInterval,
      scheduleTimeout: timers.scheduleTimeout,
      cancelTimeout: timers.cancelTimeout,
    },
  );

  await scheduler.startHourlyRefresh();
  assert.equal(evaluations, 1);
  assert.equal([...timers.intervals.values()][0].delay, INCIDENT_SWEEP_INTERVAL_MS);
  assert.ok([...timers.timeouts.values()][0].delay > 0);
  assert.ok([...timers.timeouts.values()][0].delay <= 5_000);

  scheduler.stopHourlyRefresh();
  assert.equal(timers.intervals.size, 0);
  assert.equal(timers.timeouts.size, 0);
});

test("operational events coalesce during a tenant scan and request one follow-up pass", async () => {
  const timers = fakeTimers();
  let evaluations = 0;
  let resolveFirst!: (value: IncidentEvaluationSummary) => void;
  const firstEvaluation = new Promise<IncidentEvaluationSummary>((resolve) => {
    resolveFirst = resolve;
  });
  const scheduler = new IncidentDetectionScheduler(
    async () => ({
      async listActiveRestaurantIds() {
        return [restaurantId];
      },
      async evaluateRestaurant() {
        evaluations += 1;
        if (evaluations === 1) return firstEvaluation;
        return summary(null);
      },
    }),
    {
      scheduleInterval: timers.scheduleInterval,
      cancelInterval: timers.cancelInterval,
      scheduleTimeout: timers.scheduleTimeout,
      cancelTimeout: timers.cancelTimeout,
    },
  );

  scheduler.notifyOperationalEvent(restaurantId);
  await waitUntil(() => evaluations === 1);
  scheduler.notifyOperationalEvent(restaurantId);
  scheduler.notifyOperationalEvent(restaurantId);
  resolveFirst(summary(null));
  await waitUntil(() => timers.timeouts.size === 1);
  const [followUpTimer, scheduled] = [...timers.timeouts.entries()][0];
  assert.equal(scheduled.delay, 0);
  timers.timeouts.delete(followUpTimer);
  scheduled.callback();
  await waitUntil(() => evaluations === 2);
  scheduler.stopHourlyRefresh();
});

test("failed tenant scans are retried and hourly schedules reject faster-than-hourly cadence", async () => {
  const timers = fakeTimers();
  let errors = 0;
  const scheduler = new IncidentDetectionScheduler(
    async () => ({
      async listActiveRestaurantIds() {
        return [restaurantId];
      },
      async evaluateRestaurant() {
        throw new Error("temporary database failure");
      },
    }),
    {
      onError: () => {
        errors += 1;
      },
      scheduleInterval: timers.scheduleInterval,
      cancelInterval: timers.cancelInterval,
      scheduleTimeout: timers.scheduleTimeout,
      cancelTimeout: timers.cancelTimeout,
    },
  );

  scheduler.notifyOperationalEvent(restaurantId);
  await waitUntil(() => errors === 1 && timers.timeouts.size === 1);
  assert.equal([...timers.timeouts.values()][0].delay, INCIDENT_RETRY_DELAY_MS);
  await assert.rejects(scheduler.startHourlyRefresh(INCIDENT_SWEEP_INTERVAL_MS - 1), RangeError);
  scheduler.stopHourlyRefresh();
});
