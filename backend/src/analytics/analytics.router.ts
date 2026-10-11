import { type NextFunction, type Request, type Response, Router } from "express";
import { ObjectId } from "mongodb";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthPrincipal } from "../auth/auth.service.js";
import { requirePermissions, requireRestaurantScope } from "../auth/authorization.middleware.js";
import {
  ANALYTICS_RANGES,
  type AnalyticsRange,
  type AnalyticsServiceReader,
} from "./analytics.types.js";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export interface AnalyticsRuntime {
  service: AnalyticsServiceReader;
  verifyAccessToken: (token: string) => Promise<AuthPrincipal>;
}

export interface AnalyticsRouterOptions {
  createRuntime: () => Promise<AnalyticsRuntime>;
}

function sendUnavailable(response: Response): void {
  response.status(503).json({
    error: {
      code: "analytics_unavailable",
      message: "Analytics are temporarily unavailable.",
    },
  });
}

function requestedRange(request: Request): AnalyticsRange | null {
  const queryKeys = Object.keys(request.query);
  if (queryKeys.some((key) => key !== "range") || queryKeys.length > 1) return null;
  if (request.query.range === undefined) return "7d";
  if (typeof request.query.range !== "string") return null;
  return ANALYTICS_RANGES.find((range) => range === request.query.range) ?? null;
}

export function createAnalyticsRouter(options: AnalyticsRouterOptions): Router {
  const router = Router();
  const runtimes = new WeakMap<Request, AnalyticsRuntime>();

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
    requirePermissions("analytics:read"),
    requireRestaurantScope(),
    async (request: Request, response: Response) => {
      const runtime = runtimes.get(request);
      const restaurantId = request.auth?.restaurantId;
      const range = requestedRange(request);
      if (range === null) {
        response.status(400).json({
          error: {
            code: "invalid_analytics_query",
            message: "Only one range value of 7d or 30d is supported.",
          },
        });
        return;
      }
      if (!runtime || !restaurantId || !OBJECT_ID_PATTERN.test(restaurantId)) {
        response.status(403).json({
          error: {
            code: "restaurant_scope_required",
            message: "A valid restaurant-scoped account is required.",
          },
        });
        return;
      }

      try {
        response
          .status(200)
          .json(await runtime.service.getAnalytics(new ObjectId(restaurantId), range));
      } catch {
        sendUnavailable(response);
      }
    },
  );

  return router;
}
