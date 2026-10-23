import type { ObjectId } from "mongodb";
import type { HealthScoreRefreshNotifier } from "../healthscore/health-score.types.js";
import type { IncidentDetectionNotifier } from "../incidents/incident.types.js";
import type { RestaurantRealtimePublisher } from "../realtime/realtime.types.js";
import {
  TableStatusReferenceError,
  TableStatusTransitionError,
  TableStatusWriteConflictError,
} from "./table-status.repository.js";
import type {
  TableListResult,
  TableOperationalStatus,
  TableStatusRecord,
  TableStatusRepository,
  TableStatusServiceReader,
} from "./table-status.types.js";
import { TABLE_LIST_LIMIT, TABLE_STATUSES } from "./table-status.types.js";

export class TableStatusServiceError extends Error {
  constructor(
    readonly statusCode: 400 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TableStatusServiceError";
  }
}

function isTableStatus(value: unknown): value is TableOperationalStatus {
  return typeof value === "string" && (TABLE_STATUSES as readonly string[]).includes(value);
}

function mapRepositoryError(error: unknown): TableStatusServiceError | null {
  if (error instanceof TableStatusTransitionError) {
    return new TableStatusServiceError(
      409,
      "invalid_table_status_transition",
      "The table cannot transition to that status from its current state.",
    );
  }
  if (error instanceof TableStatusReferenceError) {
    return new TableStatusServiceError(
      409,
      "table_assignment_active",
      "The table has an active, missing, or inconsistent assignment that must be resolved first.",
    );
  }
  if (error instanceof TableStatusWriteConflictError) {
    return new TableStatusServiceError(
      409,
      "table_status_conflict",
      "The table changed during this request. Reload its status and try again.",
    );
  }
  return null;
}

export class TableStatusService implements TableStatusServiceReader {
  constructor(
    private readonly repository: TableStatusRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly notifyHealthScoreRefresh: HealthScoreRefreshNotifier = () => undefined,
    private readonly notifyIncidentDetection: IncidentDetectionNotifier = () => undefined,
    private readonly publishRealtime: RestaurantRealtimePublisher = () => undefined,
  ) {}

  list(restaurantId: ObjectId): Promise<TableListResult> {
    return this.repository.listForRestaurant(restaurantId, TABLE_LIST_LIMIT);
  }

  async updateStatus(
    restaurantId: ObjectId,
    tableId: ObjectId,
    status: TableOperationalStatus,
  ): Promise<TableStatusRecord> {
    if (!isTableStatus(status)) {
      throw new TableStatusServiceError(
        400,
        "invalid_table_status",
        "Choose a supported table status.",
      );
    }

    let result: Awaited<ReturnType<TableStatusRepository["updateStatusForRestaurant"]>>;
    try {
      result = await this.repository.updateStatusForRestaurant(
        restaurantId,
        tableId,
        status,
        this.clock(),
      );
    } catch (error) {
      const mapped = mapRepositoryError(error);
      if (mapped) throw mapped;
      throw error;
    }

    if (!result) {
      throw new TableStatusServiceError(404, "table_not_found", "The table was not found.");
    }
    if (result.changed) {
      this.notifyHealthScoreRefresh(restaurantId);
      this.notifyIncidentDetection(restaurantId);
      this.publishRealtime({
        restaurantId,
        event: "table.updated",
        data: { tableId: result.table.id.toHexString(), status: result.table.status },
      });
    }
    return result.table;
  }
}
