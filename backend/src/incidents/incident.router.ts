import { type NextFunction, type Request, type Response, Router } from "express";
import { ObjectId } from "mongodb";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthPrincipal } from "../auth/auth.service.js";
import { requirePermissions, requireRestaurantScope } from "../auth/authorization.middleware.js";
import type { IncidentRecord, IncidentServiceReader } from "./incident.types.js";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const SAFE_TRIGGER_FIELDS = new Set([
  "elapsedMinutes",
  "thresholdMinutes",
  "queueLength",
  "activeOrderCount",
  "oldestActiveOrderMinutes",
  "available",
  "lowStockThreshold",
  "unit",
  "partySize",
  "conflictCount",
  "capacity",
  "tableStatus",
]);

export interface IncidentRuntime {
  service: IncidentServiceReader;
  verifyAccessToken: (token: string) => Promise<AuthPrincipal>;
}

export interface IncidentRouterOptions {
  createRuntime: () => Promise<IncidentRuntime>;
}

function sendUnavailable(response: Response): void {
  response.status(503).json({
    error: {
      code: "incidents_unavailable",
      message: "Incidents are temporarily unavailable.",
    },
  });
}

function safeTriggerSnapshot(
  snapshot: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (!SAFE_TRIGGER_FIELDS.has(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) safe[key] = value;
    else if (typeof value === "boolean") safe[key] = value;
    else if (typeof value === "string" && value.length <= 80) {
      safe[key] = value.replace(/[\r\n]/g, " ");
    }
  }
  return safe;
}

function toJson(incident: IncidentRecord) {
  return {
    id: incident.id.toHexString(),
    type: incident.type,
    severity: incident.severity,
    status: incident.status,
    triggerSnapshot: safeTriggerSnapshot(incident.triggerSnapshot as Record<string, unknown>),
    affectedEntity: {
      type: incident.affectedEntity.type,
      id: incident.affectedEntity.id.toHexString(),
    },
    ...(incident.rootCause === undefined ? {} : { rootCause: incident.rootCause.slice(0, 500) }),
    createdAt: incident.createdAt.toISOString(),
    updatedAt: incident.updatedAt.toISOString(),
    resolvedAt: incident.resolvedAt?.toISOString() ?? null,
    resolutionReason: incident.resolutionReason ?? null,
  };
}

export function createIncidentRouter(options: IncidentRouterOptions): Router {
  const router = Router();
  const runtimes = new WeakMap<Request, IncidentRuntime>();

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
    requirePermissions("incidents:read"),
    requireRestaurantScope(),
    async (request, response) => {
      const runtime = runtimes.get(request);
      const restaurantId = request.auth?.restaurantId;
      if (Object.keys(request.query).length > 0) {
        response.status(400).json({
          error: {
            code: "invalid_incident_query",
            message: "Incidents do not accept client-selected filters.",
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
        const result = await runtime.service.listForRestaurant(new ObjectId(restaurantId));
        response.status(200).json({
          incidents: result.incidents.map(toJson),
          truncated: result.truncated,
        });
      } catch {
        sendUnavailable(response);
      }
    },
  );

  return router;
}
