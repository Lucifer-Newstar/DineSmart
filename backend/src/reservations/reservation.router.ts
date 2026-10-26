import {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
  Router,
} from "express";
import { ObjectId } from "mongodb";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthPrincipal } from "../auth/auth.service.js";
import { requirePermissions, requireRestaurantScope } from "../auth/authorization.middleware.js";
import { isObjectIdString, parseObjectId, requireObjectIdParam } from "../http/object-id-param.js";
import {
  AvailabilityNotFoundError,
  type AvailabilityReader,
  type DayAvailability,
  parseLocalDate,
} from "./availability.service.js";
import { RESERVATION_MAX_PARTY_SIZE, ReservationError } from "./reservation.service.js";
import type {
  ReservationOccasion,
  ReservationRecord,
  ReservationServiceReader,
  ReservationStatus,
} from "./reservation.types.js";

export interface ReservationRuntime {
  service: ReservationServiceReader;
  verifyAccessToken: (token: string) => Promise<AuthPrincipal>;
  /** Public slot lookup (S5-01); the route answers 503 when it is not wired. */
  availability?: AvailabilityReader;
}

export interface ReservationRouterOptions {
  createRuntime: () => Promise<ReservationRuntime>;
}

const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
const VALID_RESERVATION_STATUSES = new Set<ReservationStatus>([
  "Awaiting",
  "Confirmed",
  "Seated",
  "Completed",
  "Cancelled",
  "NoShow",
]);

