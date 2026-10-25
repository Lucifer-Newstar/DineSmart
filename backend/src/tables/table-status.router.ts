import { type NextFunction, type Request, type Response, Router } from "express";
import { ObjectId } from "mongodb";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthPrincipal } from "../auth/auth.service.js";
import { requirePermissions, requireRestaurantScope } from "../auth/authorization.middleware.js";
import { requireObjectIdParam } from "../http/object-id-param.js";
import { TableStatusServiceError } from "./table-status.service.js";
import type { TableOperationalStatus, TableStatusServiceReader } from "./table-status.types.js";
import { TABLE_STATUSES } from "./table-status.types.js";

export interface TableStatusRuntime {
  service: TableStatusServiceReader;
  verifyAccessToken: (token: string) => Promise<AuthPrincipal>;
}

export interface TableStatusRouterOptions {
  createRuntime: () => Promise<TableStatusRuntime>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStatus(value: unknown): TableOperationalStatus | null {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    Object.keys(value)[0] !== "status" ||
    typeof value.status !== "string" ||
    !(TABLE_STATUSES as readonly string[]).includes(value.status)
  ) {
    return null;
  }
  return value.status as TableOperationalStatus;
}

function sendUnavailable(response: Response): void {
  response.status(503).json({
    error: {
      code: "table_status_unavailable",
      message: "Table status management is temporarily unavailable.",
    },
  });
}

function sendTableStatusError(error: unknown, response: Response): void {
  if (error instanceof TableStatusServiceError) {
    response.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
    return;
  }
  sendUnavailable(response);
}

function toResponse(table: Awaited<ReturnType<TableStatusServiceReader["updateStatus"]>>) {
  return {
    id: table.id.toHexString(),
    tableNumber: table.tableNumber,
    capacity: table.capacity,
    ...(table.zone === undefined ? {} : { zone: table.zone }),
    status: table.status,
    createdAt: table.createdAt.toISOString(),
    updatedAt: table.updatedAt.toISOString(),
  };
}

export function createTableStatusRouter(options: TableStatusRouterOptions): Router {
  const router = Router();
  const runtimes = new WeakMap<Request, TableStatusRuntime>();

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
    requirePermissions("tables:read"),
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
      if (Object.keys(request.query).length > 0) {
        response.status(400).json({
          error: { code: "invalid_table_query", message: "Table list filters are not supported." },
        });
        return;
      }
      try {
        const result = await runtime.service.list(new ObjectId(restaurantId));
        response.status(200).json({
          tables: result.tables.map(toResponse),
          truncated: result.truncated,
        });
      } catch (error) {
        sendTableStatusError(error, response);
      }
    },
  );

  router.put(
    "/:id/status",
    requirePermissions("tables:write"),
    requireRestaurantScope(),
    requireObjectIdParam("id", "invalid_table_id", "A valid table ID is required."),
    async (request: Request, response: Response) => {
      const restaurantId = request.auth?.restaurantId;
      const runtime = runtimes.get(request);
      if (!restaurantId || !runtime) {
        response.status(401).json({
          error: { code: "missing_access_token", message: "Authentication is required." },
        });
        return;
      }

      const rawTableId = request.params.id;
      const tableId = Array.isArray(rawTableId) ? rawTableId[0] : rawTableId;
      if (Object.keys(request.query).length > 0) {
        response.status(400).json({
          error: {
            code: "invalid_table_status_query",
            message: "Table status filters are not supported.",
          },
        });
        return;
      }
      const status = parseStatus(request.body);
      if (!status) {
        response.status(400).json({
          error: {
            code: "invalid_table_status",
            message: "Provide exactly one supported lowercase table status.",
          },
        });
        return;
      }

      try {
        const table = await runtime.service.updateStatus(
          new ObjectId(restaurantId),
          new ObjectId(tableId),
          status,
        );
        response.set("Cache-Control", "no-store");
        response.status(200).json({ table: toResponse(table) });
      } catch (error) {
        sendTableStatusError(error, response);
      }
    },
  );

  return router;
}
