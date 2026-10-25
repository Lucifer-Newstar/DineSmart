import { type Request, type Response, Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import { requirePermissions, requireRestaurantScope } from "../auth/authorization.middleware.js";
import type { RecommendationDocument } from "../database/schema.js";
import { requireObjectIdParam } from "../http/object-id-param.js";
import { RecommendationInputError } from "./incident-context.builder.js";
import type { RecommendationService } from "./recommendation.service.js";

const AI_RATE_WINDOW_MS = 15 * 60 * 1_000;

export interface AiRouterOptions {
  createAuthService: () => Promise<AuthService>;
  createRecommendationService: () => Promise<RecommendationService>;
}

function serializeRecommendation(
  recommendation: RecommendationDocument & { _id: import("mongodb").ObjectId },
) {
  return {
    id: recommendation._id.toHexString(),
    incidentId: recommendation.incidentId.toHexString(),
    summary: recommendation.summary,
    rootCause: recommendation.rootCause,
    priority: recommendation.priority,
    actions: recommendation.actions,
    confidence: recommendation.confidence,
    source: recommendation.source,
    provider: recommendation.provider,
    generatedAt: recommendation.generatedAt.toISOString(),
  };
}

function sendServiceUnavailable(response: Response): void {
  response.status(503).json({
    error: {
      code: "recommendations_unavailable",
      message: "Recommendations are temporarily unavailable.",
    },
  });
}

export function createAiRouter(options: AiRouterOptions): Router {
  const router = Router();
  const authenticate = authenticateAccessToken(async (token) =>
    (await options.createAuthService()).verifyAccessToken(token),
  );
  const requireAiAccess = [
    authenticate,
    requirePermissions("recommendations:read"),
    requireRestaurantScope(),
  ];
  const generateRateLimit = rateLimit({
    windowMs: AI_RATE_WINDOW_MS,
    limit: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: "rate_limited",
        message: "Too many recommendation requests. Try again later.",
      },
    },
  });

  router.get(
    "/recommendations",
    ...requireAiAccess,
    async (request: Request, response: Response) => {
      const incidentId = request.query.incidentId;
      if (
        incidentId !== undefined &&
        (typeof incidentId !== "string" || !/^[a-f\d]{24}$/i.test(incidentId))
      ) {
        response.status(400).json({
          error: {
            code: "invalid_incident_reference",
            message: "A valid incident ID is required.",
          },
        });
        return;
      }

      try {
        const restaurantId = request.auth?.restaurantId;
        if (!restaurantId) {
          response.status(403).json({
            error: {
              code: "restaurant_scope_required",
              message: "A restaurant-scoped account is required.",
            },
          });
          return;
        }
        const records = await (await options.createRecommendationService()).list(
          restaurantId,
          incidentId,
        );
        response.status(200).json({ items: records.map(serializeRecommendation) });
      } catch {
        sendServiceUnavailable(response);
      }
    },
  );

  router.post(
    "/incidents/:incidentId/recommendations",
    ...requireAiAccess,
    generateRateLimit,
    requireObjectIdParam(
      "incidentId",
      "invalid_incident_reference",
      "A valid incident ID is required.",
    ),
    async (request: Request, response: Response) => {
      // requireObjectIdParam has already checked the format.
      const incidentId = String(request.params.incidentId);

      try {
        const restaurantId = request.auth?.restaurantId;
        if (!restaurantId) {
          response.status(403).json({
            error: {
              code: "restaurant_scope_required",
              message: "A restaurant-scoped account is required.",
            },
          });
          return;
        }
        const record = await (await options.createRecommendationService()).generate(
          restaurantId,
          incidentId,
        );
        response.status(200).json({ recommendation: serializeRecommendation(record) });
      } catch (error) {
        if (error instanceof RecommendationInputError) {
          response
            .status(error.statusCode)
            .json({ error: { code: error.code, message: error.message } });
          return;
        }
        sendServiceUnavailable(response);
      }
    },
  );

  return router;
}
