import type { ObjectId } from "mongodb";
import type { IncidentEvaluationSummary } from "./incident.types.js";

export const INCIDENT_SWEEP_INTERVAL_MS = 60 * 60 * 1_000;
export const INCIDENT_RETRY_DELAY_MS = 30 * 1_000;

type IntervalHandle = ReturnType<typeof setInterval>;
type TimeoutHandle = ReturnType<typeof setTimeout>;
type ScheduleInterval = (callback: () => void, milliseconds: number) => IntervalHandle;
type CancelInterval = (handle: IntervalHandle) => void;
type ScheduleTimeout = (callback: () => void, milliseconds: number) => TimeoutHandle;
type CancelTimeout = (handle: TimeoutHandle) => void;

export interface IncidentDetectionRunner {
  listActiveRestaurantIds(): Promise<ObjectId[]>;
  evaluateRestaurant(restaurantId: ObjectId): Promise<IncidentEvaluationSummary>;
}

export interface IncidentDetectionSchedulerOptions {
  onError?: (error: unknown) => void;
  scheduleInterval?: ScheduleInterval;
  cancelInterval?: CancelInterval;
  scheduleTimeout?: ScheduleTimeout;
  cancelTimeout?: CancelTimeout;
}

export class IncidentDetectionScheduler {
  private readonly onError: (error: unknown) => void;
  private readonly scheduleInterval: ScheduleInterval;
  private readonly cancelInterval: CancelInterval;
  private readonly scheduleTimeout: ScheduleTimeout;
  private readonly cancelTimeout: CancelTimeout;
  private readonly timers = new Map<string, TimeoutHandle>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly rerun = new Set<string>();
  private interval: IntervalHandle | undefined;
  private refreshAllInFlight: Promise<void> | undefined;
  private stopped = false;

  constructor(
    private readonly createRunner: () => Promise<IncidentDetectionRunner>,
    options: IncidentDetectionSchedulerOptions = {},
  ) {
    this.onError = options.onError ?? (() => undefined);
    this.scheduleInterval = options.scheduleInterval ?? setInterval;
    this.cancelInterval = options.cancelInterval ?? clearInterval;
    this.scheduleTimeout = options.scheduleTimeout ?? setTimeout;
    this.cancelTimeout = options.cancelTimeout ?? clearTimeout;
  }

  /** Request an immediate, non-blocking scan after a successful operational write. */
  readonly notifyOperationalEvent = (restaurantId: ObjectId): void => {
    this.requestEvaluation(restaurantId);
  };

  requestEvaluation(restaurantId: ObjectId): void {
    if (this.stopped) return;
    const key = restaurantId.toHexString();
    this.cancelTenantTimer(key);
    if (this.inFlight.has(key)) {
      this.rerun.add(key);
      return;
    }
    const running = this.evaluateAndSchedule(restaurantId, key);
    this.inFlight.set(key, running);
  }

  private async evaluateAndSchedule(restaurantId: ObjectId, key: string): Promise<void> {
    let summary: IncidentEvaluationSummary | undefined;
    try {
      const runner = await this.createRunner();
      summary = await runner.evaluateRestaurant(restaurantId);
    } catch (error) {
      this.onError(error);
    } finally {
      this.inFlight.delete(key);
    }

    if (this.stopped) return;
    if (this.rerun.delete(key)) {
      this.scheduleTenant(restaurantId, 0);
      return;
    }
    if (!summary) {
      this.scheduleTenant(restaurantId, INCIDENT_RETRY_DELAY_MS);
      return;
    }
    if (summary.nextEvaluationAt) {
      this.scheduleTenant(
        restaurantId,
        Math.max(1, summary.nextEvaluationAt.getTime() - Date.now()),
      );
    }
  }

  private scheduleTenant(restaurantId: ObjectId, delayMs: number): void {
    if (this.stopped) return;
    const key = restaurantId.toHexString();
    this.cancelTenantTimer(key);
    const timer = this.scheduleTimeout(
      () => {
        this.timers.delete(key);
        this.requestEvaluation(restaurantId);
      },
      Math.max(0, delayMs),
    );
    if (typeof timer === "object" && timer !== null && "unref" in timer) timer.unref();
    this.timers.set(key, timer);
  }

  private cancelTenantTimer(key: string): void {
    const timer = this.timers.get(key);
    if (!timer) return;
    this.cancelTimeout(timer);
    this.timers.delete(key);
  }

  /** Startup and hourly safety sweep; event-bound timers cover threshold crossings between sweeps. */
  refreshAll(): Promise<void> {
    if (this.refreshAllInFlight) return this.refreshAllInFlight;
    let refresh!: Promise<void>;
    refresh = (async () => {
      const runner = await this.createRunner();
      const restaurantIds = await runner.listActiveRestaurantIds();
      for (const restaurantId of restaurantIds) this.requestEvaluation(restaurantId);
      await Promise.all(
        restaurantIds.map(
          (restaurantId) => this.inFlight.get(restaurantId.toHexString()) ?? Promise.resolve(),
        ),
      );
    })();
    this.refreshAllInFlight = refresh;
    void refresh.then(
      () => {
        if (this.refreshAllInFlight === refresh) this.refreshAllInFlight = undefined;
      },
      () => {
        if (this.refreshAllInFlight === refresh) this.refreshAllInFlight = undefined;
      },
    );
    return refresh;
  }

  async startHourlyRefresh(intervalMs = INCIDENT_SWEEP_INTERVAL_MS): Promise<void> {
    if (this.interval) return;
    if (!Number.isFinite(intervalMs) || intervalMs < INCIDENT_SWEEP_INTERVAL_MS) {
      throw new RangeError("Incident-detection sweep interval must be at least one hour.");
    }
    this.stopped = false;
    this.interval = this.scheduleInterval(() => {
      void this.refreshAll().catch(this.onError);
    }, intervalMs);
    if (typeof this.interval === "object" && this.interval !== null && "unref" in this.interval) {
      this.interval.unref();
    }
    await this.refreshAll();
  }

  stopHourlyRefresh(): void {
    this.stopped = true;
    if (this.interval) {
      this.cancelInterval(this.interval);
      this.interval = undefined;
    }
    for (const key of this.timers.keys()) this.cancelTenantTimer(key);
    this.rerun.clear();
  }
}
