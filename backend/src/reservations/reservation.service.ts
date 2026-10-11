import type { ObjectId } from "mongodb";
import type { HealthScoreRefreshNotifier } from "../healthscore/health-score.types.js";
import type { IncidentDetectionNotifier } from "../incidents/incident.types.js";
import type {
  CustomerReservationRequest,
  CustomerReservationUpdate,
  NewReservation,
  ReservationRecord,
  ReservationRepository,
  ReservationSchedule,
  ReservationServiceReader,
  StaffReservationRequest,
  StaffReservationUpdate,
} from "./reservation.types.js";

export const RESERVATION_DURATION_MS = 90 * 60_000;
export const RESERVATION_SLOT_MINUTES = 30;
export const RESERVATION_MAX_PARTY_SIZE = 12;
export const RESERVATION_NOTES_MAX_LENGTH = 500;
export const RESERVATION_NO_SHOW_GRACE_MS = 15 * 60_000;

const DISABLED_TABLE_STATUSES = new Set(["disabled", "out_of_service", "out-of-service"]);
const ALLOWED_STATUS_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  Awaiting: ["Confirmed", "Cancelled"],
  Confirmed: ["Seated", "Cancelled", "NoShow"],
  Seated: ["Completed"],
  Completed: [],
  Cancelled: [],
  NoShow: [],
};

export class ReservationError extends Error {
  constructor(
    readonly statusCode: 400 | 403 | 404 | 409 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ReservationError";
  }
}

export class ReservationService implements ReservationServiceReader {
  constructor(
    private readonly repository: ReservationRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly notifyHealthScoreRefresh: HealthScoreRefreshNotifier = () => undefined,
    private readonly notifyIncidentDetection: IncidentDetectionNotifier = () => undefined,
  ) {}

  async listForCustomer(userId: ObjectId) {
    const customerId = await this.customerIdForUser(userId);
    return this.repository.listForCustomer(customerId);
  }

  listForRestaurant(restaurantId: ObjectId) {
    return this.repository.listForRestaurant(restaurantId);
  }

  async createForCustomer(request: CustomerReservationRequest): Promise<ReservationRecord> {
    const now = this.clock();
    const customerId = await this.customerIdForUser(request.userId, now);
    const { endAt } = await this.validateRequestedTime(request.restaurantId, request.startAt, now);
    validatePartySize(request.partySize);
    const notes = validateNotes(request.notes);

    const reservation: NewReservation = {
      restaurantId: request.restaurantId,
      customerId,
      partySize: request.partySize,
      startAt: request.startAt,
      endAt,
      tableId: null,
      status: "Awaiting",
      ...(notes === undefined ? {} : { notes }),
    };
    const created = await this.repository.createReservation(reservation, now);
    this.notifyHealthScoreRefresh(request.restaurantId);
    this.notifyIncidentDetection(request.restaurantId);
    return created;
  }

  async createForStaff(request: StaffReservationRequest): Promise<ReservationRecord> {
    const now = this.clock();
    const { endAt } = await this.validateRequestedTime(request.restaurantId, request.startAt, now);
    validatePartySize(request.partySize);
    const notes = validateNotes(request.notes);

    if (!(await this.repository.customerExists(request.customerId))) {
      throw new ReservationError(404, "customer_not_found", "The customer was not found.");
    }

    if (request.tableId) {
      await this.validateTableAssignment(
        request.restaurantId,
        request.tableId,
        request.partySize,
        request.startAt,
        endAt,
      );
    }

    const reservation: NewReservation = {
      restaurantId: request.restaurantId,
      customerId: request.customerId,
      partySize: request.partySize,
      startAt: request.startAt,
      endAt,
      tableId: request.tableId ?? null,
      status: request.tableId ? "Confirmed" : "Awaiting",
      ...(notes === undefined ? {} : { notes }),
    };
    const created = await this.repository.createReservation(reservation, now);
    this.notifyHealthScoreRefresh(request.restaurantId);
    this.notifyIncidentDetection(request.restaurantId);
    return created;
  }

