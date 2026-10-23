import type { ObjectId } from "mongodb";
import type { HealthScoreRefreshNotifier } from "../healthscore/health-score.types.js";
import type { RestaurantRealtimePublisher } from "../realtime/realtime.types.js";
import { evaluateIncidentRules } from "./incident.rules.js";
import type {
  IncidentCandidate,
  IncidentDetectionRepository,
  IncidentEvaluationSummary,
  IncidentListResult,
  IncidentRecord,
  IncidentServiceReader,
} from "./incident.types.js";
import { incidentIdentityKey, RULE_MANAGED_INCIDENT_TYPES } from "./incident.types.js";

const RULE_MANAGED_TYPE_SET = new Set<string>(RULE_MANAGED_INCIDENT_TYPES);

/** Called with the incidents a sweep newly opened (SDD incident flow: "Notify manager"). */
export type IncidentOpenedNotifier = (
  restaurantId: ObjectId,
  incidents: readonly IncidentCandidate[],
) => Promise<void>;

export class IncidentDetectionService implements IncidentServiceReader {
  constructor(
    private readonly repository: IncidentDetectionRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly notifyHealthScoreRefresh: HealthScoreRefreshNotifier = () => undefined,
    private readonly publishRealtime: RestaurantRealtimePublisher = () => undefined,
    private readonly notifyIncidentsOpened: IncidentOpenedNotifier = async () => undefined,
  ) {}

  listActiveRestaurantIds(): Promise<ObjectId[]> {
    return this.repository.listActiveRestaurantIds();
  }

  listForRestaurant(restaurantId: ObjectId): Promise<IncidentListResult> {
    return this.repository.listForRestaurant(restaurantId);
  }

  async evaluateRestaurant(
    restaurantId: ObjectId,
    now = this.clock(),
  ): Promise<IncidentEvaluationSummary> {
    const snapshot = await this.repository.getSnapshot(restaurantId, now);
    const evaluation = evaluateIncidentRules(snapshot, now);
    const activeResult = await this.repository.listActiveIncidents(restaurantId);
    const currentKeys = new Set(evaluation.incidents.map(incidentIdentityKey));
    const truncatedSources = new Set(evaluation.truncatedSources);
    if (activeResult.truncated) truncatedSources.add("incidents");

    let upsertedCount = 0;
    const opened: IncidentCandidate[] = [];
    for (const incident of evaluation.incidents) {
      if (await this.repository.upsertActiveIncident(restaurantId, incident, now)) {
        opened.push(incident);
      }
      upsertedCount += 1;
    }
    if (opened.length > 0) {
      try {
        await this.notifyIncidentsOpened(restaurantId, opened);
      } catch {
        // Notifications are best effort; detection results are already persisted.
      }
    }

    let resolvedCount = 0;
    if (truncatedSources.size === 0) {
      for (const incident of activeResult.incidents) {
        if (
          !RULE_MANAGED_TYPE_SET.has(incident.type) ||
          currentKeys.has(incidentIdentityKey(incident))
        ) {
          continue;
        }
        await this.repository.resolveActiveIncident(restaurantId, incident.id, now);
        resolvedCount += 1;
      }
    }

    if (upsertedCount > 0 || resolvedCount > 0) {
      this.notifyHealthScoreRefresh(restaurantId);
      this.publishRealtime({
        restaurantId,
        event: "incident.updated",
        data: { changedCount: upsertedCount + resolvedCount },
      });
    }

    return {
      incidents: evaluation.incidents,
      nextEvaluationAt: evaluation.nextEvaluationAt,
      truncatedSources: [...truncatedSources],
      resolvedCount,
      upsertedCount,
    };
  }
}

export type { IncidentRecord };
