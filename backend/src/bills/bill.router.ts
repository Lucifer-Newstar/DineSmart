import {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
  Router,
} from "express";
import type { ObjectId } from "mongodb";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthPrincipal } from "../auth/auth.service.js";
import { requirePermissions, requireRestaurantScope } from "../auth/authorization.middleware.js";
import { parseObjectId, requireObjectIdParam } from "../http/object-id-param.js";
import { BillError } from "./bill.service.js";
import type { BillRecord, BillServiceReader } from "./bill.types.js";

export interface BillRuntime {
  service: BillServiceReader;
  verifyAccessToken: (token: string) => Promise<AuthPrincipal>;
}

export interface BillRouterOptions {
  createRuntime: () => Promise<BillRuntime>;
}

function sendUnavailable(response: Response): void {
  response.status(503).json({
    error: { code: "bill_unavailable", message: "Bills are temporarily unavailable." },
  });
}

function sendBillError(error: unknown, response: Response): void {
  if (error instanceof BillError) {
    response.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }
  sendUnavailable(response);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectId(value: unknown): ObjectId | null {
  return parseObjectId(value);
}

function userObjectId(principal: AuthPrincipal): ObjectId | null {
  return objectId(principal.userId);
}

function restaurantObjectId(principal: AuthPrincipal): ObjectId | null {
  return objectId(principal.restaurantId);
}

type BillAccessScope =
  | { kind: "customer"; userId: ObjectId }
  | { kind: "restaurant"; restaurantId: ObjectId };

function billAccessScope(principal: AuthPrincipal): BillAccessScope | null {
  if (principal.role === "Customer") {
    const userId = userObjectId(principal);
    return userId ? { kind: "customer", userId } : null;
  }
  const restaurantId = restaurantObjectId(principal);
  return restaurantId ? { kind: "restaurant", restaurantId } : null;
}

function sendInvalidPrincipal(response: Response): void {
  response.status(401).json({
    error: { code: "invalid_access_token", message: "A valid access token is required." },
  });
}

const billReadPermission: RequestHandler = (request, response, next) => {
  const permission = request.auth?.role === "Customer" ? "bills:own:read" : "bills:read";
  requirePermissions(permission)(request, response, next);
};

const billReadScope: RequestHandler = (request, response, next) => {
  if (request.auth?.role === "Customer") {
    next();
    return;
  }
  requireRestaurantScope()(request, response, next);
};

const rejectQueryParameters: RequestHandler = (request, response, next) => {
  if (Object.keys(request.query).length > 0) {
    response.status(400).json({
      error: {
        code: "invalid_bill_query",
        message: "Bill endpoints do not accept query parameters.",
      },
    });
    return;
  }
  next();
};

function parseCreateBody(value: unknown): ObjectId | null {
  if (!isRecord(value) || Object.keys(value).length !== 1 || !("orderId" in value)) return null;
  return objectId(value.orderId);
}

function toJson(bill: BillRecord) {
  return {
    id: bill.id.toHexString(),
    restaurantId: bill.restaurantId.toHexString(),
    orderId: bill.orderId.toHexString(),
    lineItems: bill.lineItems.map((item) => ({
      name: item.nameSnapshot,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
    })),
    subtotalMinor: bill.subtotalMinor,
    taxMinor: bill.taxMinor,
    adjustmentsMinor: bill.adjustmentsMinor,
    totalMinor: bill.totalMinor,
    currency: bill.currency,
    status: bill.status,
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
  };
}

export function createBillRouter(options: BillRouterOptions): Router {
  const router = Router();
  const runtimes = new WeakMap<Request, BillRuntime>();

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
    rejectQueryParameters,
    requirePermissions("bills:write"),
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

      const orderId = parseCreateBody(request.body);
      if (!orderId) {
        response.status(400).json({
          error: {
            code: "invalid_bill_request",
            message: "Provide only a valid orderId to generate a bill.",
          },
        });
        return;
      }
      const restaurantId = restaurantObjectId(principal);
      if (!restaurantId) {
        sendInvalidPrincipal(response);
        return;
      }

      try {
        const result = await runtime.service.generateForRestaurant(restaurantId, orderId);
        response.set("Cache-Control", "no-store");
        response.status(result.created ? 201 : 200).json({ bill: toJson(result.bill) });
      } catch (error) {
        sendBillError(error, response);
      }
    },
  );

  router.get(
    "/order/:orderId",
    rejectQueryParameters,
    billReadPermission,
    billReadScope,
    requireObjectIdParam("orderId", "invalid_order_id", "A valid order ID is required."),
    async (request: Request, response: Response) => {
      const runtime = runtimes.get(request);
      const principal = request.auth;
      const orderId = objectId(request.params.orderId);
      if (!orderId) {
        response.status(400).json({
          error: { code: "invalid_order_id", message: "A valid order ID is required." },
        });
        return;
      }
      if (!runtime || !principal) {
        response.status(401).json({
          error: { code: "missing_access_token", message: "Authentication is required." },
        });
        return;
      }

      const scope = billAccessScope(principal);
      if (!scope) {
        sendInvalidPrincipal(response);
        return;
      }

      try {
        const bill =
          scope.kind === "customer"
            ? await runtime.service.getByOrderForCustomer(scope.userId, orderId)
            : await runtime.service.getByOrderForRestaurant(orderId, scope.restaurantId);
        response.set("Cache-Control", "no-store");
        response.status(200).json({ bill: toJson(bill) });
      } catch (error) {
        sendBillError(error, response);
      }
    },
  );

  router.get(
    "/:id",
    rejectQueryParameters,
    billReadPermission,
    billReadScope,
    requireObjectIdParam("id", "invalid_bill_id", "A valid bill ID is required."),
    async (request: Request, response: Response) => {
      const runtime = runtimes.get(request);
      const principal = request.auth;
      const billId = objectId(request.params.id);
      if (!billId) {
        response.status(400).json({
          error: { code: "invalid_bill_id", message: "A valid bill ID is required." },
        });
        return;
      }
      if (!runtime || !principal) {
        response.status(401).json({
          error: { code: "missing_access_token", message: "Authentication is required." },
        });
        return;
      }

      const scope = billAccessScope(principal);
      if (!scope) {
        sendInvalidPrincipal(response);
        return;
      }

      try {
        const bill =
          scope.kind === "customer"
            ? await runtime.service.getForCustomer(scope.userId, billId)
            : await runtime.service.getForRestaurant(billId, scope.restaurantId);
        response.set("Cache-Control", "no-store");
        response.status(200).json({ bill: toJson(bill) });
      } catch (error) {
        sendBillError(error, response);
      }
    },
  );

  return router;
}
