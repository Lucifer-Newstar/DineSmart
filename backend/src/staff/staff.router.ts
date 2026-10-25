import { type NextFunction, type Request, type Response, Router } from "express";
import { ObjectId } from "mongodb";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthPrincipal } from "../auth/auth.service.js";
import { requirePermissions, requireRestaurantScope } from "../auth/authorization.middleware.js";
import { requireObjectIdParam } from "../http/object-id-param.js";
import { StaffServiceError } from "./staff.service.js";
import type { ManageableStaffRole, StaffServiceReader, StaffUpdate } from "./staff.types.js";
import { MANAGEABLE_STAFF_ROLES } from "./staff.types.js";

export interface StaffRuntime {
  service: StaffServiceReader;
  verifyAccessToken: (token: string) => Promise<AuthPrincipal>;
}

export interface StaffRouterOptions {
  createRuntime: () => Promise<StaffRuntime>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isManageableStaffRole(role: unknown): role is ManageableStaffRole {
  return typeof role === "string" && (MANAGEABLE_STAFF_ROLES as readonly string[]).includes(role);
}

function parseUpdate(value: unknown): StaffUpdate | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (
    keys.length === 0 ||
    keys.some((key) => key !== "role" && key !== "isActive") ||
    (value.role === undefined && value.isActive === undefined) ||
    (value.role !== undefined && !isManageableStaffRole(value.role)) ||
    (value.isActive !== undefined && typeof value.isActive !== "boolean")
  ) {
    return null;
  }
  return {
    ...(value.role === undefined ? {} : { role: value.role }),
    ...(value.isActive === undefined ? {} : { isActive: value.isActive }),
  };
}

function sendUnavailable(response: Response): void {
  response.status(503).json({
    error: { code: "staff_unavailable", message: "Staff management is temporarily unavailable." },
  });
}

function sendStaffError(error: unknown, response: Response): void {
  if (error instanceof StaffServiceError) {
    response.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }
  sendUnavailable(response);
}

function toResponse(staff: Awaited<ReturnType<StaffServiceReader["list"]>>["staff"][number]) {
  return {
    id: staff.id.toHexString(),
    userId: staff.userId.toHexString(),
    name: staff.name,
    email: staff.email,
    role: staff.role,
    isActive: staff.isActive,
    createdAt: staff.createdAt.toISOString(),
    updatedAt: staff.updatedAt.toISOString(),
  };
}

export function createStaffRouter(options: StaffRouterOptions): Router {
  const router = Router();
  const runtimes = new WeakMap<Request, StaffRuntime>();

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
    requirePermissions("staff:read"),
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
          error: { code: "invalid_staff_query", message: "Staff filters are not supported." },
        });
        return;
      }

      try {
        const result = await runtime.service.list(new ObjectId(restaurantId));
        response.set("Cache-Control", "no-store");
        response.status(200).json({
          staff: result.staff.map(toResponse),
          truncated: result.truncated,
        });
      } catch (error) {
        sendStaffError(error, response);
      }
    },
  );

  router.put(
    "/:id",
    requirePermissions("staff:write"),
    requireRestaurantScope(),
    requireObjectIdParam("id", "invalid_staff_id", "A valid staff ID is required."),
    async (request: Request, response: Response) => {
      const restaurantId = request.auth?.restaurantId;
      const actorUserId = request.auth?.userId;
      const runtime = runtimes.get(request);
      if (!restaurantId || !actorUserId || !runtime) {
        response.status(401).json({
          error: { code: "missing_access_token", message: "Authentication is required." },
        });
        return;
      }
      const rawStaffId = request.params.id;
      const staffId = Array.isArray(rawStaffId) ? rawStaffId[0] : rawStaffId;
      if (Object.keys(request.query).length > 0) {
        response.status(400).json({
          error: { code: "invalid_staff_query", message: "Staff filters are not supported." },
        });
        return;
      }
      const changes = parseUpdate(request.body);
      if (!changes) {
        response.status(400).json({
          error: {
            code: "invalid_staff_update",
            message: "Provide only a supported role and/or active-state change.",
          },
        });
        return;
      }

      try {
        const staff = await runtime.service.update(
          new ObjectId(restaurantId),
          new ObjectId(staffId),
          new ObjectId(actorUserId),
          changes,
          request.auth?.role,
        );
        response.set("Cache-Control", "no-store");
        response.status(200).json({ staff: toResponse(staff) });
      } catch (error) {
        sendStaffError(error, response);
      }
    },
  );

  return router;
}
