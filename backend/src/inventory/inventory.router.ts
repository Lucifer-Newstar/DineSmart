import { type NextFunction, type Request, type Response, Router } from "express";
import { ObjectId } from "mongodb";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthPrincipal } from "../auth/auth.service.js";
import { requirePermissions, requireRestaurantScope } from "../auth/authorization.middleware.js";
import { InventoryError } from "./inventory.service.js";
import type { InventoryAdjustment, InventoryServiceReader } from "./inventory.types.js";

export interface InventoryRuntime {
  service: InventoryServiceReader;
  verifyAccessToken: (token: string) => Promise<AuthPrincipal>;
}

export interface InventoryRouterOptions {
  createRuntime: () => Promise<InventoryRuntime>;
}

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function sendUnavailable(response: Response): void {
  response.status(503).json({
    error: { code: "inventory_unavailable", message: "Inventory is temporarily unavailable." },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAdjustment(value: unknown): InventoryAdjustment | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.quantity !== "number" ||
    !Number.isFinite(value.quantity) ||
    value.quantity < 0
  ) {
    return null;
  }
  if (
    value.lowStockThreshold !== undefined &&
    (typeof value.lowStockThreshold !== "number" ||
      !Number.isFinite(value.lowStockThreshold) ||
      value.lowStockThreshold < 0)
  ) {
    return null;
  }
  return {
    quantity: value.quantity,
    ...(value.lowStockThreshold === undefined
      ? {}
      : { lowStockThreshold: value.lowStockThreshold }),
  };
}

function sendInventoryError(error: unknown, response: Response): void {
  if (error instanceof InventoryError) {
    response.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }
  sendUnavailable(response);
}

export function createInventoryRouter(options: InventoryRouterOptions): Router {
  const router = Router();
  const runtimes = new WeakMap<Request, InventoryRuntime>();

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
    requirePermissions("inventory:availability:read"),
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
        const result = await runtime.service.list(new ObjectId(restaurantId));
        const hasFullAccess =
          request.auth?.role === "Manager" || request.auth?.role === "Administrator";
        const items = result.items.map((item) =>
          hasFullAccess
            ? {
                id: item.id.toHexString(),
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                lowStockThreshold: item.lowStockThreshold,
                isLowStock: item.quantity <= item.lowStockThreshold,
                lastAdjustedAt: item.lastAdjustedAt.toISOString(),
              }
            : {
                id: item.id.toHexString(),
                name: item.name,
                availability: item.quantity <= item.lowStockThreshold ? "low" : "available",
              },
        );
        response.status(200).json({ items, truncated: result.truncated });
      } catch (error) {
        sendInventoryError(error, response);
      }
    },
  );

  router.put(
    "/:id",
    requirePermissions("inventory:write"),
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
      const rawItemId = request.params.id;
      const itemId = Array.isArray(rawItemId) ? rawItemId[0] : rawItemId;
      if (!itemId || !OBJECT_ID_PATTERN.test(itemId)) {
        response.status(400).json({
          error: {
            code: "invalid_inventory_id",
            message: "A valid inventory item ID is required.",
          },
        });
        return;
      }

      const adjustment = parseAdjustment(request.body);
      if (!adjustment) {
        response.status(400).json({
          error: {
            code: "invalid_inventory_adjustment",
            message:
              "Provide a finite non-negative quantity and an optional non-negative threshold.",
          },
        });
        return;
      }

      try {
        const item = await runtime.service.adjust(
          new ObjectId(restaurantId),
          new ObjectId(itemId),
          adjustment,
        );
        response.status(200).json({
          item: {
            id: item.id.toHexString(),
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            lowStockThreshold: item.lowStockThreshold,
            isLowStock: item.quantity <= item.lowStockThreshold,
            lastAdjustedAt: item.lastAdjustedAt.toISOString(),
          },
        });
      } catch (error) {
        sendInventoryError(error, response);
      }
    },
  );

  return router;
}
