import { ObjectId } from "mongodb";
import type { HealthScoreRefreshNotifier } from "../healthscore/health-score.types.js";
import type { IncidentDetectionNotifier } from "../incidents/incident.types.js";
import type { RestaurantRealtimePublisher } from "../realtime/realtime.types.js";
import {
  WaitlistEntryConflictError,
  WaitlistSynchronizationError,
  WaitlistTableNotFoundError,
  WaitlistTableUnavailableError,
} from "./waitlist.repository.js";
import type {
  WaitlistCreateInput,
  WaitlistRecord,
  WaitlistRepository,
  WaitlistResolution,
  WaitlistServiceReader,
} from "./waitlist.types.js";
import {
  WAITLIST_GUEST_NAME_MAX_LENGTH,
  WAITLIST_MAX_PARTY_SIZE,
  WAITLIST_NOTES_MAX_LENGTH,
  WAITLIST_PHONE_MAX_LENGTH,
} from "./waitlist.types.js";

export class WaitlistServiceError extends Error {
  constructor(
    readonly statusCode: 400 | 404 | 409 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WaitlistServiceError";
  }
}

function normalizeCreateInput(input: WaitlistCreateInput): WaitlistCreateInput {
  if (
    !input ||
    typeof input !== "object" ||
    Object.keys(input).some((key) => !["guestName", "partySize", "phone", "notes"].includes(key)) ||
    typeof input.guestName !== "string" ||
    !input.guestName.trim() ||
    input.guestName.trim().length > WAITLIST_GUEST_NAME_MAX_LENGTH ||
    !Number.isInteger(input.partySize) ||
    input.partySize < 1 ||
    input.partySize > WAITLIST_MAX_PARTY_SIZE ||
    (input.phone !== undefined &&
      (typeof input.phone !== "string" ||
        !input.phone.trim() ||
        input.phone.trim().length > WAITLIST_PHONE_MAX_LENGTH)) ||
    (input.notes !== undefined &&
      (typeof input.notes !== "string" || input.notes.trim().length > WAITLIST_NOTES_MAX_LENGTH))
  ) {
    throw new WaitlistServiceError(
      400,
      "invalid_waitlist_entry",
      "Provide a guest name, party size from 1 to 12, and optional bounded contact details.",
    );
  }

  const phone = input.phone?.trim();
  const notes = input.notes?.trim();
  return {
    guestName: input.guestName.trim(),
    partySize: input.partySize,
    ...(phone ? { phone } : {}),
    ...(notes ? { notes } : {}),
  };
}

function validateResolution(resolution: WaitlistResolution): void {
  if (
    !resolution ||
    typeof resolution !== "object" ||
    Object.keys(resolution).some((key) => key !== "status" && key !== "tableId") ||
    !["seated", "cancelled", "no_show"].includes(resolution.status) ||
    (resolution.status === "seated" && !(resolution.tableId instanceof ObjectId)) ||
    (resolution.status !== "seated" && resolution.tableId !== undefined)
  ) {
    throw new WaitlistServiceError(
      400,
      "invalid_waitlist_update",
      "Seat an entry with a table ID, or resolve it as cancelled or no_show without a table ID.",
    );
  }
}

function mapRepositoryError(error: unknown): WaitlistServiceError | null {
  if (error instanceof WaitlistEntryConflictError) {
    return new WaitlistServiceError(
      409,
      "waitlist_entry_conflict",
      "The waitlist entry is no longer waiting. Reload the queue and try again.",
    );
  }
  if (error instanceof WaitlistTableNotFoundError) {
    return new WaitlistServiceError(404, "table_not_found", "The table was not found.");
  }
  if (error instanceof WaitlistTableUnavailableError) {
    return new WaitlistServiceError(
      409,
      "table_unavailable",
      "The table is not available for this party.",
    );
  }
  if (error instanceof WaitlistSynchronizationError) {
    return new WaitlistServiceError(
      503,
      "waitlist_update_incomplete",
      "The table and waitlist entry may not be synchronized. Reload both before retrying.",
    );
  }
  return null;
}

export class WaitlistService implements WaitlistServiceReader {
  constructor(
    private readonly repository: WaitlistRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly notifyHealthScoreRefresh: HealthScoreRefreshNotifier = () => undefined,
    private readonly notifyIncidentDetection: IncidentDetectionNotifier = () => undefined,
    private readonly publishRealtime: RestaurantRealtimePublisher = () => undefined,
  ) {}

  list(restaurantId: ObjectId) {
    return this.repository.listWaitingForRestaurant(restaurantId);
  }

  async add(restaurantId: ObjectId, input: WaitlistCreateInput): Promise<WaitlistRecord> {
    const normalized = normalizeCreateInput(input);
    const entry = await this.repository.addForRestaurant(restaurantId, normalized, this.clock());
    this.publishRealtime({
      restaurantId,
      event: "waitlist.updated",
      data: { waitlistId: entry.id.toHexString(), status: entry.status },
    });
    return entry;
  }

  async resolve(
    restaurantId: ObjectId,
    entryId: ObjectId,
    resolution: WaitlistResolution,
  ): Promise<WaitlistRecord> {
    validateResolution(resolution);
    let entry: WaitlistRecord | null;
    try {
      entry = await this.repository.resolveWaitingForRestaurant(
        restaurantId,
        entryId,
        resolution,
        this.clock(),
      );
    } catch (error) {
      const mapped = mapRepositoryError(error);
      if (mapped) throw mapped;
      throw error;
    }
    if (!entry) {
      throw new WaitlistServiceError(
        404,
        "waitlist_entry_not_found",
        "The waitlist entry was not found.",
      );
    }

    if (entry.status === "seated" && entry.tableId) {
      this.notifyHealthScoreRefresh(restaurantId);
      this.notifyIncidentDetection(restaurantId);
      this.publishRealtime({
        restaurantId,
        event: "table.updated",
        data: { tableId: entry.tableId.toHexString(), status: "occupied" },
      });
    }
    this.publishRealtime({
      restaurantId,
      event: "waitlist.updated",
      data: { waitlistId: entry.id.toHexString(), status: entry.status },
    });
    return entry;
  }
}