function sendUnavailable(response: Response): void {
  response.status(503).json({
    error: {
      code: "reservation_unavailable",
      message: "Reservations are temporarily unavailable.",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function objectId(value: unknown): ObjectId | null {
  return parseObjectId(value);
}

function dateWithTimeZone(value: unknown): Date | null {
  if (typeof value !== "string" || !ISO_DATE_TIME_PATTERN.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Reads occasion and dietary notes; null clears them on update. Types only, rules in the service. */
function parseGuestDetails(
  value: Record<string, unknown>,
  target: { occasion?: ReservationOccasion | null; dietaryNotes?: string | null },
  allowNull: boolean,
): boolean {
  for (const key of ["occasion", "dietaryNotes"] as const) {
    const field = value[key];
    if (field === undefined) continue;
    if (field === null && allowNull) target[key] = null;
    else if (typeof field === "string") target[key] = field as never;
    else return false;
  }
  return true;
}

interface ParsedCreateBody {
  restaurantId?: ObjectId;
  customerId?: ObjectId;
  tableId?: ObjectId | null;
  partySize: number;
  startAt: Date;
  notes?: string;
  occasion?: ReservationOccasion | null;
  dietaryNotes?: string | null;
}

function parseCreateBody(value: unknown, role: AuthPrincipal["role"]): ParsedCreateBody | null {
  if (!isRecord(value)) return null;
  const isCustomer = role === "Customer";
  const allowedKeys = isCustomer
    ? ["restaurantId", "partySize", "startAt", "notes", "occasion", "dietaryNotes"]
    : [
        "restaurantId",
        "customerId",
        "tableId",
        "partySize",
        "startAt",
        "notes",
        "occasion",
        "dietaryNotes",
      ];
  if (!hasOnlyKeys(value, allowedKeys)) return null;

  if (typeof value.partySize !== "number" || !Number.isFinite(value.partySize)) return null;
  const startAt = dateWithTimeZone(value.startAt);
  if (!startAt) return null;

  const parsed: ParsedCreateBody = { partySize: value.partySize, startAt };
  if (isCustomer) {
    const restaurantId = objectId(value.restaurantId);
    if (!restaurantId) return null;
    parsed.restaurantId = restaurantId;
  } else {
    if (value.restaurantId !== undefined && typeof value.restaurantId !== "string") return null;
    const customerId = objectId(value.customerId);
    if (!customerId) return null;
    parsed.customerId = customerId;
    if (value.tableId !== undefined) {
      if (value.tableId === null) parsed.tableId = null;
      else {
        const tableId = objectId(value.tableId);
        if (!tableId) return null;
        parsed.tableId = tableId;
      }
    }
  }
  if (value.notes !== undefined) {
    if (typeof value.notes !== "string") return null;
    parsed.notes = value.notes;
  }
  if (!parseGuestDetails(value, parsed, false)) return null;
  return parsed;
}

interface ParsedUpdateBody {
  status?: ReservationStatus;
  tableId?: ObjectId | null;
  partySize?: number;
  startAt?: Date;
  notes?: string;
  occasion?: ReservationOccasion | null;
  dietaryNotes?: string | null;
}

function parseUpdateBody(value: unknown, role: AuthPrincipal["role"]): ParsedUpdateBody | null {
  if (!isRecord(value) || Object.keys(value).length === 0) return null;
  if (
    !hasOnlyKeys(value, [
      "status",
      "tableId",
      "partySize",
      "startAt",
      "notes",
      "occasion",
      "dietaryNotes",
    ])
  ) {
    return null;
  }
  // Customers may cancel, or move their own booking's time, party size or notes (S5-01).
  if (role === "Customer" && Object.hasOwn(value, "tableId")) return null;
  if (role === "Customer" && value.status !== undefined && Object.keys(value).length > 1) {
    return null;
  }

  const parsed: ParsedUpdateBody = {};
  if (value.status !== undefined) {
    if (
      typeof value.status !== "string" ||
      !VALID_RESERVATION_STATUSES.has(value.status as ReservationStatus)
    ) {
      return null;
    }
    if (role === "Customer" && value.status !== "Cancelled") return null;
    parsed.status = value.status as ReservationStatus;
  }
  if (value.tableId !== undefined) {
    if (value.tableId === null) parsed.tableId = null;
    else {
      const tableId = objectId(value.tableId);
      if (!tableId) return null;
      parsed.tableId = tableId;
    }
  }
  if (value.partySize !== undefined) {
    if (typeof value.partySize !== "number" || !Number.isFinite(value.partySize)) return null;
    parsed.partySize = value.partySize;
  }
  if (value.startAt !== undefined) {
    const startAt = dateWithTimeZone(value.startAt);
    if (!startAt) return null;
    parsed.startAt = startAt;
  }
  if (value.notes !== undefined) {
    if (typeof value.notes !== "string") return null;
    parsed.notes = value.notes;
  }
  if (!parseGuestDetails(value, parsed, true)) return null;
  if (Object.keys(parsed).length === 0) return null;
  return parsed;
}

function sendReservationError(error: unknown, response: Response): void {
  if (error instanceof ReservationError) {
    response.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }
  sendUnavailable(response);
}

function requireReservationPermission(
  customerPermission:
    | "reservations:own:create"
    | "reservations:own:read"
    | "reservations:own:update",
  staffPermission: "reservations:read" | "reservations:write",
): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (request.auth?.role === "Customer") {
      requirePermissions(customerPermission)(request, response, next);
      return;
    }
    requirePermissions(staffPermission)(request, response, () => {
      requireRestaurantScope()(request, response, next);
    });
  };
}

function parseAvailabilityQuery(query: Request["query"]) {
  const restaurantId = objectId(query.restaurantId);
  const date = typeof query.date === "string" ? query.date : undefined;
  const partySizeText = typeof query.partySize === "string" ? query.partySize : undefined;
  if (!restaurantId || !date || !parseLocalDate(date) || !partySizeText) return null;
  if (!/^\d{1,3}$/.test(partySizeText)) return null;
  return { restaurantId, date, partySize: Number(partySizeText) };
}

function availabilityToJson(day: DayAvailability) {
  return {
    date: day.date,
    partySize: day.partySize,
    timeZone: day.timeZone,
    turnMinutes: day.turnMinutes,
    slots: day.slots.map((slot) => ({
      startAt: slot.startAt.toISOString(),
      endAt: slot.endAt.toISOString(),
      localTime: slot.localTime,
      available: slot.available,
      ...(slot.reason === undefined ? {} : { reason: slot.reason }),
    })),
  };
}

function toJson(reservation: ReservationRecord) {
  return {
    id: reservation.id.toHexString(),
    restaurantId: reservation.restaurantId.toHexString(),
    restaurantName: reservation.restaurantName,
    guestName: reservation.guestName,
    partySize: reservation.partySize,
    startAt: reservation.startAt.toISOString(),
    endAt: reservation.endAt.toISOString(),
    tableId: reservation.tableId?.toHexString() ?? null,
    tableNumber: reservation.tableNumber,
    status: reservation.status,
    ...(reservation.notes === undefined ? {} : { notes: reservation.notes }),
    ...(reservation.occasion ? { occasion: reservation.occasion } : {}),
    ...(reservation.dietaryNotes ? { dietaryNotes: reservation.dietaryNotes } : {}),
    createdAt: reservation.createdAt.toISOString(),
    updatedAt: reservation.updatedAt.toISOString(),
  };
}

export function createReservationRouter(options: ReservationRouterOptions): Router {
  const router = Router();
  const runtimes = new WeakMap<Request, ReservationRuntime>();

  // Public: guests pick a slot before they sign in, so this route sits ahead of auth.
  router.get("/availability", async (request: Request, response: Response) => {
    const query = parseAvailabilityQuery(request.query);
    if (!query) {
      response.status(400).json({
        error: {
          code: "invalid_availability_query",
          message: "Provide a restaurant ID, a YYYY-MM-DD date and a party size.",
        },
      });
      return;
    }
    if (query.partySize < 1 || query.partySize > RESERVATION_MAX_PARTY_SIZE) {
      response.status(400).json({
        error: {
          code: "invalid_party_size",
          message: `Party size must be a whole number between 1 and ${RESERVATION_MAX_PARTY_SIZE}.`,
        },
      });
      return;
    }
    try {
      const runtime = await options.createRuntime();
      if (!runtime.availability) {
        sendUnavailable(response);
        return;
      }
      const day = await runtime.availability.getDay(query);
      response.status(200).json(availabilityToJson(day));
    } catch (error) {
      if (error instanceof AvailabilityNotFoundError) {
        response.status(404).json({
          error: { code: "restaurant_not_found", message: "The restaurant was not found." },
        });
        return;
      }
      sendReservationError(error, response);
    }
  });

  router.use(async (request: Request, response: Response, next: NextFunction) => {
    try {
      const runtime = await options.createRuntime();
      runtimes.set(request, runtime);
      authenticateAccessToken(runtime.verifyAccessToken)(request, response, next);
    } catch {
      sendUnavailable(response);
    }
  });

  router.get(
    "/",
    requireReservationPermission("reservations:own:read", "reservations:read"),
    async (request: Request, response: Response) => {
      const runtime = runtimes.get(request);
      const principal = request.auth;
      if (!runtime || !principal) {
        response.status(401).json({
          error: { code: "missing_access_token", message: "Authentication is required." },
        });
        return;
      }

      try {
        const result =
          principal.role === "Customer"
            ? await runtime.service.listForCustomer(asObjectId(principal.userId))
            : await runtime.service.listForRestaurant(asObjectId(principal.restaurantId));
        response.status(200).json({
          reservations: result.reservations.map(toJson),
          truncated: result.truncated,
        });
      } catch (error) {
        sendReservationError(error, response);
      }
    },
  );

  router.post(
    "/",
    requireReservationPermission("reservations:own:create", "reservations:write"),
    async (request: Request, response: Response) => {
      const runtime = runtimes.get(request);
      const principal = request.auth;
      if (!runtime || !principal) {
        response.status(401).json({
          error: { code: "missing_access_token", message: "Authentication is required." },
        });
        return;
      }

      const body = parseCreateBody(request.body, principal.role);
      if (!body) {
        response.status(400).json({
          error: {
            code: "invalid_reservation_request",
            message:
              "Provide a restaurant, customer, party size, and timezone-qualified start time.",
          },
        });
        return;
      }

      try {
        const reservation =
          principal.role === "Customer"
            ? await runtime.service.createForCustomer({
                userId: asObjectId(principal.userId),
                restaurantId: body.restaurantId as ObjectId,
                partySize: body.partySize,
                startAt: body.startAt,
                ...(body.notes === undefined ? {} : { notes: body.notes }),
                ...guestDetailsOf(body),
              })
            : await runtime.service.createForStaff({
                restaurantId: asObjectId(principal.restaurantId),
                customerId: body.customerId as ObjectId,
                partySize: body.partySize,
                startAt: body.startAt,
                ...(body.tableId === undefined ? {} : { tableId: body.tableId }),
                ...(body.notes === undefined ? {} : { notes: body.notes }),
                ...guestDetailsOf(body),
              });
        response.status(201).json({ reservation: toJson(reservation) });
      } catch (error) {
        sendReservationError(error, response);
      }
    },
  );

  router.put(
    "/:id",
    requireReservationPermission("reservations:own:update", "reservations:write"),
    requireObjectIdParam("id", "invalid_reservation_id", "A valid reservation ID is required."),
    async (request: Request, response: Response) => {
      const runtime = runtimes.get(request);
      const principal = request.auth;
      if (!runtime || !principal) {
        response.status(401).json({
          error: { code: "missing_access_token", message: "Authentication is required." },
        });
        return;
      }
      const reservationId = objectId(request.params.id);
      if (!reservationId) {
        response.status(400).json({
          error: { code: "invalid_reservation_id", message: "A valid reservation ID is required." },
        });
        return;
      }
      const changes = parseUpdateBody(request.body, principal.role);
      if (!changes) {
        response.status(400).json({
          error: {
            code: "invalid_reservation_update",
            message: "Provide supported reservation fields with valid values.",
          },
        });
        return;
      }

      try {
        const reservation =
          principal.role === "Customer"
            ? await runtime.service.updateForCustomer({
                userId: asObjectId(principal.userId),
                reservationId,
                ...(changes.status === "Cancelled" ? { status: "Cancelled" as const } : {}),
                ...(changes.startAt === undefined ? {} : { startAt: changes.startAt }),
                ...(changes.partySize === undefined ? {} : { partySize: changes.partySize }),
                ...(changes.notes === undefined ? {} : { notes: changes.notes }),
                ...guestDetailsOf(changes),
              })
            : await runtime.service.updateForStaff({
                restaurantId: asObjectId(principal.restaurantId),
                reservationId,
                changes,
              });
        response.status(200).json({ reservation: toJson(reservation) });
      } catch (error) {
        sendReservationError(error, response);
      }
    },
  );

  return router;
}

function guestDetailsOf(source: {
  occasion?: ReservationOccasion | null;
  dietaryNotes?: string | null;
}) {
  return {
    ...(source.occasion === undefined ? {} : { occasion: source.occasion }),
    ...(source.dietaryNotes === undefined ? {} : { dietaryNotes: source.dietaryNotes }),
  };
}

function asObjectId(value: string | null): ObjectId {
  if (!isObjectIdString(value)) throw new Error("Invalid authenticated identifier.");
  return new ObjectId(value);
}
