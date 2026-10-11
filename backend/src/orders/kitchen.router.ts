import { type NextFunction, type Request, type Response, Router } from "express";
import { ObjectId } from "mongodb";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthPrincipal } from "../auth/auth.service.js";
import { requirePermissions, requireRestaurantScope } from "../auth/authorization.middleware.js";
import { OrderError } from "./order.service.js";
import type { KitchenPreparationUpdate, StaffOrderServiceReader } from "./order.staff.types.js";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export interface KitchenRuntime {
  service: StaffOrderServiceReader;
  verifyAccessToken: (token: string) => Promise<AuthPrincipal>;
}

export interface KitchenRouterOptions {
  createRuntime: () => Promise<KitchenRuntime>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function objectId(value: unknown): ObjectId | null {
  return typeof value === "string" && OBJECT_ID_PATTERN.test(value) ? new ObjectId(value) : null;
}

function preparationUpdate(value: unknown): KitchenPreparationUpdate | null {
  return value === "Preparing" || value === "Ready" ? value : null;
}

function sendOrderError(error: unknown, response: Response): void {
  if (error instanceof OrderError) {
    response.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }
  response.status(503).json({
    error: { code: "order_unavailable", message: "Orders are temporarily unavailable." },
  });
}

function sendUnavailable(response: Response): void {
  response.status(503).json({
    error: { code: "order_unavailable", message: "Orders are temporarily unavailable." },
  });
}

export function createKitchenRouter(options: KitchenRouterOptions): ReturnType<typeof Router> {
  const router = Router();
  const runtimes = new WeakMap<Request, KitchenRuntime>();

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
    "/queue",
    requirePermissions("kitchen:queue:read"),
    requireRestaurantScope(),
    async (request: Request, response: Response) => {
      const runtime = runtimes.get(request);
      const restaurantId = objectId(request.auth?.restaurantId);
      if (!runtime || !request.auth) {
        response.status(401).json({
          error: { code: "missing_access_token", message: "Authentication is required." },
        });
        return;
      }
      if (!restaurantId) {
        response.status(403).json({
          error: {
            code: "restaurant_scope_required",
            message: "A restaurant-scoped account is required.",
          },
        });
        return;
      }

      try {
        const result = await runtime.service.listKitchenQueue(restaurantId);
        response.status(200).json({
          orders: result.tickets.map((ticket) => ({
            id: ticket.id.toHexString(),
            status: ticket.status,
            items: ticket.items.map((item) => ({
              id: item.id.toHexString(),
              name: item.name,
              quantity: item.quantity,
              preparationStatus: item.preparationStatus,
            })),
            createdAt: ticket.createdAt.toISOString(),
            updatedAt: ticket.updatedAt.toISOString(),
          })),
          truncated: result.truncated,
        });
      } catch (error) {
        sendOrderError(error, response);
      }
    },
  );

  router.put(
    "/queue/:orderId",
    requirePermissions("kitchen:queue:update"),
    requireRestaurantScope(),
    async (request: Request, response: Response) => {
      const runtime = runtimes.get(request);
      const principal = request.auth;
      if (!runtime || !principal) {
        response.status(401).json({
          error: { code: "missing_access_token", message: "Authentication is required." },
        });
        return;
      }

      const orderId = objectId(request.params.orderId);
      const restaurantId = objectId(principal.restaurantId);
      if (!orderId) {
        response.status(400).json({
          error: { code: "invalid_order_id", message: "A valid order ID is required." },
        });
        return;
      }
      if (!restaurantId) {
        response.status(403).json({
          error: {
            code: "restaurant_scope_required",
            message: "A restaurant-scoped account is required.",
          },
        });
        return;
      }
      if (!isRecord(request.body) || !hasOnlyKeys(request.body, ["itemId", "preparationStatus"])) {
        response.status(400).json({
          error: {
            code: "invalid_kitchen_update",
            message: "Provide only an item ID and its next preparation status.",
          },
        });
        return;
      }

      const itemId = objectId(request.body.itemId);
      const nextStatus = preparationUpdate(request.body.preparationStatus);
      if (!itemId || !nextStatus) {
        response.status(400).json({
          error: {
            code: "invalid_kitchen_update",
            message: "A valid item ID and next status of Preparing or Ready are required.",
          },
        });
        return;
      }

      try {
        const order = await runtime.service.updateItemPreparationStatus(
          restaurantId,
          orderId,
          itemId,
          nextStatus,
        );
        response.status(200).json({
          order: {
            id: order.id.toHexString(),
            status: order.status,
            items: order.items.map((item) => ({
              id: item.id.toHexString(),
              name: item.nameSnapshot,
              quantity: item.quantity,
              preparationStatus: item.preparationStatus,
            })),
            createdAt: order.createdAt.toISOString(),
            updatedAt: order.updatedAt.toISOString(),
          },
        });
      } catch (error) {
        sendOrderError(error, response);
      }
    },
  );

  return router;
}
