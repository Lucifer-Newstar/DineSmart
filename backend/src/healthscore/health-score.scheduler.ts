import type { ObjectId } from "mongodb";
import { HealthScoreService } from "./health-score.service.js";
import type {
  HealthScoreRefreshNotifier,
  HealthScoreRepository,
  HealthScoreResult,
} from "./health-score.types.js";

export const HEALTH_SCORE_REFRESH_INTERVAL_MS = 60 * 60 * 1_000;

type IntervalHandle = ReturnType<typeof setInterval>;
type ScheduleInterval = (callback: () => void, milliseconds: number) => IntervalHandle;
type CancelInterval = (handle: IntervalHandle) => void;

export interface HealthScoreSchedulerOptions {
  clock?: () => Date;
  onError?: (error: unknown) => void;
  onRefreshed?: (restaurantId: ObjectId, result: HealthScoreResult) => void;
  scheduleInterval?: ScheduleInterval;
  cancelInterval?: CancelInterval;
}

interface CachedHealthScore {
  result: HealthScoreResult;
  refreshedAt: number;
}

/**
 * Keeps only a disposable, per-process cache. Operational write services request
 * immediate recalculation; a startup pass and hourly sweep refresh active tenants.
 */
export class HealthScoreRefreshScheduler {
  private readonly cache = new Map<string, CachedHealthScore>();
  private readonly inFlight = new Map<string, Promise<HealthScoreResult>>();
  private readonly refreshAgain = new Set<string>();
  private readonly clock: () => Date;
  private readonly onError: (error: unknown) => void;
  private readonly onRefreshed: HealthScoreSchedulerOptions["onRefreshed"];
  private readonly scheduleInterval: ScheduleInterval;
  private readonly cancelInterval: CancelInterval;
  private interval: IntervalHandle | undefined;
  private refreshAllInFlight: Promise<void> | undefined;

  constructor(
    private readonly createRepository: () => Promise<HealthScoreRepository>,
    options: HealthScoreSchedulerOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.onError = options.onError ?? (() => undefined);
    this.onRefreshed = options.onRefreshed;
    this.scheduleInterval = options.scheduleInterval ?? setInterval;
    this.cancelInterval = options.cancelInterval ?? clearInterval;
  }

  /** Return a fresh cached result, or calculate synchronously on first/expired read. */
  async getScore(restaurantId: ObjectId): Promise<HealthScoreResult> {
    const key = restaurantId.toHexString();
    const running = this.inFlight.get(key);
    if (running) return running;

    const cached = this.cache.get(key);
    const age = cached ? this.clock().getTime() - cached.refreshedAt : Number.POSITIVE_INFINITY;
    if (cached && age >= 0 && age < HEALTH_SCORE_REFRESH_INTERVAL_MS) return cached.result;
    return this.refreshRestaurant(restaurantId);
  }

  /** Called after a successful operational write; score refresh never blocks that write. */
  requestRefresh(restaurantId: ObjectId): void {
    const key = restaurantId.toHexString();
    this.cache.delete(key);
    if (this.inFlight.has(key)) {
      this.refreshAgain.add(key);
      return;
    }
    void this.refreshRestaurant(restaurantId).catch(this.onError);
  }

  /** Recompute one tenant now; concurrent callers share the same refresh. */
  async refreshRestaurant(restaurantId: ObjectId): Promise<HealthScoreResult> {
    const key = restaurantId.toHexString();
    const running = this.inFlight.get(key);
    if (running) return running;

    let refresh!: Promise<HealthScoreResult>;
    refresh = (async () => {
      let result: HealthScoreResult;
      do {
        this.refreshAgain.delete(key);
        const repository = await this.createRepository();
        result = await new HealthScoreService(repository, this.clock).getScore(restaurantId);
      } while (this.refreshAgain.delete(key));

      this.cache.set(key, { result, refreshedAt: this.clock().getTime() });
      try {
        this.onRefreshed?.(restaurantId, result);
      } catch (error) {
        this.onError(error);
      }
      return result;
    })();
    this.inFlight.set(key, refresh);

    try {
      return await refresh;
    } finally {
      if (this.inFlight.get(key) === refresh) this.inFlight.delete(key);
    }
  }

  /** Refresh all active tenant scores once, sequentially, so one failure cannot starve others. */
  async refreshAll(): Promise<void> {
    if (this.refreshAllInFlight) return this.refreshAllInFlight;

    let refresh!: Promise<void>;
    refresh = (async () => {
      const repository = await this.createRepository();
      const restaurantIds = await repository.listActiveRestaurantIds();
      const activeKeys = new Set(restaurantIds.map((restaurantId) => restaurantId.toHexString()));
      for (const key of this.cache.keys()) {
        if (!activeKeys.has(key)) this.cache.delete(key);
      }
      for (const restaurantId of restaurantIds) {
        try {
          await this.refreshRestaurant(restaurantId);
        } catch (error) {
          this.onError(error);
        }
      }
    })();
    this.refreshAllInFlight = refresh;

    try {
      await refresh;
    } finally {
      if (this.refreshAllInFlight === refresh) this.refreshAllInFlight = undefined;
    }
  }

  /** Start with an immediate sweep, then repeat at least hourly until stopped. */
  async startHourlyRefresh(intervalMs = HEALTH_SCORE_REFRESH_INTERVAL_MS): Promise<void> {
    if (this.interval) return;
    if (!Number.isFinite(intervalMs) || intervalMs < HEALTH_SCORE_REFRESH_INTERVAL_MS) {
      throw new RangeError("Health-score refresh interval must be at least one hour.");
    }

    this.interval = this.scheduleInterval(() => {
      void this.refreshAll().catch(this.onError);
    }, intervalMs);
    if (typeof this.interval === "object" && "unref" in this.interval) {
      this.interval.unref();
    }
    await this.refreshAll();
  }

  stopHourlyRefresh(): void {
    if (!this.interval) return;
    this.cancelInterval(this.interval);
    this.interval = undefined;
  }

  /** Pass this bound callback to operational write services. */
  readonly notifyOperationalEvent: HealthScoreRefreshNotifier = (restaurantId) => {
    this.requestRefresh(restaurantId);
  };
}