  async updateForCustomer(request: CustomerReservationUpdate): Promise<ReservationRecord> {
    const now = this.clock();
    const customerId = await this.customerIdForUser(request.userId, now);
    const current = await this.repository.findForCustomer(request.reservationId, customerId);
    if (!current) {
      throw new ReservationError(404, "reservation_not_found", "The reservation was not found.");
    }
    if (current.startAt <= now) {
      throw new ReservationError(
        409,
        "reservation_cannot_be_cancelled",
        "A reservation can only be cancelled before its start time.",
      );
    }
    validateStatusTransition(current.status, request.status, current.startAt, now);

    const updated = await this.repository.updateForCustomer(
      current.id,
      customerId,
      current.updatedAt,
      { status: request.status },
      now,
    );
    if (!updated) throw changedReservationError();
    this.notifyHealthScoreRefresh(current.restaurantId);
    this.notifyIncidentDetection(current.restaurantId);
    return updated;
  }

  async updateForStaff(request: StaffReservationUpdate): Promise<ReservationRecord> {
    const now = this.clock();
    const current = await this.repository.findForRestaurant(
      request.reservationId,
      request.restaurantId,
    );
    if (!current) {
      throw new ReservationError(404, "reservation_not_found", "The reservation was not found.");
    }

    const changes = { ...request.changes };
    const nextStartAt = changes.startAt ?? current.startAt;
    const nextPartySize = changes.partySize ?? current.partySize;
    const startOrPartyChanged =
      nextStartAt.getTime() !== current.startAt.getTime() || nextPartySize !== current.partySize;
    let nextEndAt = current.endAt;

    if (startOrPartyChanged) {
      validatePartySize(nextPartySize);
      const validated = await this.validateRequestedTime(request.restaurantId, nextStartAt, now);
      nextEndAt = validated.endAt;
      changes.startAt = nextStartAt;
      changes.endAt = nextEndAt;
    }

    if (changes.status !== undefined) {
      validateStatusTransition(current.status, changes.status, nextStartAt, now);
    }
    if (changes.notes !== undefined) changes.notes = validateNotes(changes.notes);

    const nextTableId = Object.hasOwn(changes, "tableId") ? changes.tableId : current.tableId;
    if (nextTableId) {
      const assignmentChanged =
        !current.tableId || !nextTableId.equals(current.tableId) || startOrPartyChanged;
      if (assignmentChanged) {
        await this.validateTableAssignment(
          request.restaurantId,
          nextTableId,
          nextPartySize,
          nextStartAt,
          nextEndAt,
          current.id,
        );
      }
    }

    const updated = await this.repository.updateForRestaurant(
      current.id,
      request.restaurantId,
      current.updatedAt,
      changes,
      now,
    );
    if (!updated) throw changedReservationError();
    this.notifyHealthScoreRefresh(request.restaurantId);
    this.notifyIncidentDetection(request.restaurantId);
    return updated;
  }

  private async customerIdForUser(userId: ObjectId, now = this.clock()): Promise<ObjectId> {
    const customerId = await this.repository.getCustomerIdForUser(userId, now);
    if (!customerId) {
      throw new ReservationError(
        403,
        "customer_profile_required",
        "An active customer account is required to manage reservations.",
      );
    }
    return customerId;
  }

  private async validateRequestedTime(
    restaurantId: ObjectId,
    startAt: Date,
    now: Date,
  ): Promise<{ schedule: ReservationSchedule; endAt: Date }> {
    if (!(startAt instanceof Date) || !Number.isFinite(startAt.getTime())) {
      throw new ReservationError(
        400,
        "invalid_reservation_time",
        "A valid start time is required.",
      );
    }
    if (startAt <= now) {
      throw new ReservationError(
        400,
        "reservation_time_in_past",
        "Reservations must start in the future.",
      );
    }

    const schedule = await this.repository.getActiveRestaurant(restaurantId);
    if (!schedule) {
      throw new ReservationError(404, "restaurant_not_found", "The restaurant was not found.");
    }
    const endAt = new Date(startAt.getTime() + RESERVATION_DURATION_MS);
    validateSlotAndOperatingHours(startAt, endAt, schedule);
    return { schedule, endAt };
  }

  private async validateTableAssignment(
    restaurantId: ObjectId,
    tableId: ObjectId,
    partySize: number,
    startAt: Date,
    endAt: Date,
    excludingReservationId?: ObjectId,
  ): Promise<void> {
    const table = await this.repository.getTable(restaurantId, tableId);
    if (!table) {
      throw new ReservationError(404, "table_not_found", "The table was not found.");
    }
    if (DISABLED_TABLE_STATUSES.has(normalizeStatus(table.status))) {
      throw new ReservationError(
        409,
        "table_unavailable",
        "The table is not available for booking.",
      );
    }
    if (partySize > table.capacity) {
      throw new ReservationError(
        409,
        "table_capacity_exceeded",
        "The party size exceeds the table capacity.",
      );
    }
    if (
      await this.repository.hasTableConflict(
        restaurantId,
        tableId,
        startAt,
        endAt,
        excludingReservationId,
      )
    ) {
      throw new ReservationError(
        409,
        "reservation_table_conflict",
        "The table already has an overlapping reservation.",
      );
    }
  }
}

