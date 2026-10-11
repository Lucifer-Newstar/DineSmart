import { type NextFunction, type Request, type Response, Router } from "express";
import { ObjectId } from "mongodb";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthPrincipal } from "../auth/auth.service.js";
import { requirePermissions } from "../auth/authorization.middleware.js";
import { OrderError } from "./order.service.js";
import type { OrderRequestLine, OrderServiceReader } from "./order.types.js";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export interface OrderRuntime {
  service: OrderServiceReader;
  verifyAccessToken: (token: string) => Promise<AuthPrincipal>;
}

export interface OrderRouterOptions {
  createRuntime: () => Promise<OrderRuntime>;
}

function sendUnavailable(response: Response): void {
  response.status(503).json({
    error: { code: "order_unavailable", message: "Orders are temporarily unavailable." },
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
  return typeof value === "string" && OBJECT_ID_PATTERN.test(value) ? new ObjectId(value) : null;
}

function userObjectId(value: string | null): ObjectId {
  const id = objectId(value);
  if (!id) throw new Error("Invalid authenticated identifier.");
  return id;
}

function parseCreateBody(
  value: unknown,
): { restaurantId: ObjectId; items: OrderRequestLine[] } | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["restaurantId", "items"])) return null;
  const restaurantId = objectId(value.restaurantId);
  if (!restaurantId || !Array.isArray(value.items)) return null;

  const items: OrderRequestLine[] = [];
  for (const line of value.items) {
    if (!isRecord(line) || !hasOnlyKeys(line, ["menuItemId", "quantity"])) return null;
    const menuItemId = objectId(line.menuItemId);
    if (!menuItemId || typeof line.quantity !== "number" || !Number.isFinite(line.quantity))
      return null;
    items.push({ menuItemId, quantity: line.quantity });
  }
  return { restaurantId, items };
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

export function createOrderRouter(options: OrderRouterOptions): ReturnType<typeof Router> {
  const router = Router();
  const runtimes = new WeakMap<Request, OrderRuntime>();

  router.use(async (request: Request, response: Response, next: NextFunction) => {
    try {
      const runtime = await options.createRuntime();
      runtimes.set(request, runtime);
      authenticateAccessToken(runtime.verifyAccessToken)(request, response, next);
    } catch {
      sendUnavailable(response);
    }
  });

  router.post(
    "/",
    requirePermissions("orders:own:create"),
    async (request: Request, response: Response) => {
      const runtime = runtimes.get(request);
      const principal = request.auth;
      if (!runtime || !principal) {
        response.status(401).json({
          error: { code: "missing_access_token", message: "Authentication is required." },
        });
        return;
      }
      const body = parseCreateBody(request.body);
      if (!body) {
        response.status(400).json({
          error: {
            code: "invalid_order_request",
            message: "Provide a restaurant ID and one or more menu item IDs with quantities.",
          },
        });
        return;
      }

      try {
        const order = await runtime.service.createForCustomer({
          userId: userObjectId(principal.userId),
          restaurantId: body.restaurantId,
          items: body.items,
        });
        response.status(201).json({ order: toJson(order) });
      } catch (error) {
        sendOrderError(error, response);
      }
    },
  );

  router.get(
    "/history",
    requirePermissions("orders:own:read"),
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
        const result = await runtime.service.listForCustomer(userObjectId(principal.userId));
        response.status(200).json({
          orders: result.orders.map(toJson),
          truncated: result.truncated,
        });
      } catch (error) {
        sendOrderError(error, response);
      }
    },
  );

  router.put(
    "/:id/cancel",
    requirePermissions("orders:own:update"),
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
      if (!orderId) {
        response.status(400).json({
          error: { code: "invalid_order_id", message: "A valid order ID is required." },
        });
        return;
      }
      if (
        request.body !== undefined &&
        (!isRecord(request.body) || Object.keys(request.body).length !== 0)
      ) {
        response.status(400).json({
          error: {
            code: "invalid_order_cancellation",
            message: "Order cancellation does not accept a request body.",
          },
        });
        return;
      }

      try {
        const order = await runtime.service.cancelForCustomer(
          userObjectId(principal.userId),
          orderId,
        );
        response.status(200).json({ order: toJson(order) });
      } catch (error) {
        sendOrderError(error, response);
      }
    },
  );

  return router;
}

function toJson(order: Awaited<ReturnType<OrderServiceReader["createForCustomer"]>>) {
  return {
    id: order.id.toHexString(),
    restaurantId: order.restaurantId.toHexString(),
    restaurantName: order.restaurantName,
    status: order.status,
    totalMinor: order.totalMinor,
    currency: order.currency,
    items: order.items.map((item) => ({
      id: item.id.toHexString(),
      menuItemId: item.menuItemId.toHexString(),
      name: item.nameSnapshot,
      unitPriceMinor: item.unitPriceMinor,
      quantity: item.quantity,
      preparationStatus: item.preparationStatus,
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
