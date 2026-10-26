import { type Request, type Response, Router } from "express";
import { type Db, ObjectId } from "mongodb";
import type { AuditRecorder } from "../audit/audit.service.js";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthPrincipal } from "../auth/auth.service.js";
import { requirePermissions, requireRestaurantScope } from "../auth/authorization.middleware.js";
import { COLLECTIONS, type RestaurantDocument } from "../database/schema.js";
import {
  BOOKING_RULE_LIMITS,
  type BookingRules,
  BookingRulesError,
  parseBookingRules,
  resolveBookingRules,
} from "./booking-rules.js";

/** Manager settings for turn times, pacing and booking windows (S5-01). */

export interface BookingRulesRepository {
  /** Stored rules (undefined when never saved), or null for an unknown restaurant. */
  get(restaurantId: ObjectId): Promise<{ rules?: unknown } | null>;
  save(restaurantId: ObjectId, rules: BookingRules, now: Date): Promise<boolean>;
}

export interface BookingRulesRuntime {
  repository: BookingRulesRepository;
  verifyAccessToken: (token: string) => Promise<AuthPrincipal>;
  audit?: AuditRecorder;
  clock?: () => Date;
}

export interface BookingRulesRouterOptions {
  createRuntime: () => Promise<BookingRulesRuntime>;
}

export class MongoBookingRulesRepository implements BookingRulesRepository {
  private readonly restaurants;

  constructor(db: Db) {
    this.restaurants = db.collection<RestaurantDocument>(COLLECTIONS.restaurants);
  }

  async get(restaurantId: ObjectId): Promise<{ rules?: unknown } | null> {
    const restaurant = await this.restaurants.findOne(
      { _id: restaurantId },
      { projection: { bookingRules: 1 } },
    );
    if (!restaurant) return null;
    return restaurant.bookingRules ? { rules: restaurant.bookingRules } : {};
  }

  async save(restaurantId: ObjectId, rules: BookingRules, now: Date): Promise<boolean> {
    const result = await this.restaurants.updateOne(
      { _id: restaurantId },
      { $set: { bookingRules: rules, updatedAt: now } },
    );
    return result.matchedCount > 0;
  }
}

function sendUnavailable(response: Response): void {
  response.status(503).json({
    error: {
      code: "booking_rules_unavailable",
      message: "Booking rules are temporarily unavailable.",
    },
  });
}

function sendNotFound(response: Response): void {
  response.status(404).json({
    error: { code: "restaurant_not_found", message: "The restaurant was not found." },
  });
}

export function createBookingRulesRouter(options: BookingRulesRouterOptions): Router {
  const router = Router();
  const runtimes = new WeakMap<Request, BookingRulesRuntime>();

  router.use(async (request, response, next) => {
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
    requirePermissions("reservations:read"),
    requireRestaurantScope(),
    async (request: Request, response: Response) => {
      const runtime = runtimes.get(request);
      const restaurantId = request.auth?.restaurantId;
      if (!runtime || !restaurantId) {
        sendUnavailable(response);
        return;
      }
      try {
        const stored = await runtime.repository.get(new ObjectId(restaurantId));
        if (!stored) {
          sendNotFound(response);
          return;
        }
        response.status(200).json({
          rules: resolveBookingRules(stored.rules),
          usingDefaults: stored.rules === undefined,
          limits: BOOKING_RULE_LIMITS,
        });
      } catch {
        sendUnavailable(response);
      }
    },
  );

  router.put(
    "/",
    requirePermissions("restaurant:write"),
    requireRestaurantScope(),
    async (request: Request, response: Response) => {
      const runtime = runtimes.get(request);
      const principal = request.auth;
      if (!runtime || !principal?.restaurantId) {
        sendUnavailable(response);
        return;
      }
      let rules: BookingRules;
      try {
        rules = parseBookingRules(request.body);
      } catch (error) {
        response.status(400).json({
          error: {
            code: "invalid_booking_rules",
            message:
              error instanceof BookingRulesError ? error.message : "The booking rules are invalid.",
          },
        });
        return;
      }
      const restaurantId = new ObjectId(principal.restaurantId);
      try {
        const before = await runtime.repository.get(restaurantId);
        if (!before) {
          sendNotFound(response);
          return;
        }
        const now = runtime.clock?.() ?? new Date();
        if (!(await runtime.repository.save(restaurantId, rules, now))) {
          sendNotFound(response);
          return;
        }
        await runtime.audit?.({
          restaurantId,
          actor: { userId: new ObjectId(principal.userId), role: principal.role },
          action: "restaurant.booking_rules_changed",
          target: { type: "restaurant", id: restaurantId, label: "Booking rules" },
          before: { ...resolveBookingRules(before.rules) },
          after: { ...rules },
        });
        response.status(200).json({ rules, usingDefaults: false, limits: BOOKING_RULE_LIMITS });
      } catch {
        sendUnavailable(response);
      }
    },
  );

  return router;
}
