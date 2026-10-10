import { type NextFunction, type Request, type Response, Router } from "express";
import { ObjectId } from "mongodb";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthPrincipal } from "../auth/auth.service.js";
import { requirePermissions, requireRestaurantScope } from "../auth/authorization.middleware.js";
import type { HealthScoreResult } from "./health-score.types.js";

export interface HealthScoreReader {
  getScore(restaurantId: ObjectId): Promise<HealthScoreResult>;
}

export interface HealthScoreRuntime {
  service: HealthScoreReader;
  verifyAccessToken: (token: string) => Promise<AuthPrincipal>;
}

export interface HealthScoreRouterOptions {
  createRuntime: () => Promise<HealthScoreRuntime>;
}

function sendUnavailable(response: Response): void {
  response.status(503).json({
    error: {
      code: "health_score_unavailable",
      message: "The health score is temporarily unavailable.",
    },
  });
}

export function createHealthScoreRouter(options: HealthScoreRouterOptions): Router {
  const router = Router();
  const runtimes = new WeakMap<Request, HealthScoreRuntime>();

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
    requirePermissions("dashboard:operations:read"),
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

      try {
        response.status(200).json(await runtime.service.getScore(new ObjectId(restaurantId)));
      } catch {
        sendUnavailable(response);
      }
    },
  );

  return router;
}
