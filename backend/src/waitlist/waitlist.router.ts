import { type NextFunction, type Request, type Response, Router } from "express";
import { ObjectId } from "mongodb";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthPrincipal } from "../auth/auth.service.js";
import { requirePermissions, requireRestaurantScope } from "../auth/authorization.middleware.js";
import { isObjectIdString, requireObjectIdParam } from "../http/object-id-param.js";
import type { WaitQuoter } from "./wait-estimate.js";
import { WaitlistServiceError } from "./waitlist.service.js";
import type { WaitlistCreateInput, WaitlistServiceReader } from "./waitlist.types.js";
import { WAITLIST_MAX_PARTY_SIZE } from "./waitlist.types.js";

export interface WaitlistRuntime {
  service: WaitlistServiceReader;
  verifyAccessToken: (token: string) => Promise<AuthPrincipal>;
  /** Walk-in wait quotes (S5-01); entries carry no quote when it is not wired. */
  quoter?: WaitQuoter;
}

export interface WaitlistRouterOptions {
  createRuntime: () => Promise<WaitlistRuntime>;
}

const RESOLUTION_STATUSES = ["seated", "cancelled", "no_show"] as const;

type WaitlistResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCreate(value: unknown): WaitlistCreateInput | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (
    keys.length < 2 ||
    keys.some((key) => !["guestName", "partySize", "phone", "notes"].includes(key)) ||
    typeof value.guestName !== "string" ||
    !Number.isInteger(value.partySize) ||
    (value.phone !== undefined && typeof value.phone !== "string") ||
    (value.notes !== undefined && typeof value.notes !== "string")
  ) {
    return null;
  }
  return {
    guestName: value.guestName,
    partySize: value.partySize as number,
    ...(value.phone === undefined ? {} : { phone: value.phone as string }),
    ...(value.notes === undefined ? {} : { notes: value.notes as string }),
  };
}

function parseResolution(
  value: unknown,
): { status: WaitlistResolutionStatus; tableId?: ObjectId } | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (
    keys.length === 0 ||
    keys.some((key) => key !== "status" && key !== "tableId") ||
    typeof value.status !== "string" ||
    !(RESOLUTION_STATUSES as readonly string[]).includes(value.status)
  ) {
    return null;
  }

  if (value.status === "seated") {
    if (!isObjectIdString(value.tableId)) return null;
    return { status: "seated", tableId: new ObjectId(value.tableId) };
  }
  if (value.tableId !== undefined) return null;
  return { status: value.status as WaitlistResolutionStatus };
}

function sendUnavailable(response: Response): void {
  response.status(503).json({
    error: {
      code: "waitlist_unavailable",
      message: "Waitlist management is temporarily unavailable.",
    },
  });
}

function sendWaitlistError(error: unknown, response: Response): void {
  if (error instanceof WaitlistServiceError) {
    response.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
    return;
  }
  sendUnavailable(response);
}