function validatePartySize(partySize: number): void {
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > RESERVATION_MAX_PARTY_SIZE) {
    throw new ReservationError(
      400,
      "invalid_party_size",
      `Party size must be a whole number between 1 and ${RESERVATION_MAX_PARTY_SIZE}.`,
    );
  }
}

function validateNotes(notes: string | undefined): string | undefined {
  if (notes === undefined) return undefined;
  const normalized = notes.trim();
  if (normalized.length > RESERVATION_NOTES_MAX_LENGTH) {
    throw new ReservationError(
      400,
      "reservation_notes_too_long",
      `Reservation notes must be ${RESERVATION_NOTES_MAX_LENGTH} characters or fewer.`,
    );
  }
  return normalized;
}

function validateStatusTransition(
  currentStatus: string,
  nextStatus: string,
  startAt: Date,
  now: Date,
): void {
  if (currentStatus === nextStatus) return;
  if (!ALLOWED_STATUS_TRANSITIONS[currentStatus]?.includes(nextStatus)) {
    throw new ReservationError(
      409,
      "invalid_reservation_transition",
      `A reservation cannot move from ${currentStatus} to ${nextStatus}.`,
    );
  }
  if (nextStatus === "NoShow" && now.getTime() < startAt.getTime() + RESERVATION_NO_SHOW_GRACE_MS) {
    throw new ReservationError(
      409,
      "reservation_no_show_too_early",
      "A reservation can only be marked as a no-show after the 15-minute grace period.",
    );
  }
}

function validateSlotAndOperatingHours(
  startAt: Date,
  endAt: Date,
  schedule: ReservationSchedule,
): void {
  const timeZone = schedule.timeZone.trim();
  let start: LocalReservationTime;
  let end: LocalReservationTime;
  try {
    start = localTime(startAt, timeZone);
    end = localTime(endAt, timeZone);
  } catch {
    throw new ReservationError(
      503,
      "restaurant_schedule_unavailable",
      "The restaurant schedule is temporarily unavailable.",
    );
  }

  if (
    start.minute % RESERVATION_SLOT_MINUTES !== 0 ||
    start.second !== 0 ||
    startAt.getMilliseconds() !== 0
  ) {
    throw new ReservationError(
      400,
      "invalid_reservation_slot",
      "Reservations must start on a 30-minute booking slot.",
    );
  }

  const hours = schedule.operatingHours;
  const opensAt = parseWallClock(hours?.opensAt);
  const closesAt = parseWallClock(hours?.closesAt);
  if (
    opensAt === null ||
    closesAt === null ||
    (opensAt === undefined) !== (closesAt === undefined)
  ) {
    throw new ReservationError(
      503,
      "restaurant_schedule_unavailable",
      "The restaurant operating hours are temporarily unavailable.",
    );
  }
  if (opensAt !== undefined && closesAt !== undefined) {
    const startMinutes = start.hour * 60 + start.minute;
    const endMinutes = end.hour * 60 + end.minute;
    if (
      start.weekday !== end.weekday ||
      startMinutes < opensAt ||
      endMinutes > closesAt ||
      end.second !== 0
    ) {
      throw new ReservationError(
        400,
        "outside_operating_hours",
        "The reservation must fit within the restaurant's operating hours.",
      );
    }
  }
}

interface LocalReservationTime {
  weekday: string;
  hour: number;
  minute: number;
  second: number;
}

function localTime(date: Date, timeZone: string): LocalReservationTime {
  if (!timeZone) throw new Error("Missing restaurant time zone.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const hour = Number(values.get("hour"));
  const minute = Number(values.get("minute"));
  const second = Number(values.get("second"));
  const weekday = values.get("weekday");
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    !weekday
  ) {
    throw new Error("The restaurant time zone could not be read.");
  }
  return { weekday, hour, minute, second };
}

function parseWallClock(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function normalizeStatus(value: string): string {
  return value.trim().toLowerCase().replaceAll(" ", "_");
}

function changedReservationError(): ReservationError {
  return new ReservationError(
    409,
    "reservation_changed",
    "The reservation changed during this request. Refresh and try again.",
  );
}
