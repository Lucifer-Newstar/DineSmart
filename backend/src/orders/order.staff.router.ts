import { type NextFunction, type Request, type Response, Router } from "express";
import { ObjectId } from "mongodb";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthPrincipal } from "../auth/auth.service.js";
import { requirePermissions, requireRestaurantScope } from "../auth/authorization.middleware.js";
import type { OrderStatus } from "../database/schema.js";
import { OrderError } from "./order.service.js";
import type { StaffOrderServiceReader } from "./order.staff.types.js";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export interface StaffOrderRuntime {
  service: StaffOrderServiceReader;
  verifyAccessToken: (token: string) => Promise<AuthPrincipal>;
}

export interface StaffOrderRouterOptions {
  createRuntime: () => Promise<StaffOrderRuntime>;
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

function requestedStatus(value: unknown): OrderStatus | null {
  return value === "Accepted" || value === "Served" || value === "Completed" ? value : null;
}

function sendOrderError(error: unknown, response: Response): void {
  if (error instanceof OrderError) {
    response.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }
  sendUnavailable(response);
}

function sendUnavailable(response: Response): void {
  response.status(503).json({
    error: { code: "order_unavailable", message: "Orders are temporarily unavailable." },
  });
}

export function createStaffOrderRouter(
  options: StaffOrderRouterOptions,
): ReturnType<typeof Router> {
  const router = Router();
  const runtimes = new WeakMap<Request, StaffOrderRuntime>();

  const resolveRuntime = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const runtime = await options.createRuntime();
      runtimes.set(request, runtime);
      authenticateAccessToken(runtime.verifyAccessToken)(request, response, next);
    } catch {
      sendUnavailable(response);
    }
  };

  router.get(
    "/",
    resolveRuntime,
    requirePermissions("orders:read"),
    requireRestaurantScope(),
    async (request: Request, response: Response) => {
      const runtime = runtimes.get(request);
      const principal = request.auth;
      const restaurantId = objectId(principal?.restaurantId);
      if (!runtime || !principal || !restaurantId) {
        response.status(403).json({
          error: {
            code: "restaurant_scope_required",
            message: "A restaurant-scoped account is required.",
          },
        });
        return;
      }

      if (Object.keys(request.query).length > 0) {
        response.status(400).json({
          error: {
            code: "invalid_order_list_request",
            message: "The staff order feed does not accept client-selected filters.",
          },
        });
        return;
      }

      try {
        const view = principal.role === "Kitchen Staff" ? "kitchen" : "floor";
        const result = await runtime.service.listRestaurantOrders(restaurantId, view);
        response.status(200).json({
          orders: result.orders.map(toStaffOrderJson),
          truncated: result.truncated,
        });
      } catch (error) {
        sendOrderError(error, response);
      }
    },
  );

  router.patch(
    "/:id/status",
    resolveRuntime,
    requirePermissions("orders:write"),
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

      const orderId = objectId(request.params.id);
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
      if (!isRecord(request.body) || !hasOnlyKeys(request.body, ["status"])) {
        response.status(400).json({
          error: {
            code: "invalid_order_status_request",
            message: "Provide only an allowed next order status.",
          },
        });
        return;
      }
      const nextStatus = requestedStatus(request.body.status);
      if (!nextStatus) {
        response.status(400).json({
          error: {
            code: "invalid_order_status_request",
            message: "Only Accepted, Served, or Completed may be requested by restaurant staff.",
          },
        });
        return;
      }

      try {
        const order = await runtime.service.updateOrderStatus(restaurantId, orderId, nextStatus);
        response.status(200).json({ order: toStaffOrderJson(order) });
      } catch (error) {
        sendOrderError(error, response);
      }
    },
  );

  return router;
}

function toStaffOrderJson(
  order: Awaited<ReturnType<StaffOrderServiceReader["updateOrderStatus"]>>,
) {
  return {
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
  };
}