function toResponse(
  entry: Awaited<ReturnType<WaitlistServiceReader["list"]>>["entries"][number],
  quotedWaitMinutes?: number,
) {
  return {
    id: entry.id.toHexString(),
    guestName: entry.guestName,
    partySize: entry.partySize,
    ...(entry.phone === undefined ? {} : { phone: entry.phone }),
    ...(entry.notes === undefined ? {} : { notes: entry.notes }),
    status: entry.status,
    ...(entry.tableId === undefined ? {} : { tableId: entry.tableId.toHexString() }),
    ...(entry.seatedAt === undefined ? {} : { seatedAt: entry.seatedAt.toISOString() }),
    ...(quotedWaitMinutes === undefined ? {} : { quotedWaitMinutes }),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

/** Quotes are a convenience: a missing or failed quote never fails the waitlist request. */
async function queueQuotes(
  quoter: WaitQuoter | undefined,
  restaurantId: ObjectId,
): Promise<Map<string, number> | undefined> {
  if (!quoter) return undefined;
  try {
    return await quoter.quoteQueue(restaurantId);
  } catch {
    return undefined;
  }
}

export function createWaitlistRouter(options: WaitlistRouterOptions): Router {
  const router = Router();
  const runtimes = new WeakMap<Request, WaitlistRuntime>();

  // Public: guests see the current walk-in wait before they arrive or join.
  router.get("/estimate", async (request: Request, response: Response) => {
    const restaurantId =
      typeof request.query.restaurantId === "string" && ObjectId.isValid(request.query.restaurantId)
        ? new ObjectId(request.query.restaurantId)
        : null;
    const sizeText = typeof request.query.partySize === "string" ? request.query.partySize : "";
    const partySize = /^\d{1,2}$/.test(sizeText) ? Number(sizeText) : Number.NaN;
    if (
      !restaurantId ||
      !Number.isInteger(partySize) ||
      partySize < 1 ||
      partySize > WAITLIST_MAX_PARTY_SIZE
    ) {
      response.status(400).json({
        error: {
          code: "invalid_wait_estimate_query",
          message: `Provide a restaurant ID and a party size from 1 to ${WAITLIST_MAX_PARTY_SIZE}.`,
        },
      });
      return;
    }
    try {
      const runtime = await options.createRuntime();
      if (!runtime.quoter) {
        sendUnavailable(response);
        return;
      }
      const minutes = await runtime.quoter.quoteNewParty(restaurantId, partySize);
      if (minutes === null) {
        response.status(404).json({
          error: { code: "restaurant_not_found", message: "The restaurant was not found." },
        });
        return;
      }
      response.status(200).json({ partySize, quotedWaitMinutes: minutes });
    } catch {
      sendUnavailable(response);
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
    requirePermissions("waitlist:read"),
    requireRestaurantScope(),
    async (request: Request, response: Response) => {
      const restaurantId = request.auth?.restaurantId;
      const runtime = runtimes.get(request);
      if (!restaurantId || !runtime) {
        response.status(401).json({
          error: { code: "missing_access_token", message: "Authentication is required." },
        });
        return;
      }
      if (Object.keys(request.query).length > 0) {
        response.status(400).json({
          error: { code: "invalid_waitlist_query", message: "Waitlist filters are not supported." },
        });
        return;
      }

      try {
        const result = await runtime.service.list(new ObjectId(restaurantId));
        const quotes = await queueQuotes(runtime.quoter, new ObjectId(restaurantId));
        response.set("Cache-Control", "no-store");
        response.status(200).json({
          entries: result.entries.map((entry) =>
            toResponse(entry, quotes?.get(entry.id.toHexString())),
          ),
          truncated: result.truncated,
        });
      } catch (error) {
        sendWaitlistError(error, response);
      }
    },
  );

  router.post(
    "/",
    requirePermissions("waitlist:write"),
    requireRestaurantScope(),
    async (request: Request, response: Response) => {
      const restaurantId = request.auth?.restaurantId;
      const runtime = runtimes.get(request);
      if (!restaurantId || !runtime) {
        response.status(401).json({
          error: { code: "missing_access_token", message: "Authentication is required." },
        });
        return;
      }
      if (Object.keys(request.query).length > 0) {
        response.status(400).json({
          error: { code: "invalid_waitlist_query", message: "Waitlist filters are not supported." },
        });
        return;
      }
      const input = parseCreate(request.body);
      if (!input) {
        response.status(400).json({
          error: {
            code: "invalid_waitlist_entry",
            message: "Provide only a guest name, party size, and optional phone or notes.",
          },
        });
        return;
      }

      try {
        const entry = await runtime.service.add(new ObjectId(restaurantId), input);
        const quotes = await queueQuotes(runtime.quoter, new ObjectId(restaurantId));
        response.set("Cache-Control", "no-store");
        response
          .status(201)
          .json({ entry: toResponse(entry, quotes?.get(entry.id.toHexString())) });
      } catch (error) {
        sendWaitlistError(error, response);
      }
    },
  );

  router.put(
    "/:id",
    requirePermissions("waitlist:write"),
    requireRestaurantScope(),
    requireObjectIdParam("id", "invalid_waitlist_id", "A valid waitlist entry ID is required."),
    async (request: Request, response: Response) => {
      const restaurantId = request.auth?.restaurantId;
      const runtime = runtimes.get(request);
      if (!restaurantId || !runtime) {
        response.status(401).json({
          error: { code: "missing_access_token", message: "Authentication is required." },
        });
        return;
      }
      const rawEntryId = request.params.id;
      const entryId = Array.isArray(rawEntryId) ? rawEntryId[0] : rawEntryId;
      if (Object.keys(request.query).length > 0) {
        response.status(400).json({
          error: { code: "invalid_waitlist_query", message: "Waitlist filters are not supported." },
        });
        return;
      }
      const resolution = parseResolution(request.body);
      if (!resolution) {
        response.status(400).json({
          error: {
            code: "invalid_waitlist_update",
            message: "Seat with a valid table ID, or resolve as cancelled or no_show.",
          },
        });
        return;
      }

      try {
        const entry = await runtime.service.resolve(
          new ObjectId(restaurantId),
          new ObjectId(entryId),
          resolution,
        );
        response.set("Cache-Control", "no-store");
        response.status(200).json({ entry: toResponse(entry) });
      } catch (error) {
        sendWaitlistError(error, response);
      }
    },
  );

  return router;
}
