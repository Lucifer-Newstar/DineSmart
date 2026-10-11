import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { UserRole } from "../database/schema.js";
import type { AuthPrincipal } from "./auth.service.js";

export type Permission =
  | "menu:read"
  | "menu:write"
  | "reservations:own:create"
  | "reservations:own:read"
  | "reservations:own:update"
  | "reservations:read"
  | "reservations:write"
  | "orders:own:create"
  | "orders:own:read"
  | "orders:own:update"
  | "orders:read"
  | "orders:write"
  | "kitchen:queue:read"
  | "kitchen:queue:update"
  | "waitlist:read"
  | "waitlist:write"
  | "tables:read"
  | "tables:write"
  | "inventory:availability:read"
  | "inventory:read"
  | "inventory:write"
  | "dashboard:operations:read"
  | "dashboard:kitchen:read"
  | "analytics:read"
  | "incidents:read"
  | "incidents:resolve"
  | "recommendations:read"
  | "thresholds:write"
  | "staff:read"
  | "staff:write"
  | "restaurant:write"
  | "bills:own:read"
  | "bills:read"
  | "bills:write"
  | "notifications:own:read"
  | "notifications:own:update"
  | "notifications:restaurant:read";

const MANAGER_PERMISSIONS: readonly Permission[] = [
  "menu:read",
  "menu:write",
  "reservations:read",
  "reservations:write",
  "orders:read",
  "orders:write",
  "kitchen:queue:read",
  "kitchen:queue:update",
  "waitlist:read",
  "waitlist:write",
  "tables:read",
  "tables:write",
  "inventory:availability:read",
  "inventory:read",
  "inventory:write",
  "dashboard:operations:read",
  "analytics:read",
  "incidents:read",
  "incidents:resolve",
  "recommendations:read",
  "thresholds:write",
  "staff:read",
  "staff:write",
  "restaurant:write",
  "bills:read",
  "bills:write",
  "notifications:restaurant:read",
  "notifications:own:update",
];

/**
 * MVP role policy from the implementation decision matrix. Manager and
 * Administrator are equivalent operationally; neither has cross-restaurant
 * or platform-wide access. Customer ownership must be checked by each service.
 */
export const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> = {
  Customer: [
    "menu:read",
    "reservations:own:create",
    "reservations:own:read",
    "reservations:own:update",
    "orders:own:create",
    "orders:own:read",
    "orders:own:update",
    "bills:own:read",
    "notifications:own:read",
    "notifications:own:update",
  ],
  Reception: [
    "menu:read",
    "reservations:read",
    "reservations:write",
    "orders:read",
    "orders:write",
    "waitlist:read",
    "waitlist:write",
    "tables:read",
    "tables:write",
    "inventory:availability:read",
    "dashboard:operations:read",
    "notifications:restaurant:read",
    "notifications:own:update",
  ],
  "Kitchen Staff": [
    "menu:read",
    "orders:read",
    "kitchen:queue:read",
    "kitchen:queue:update",
    "inventory:availability:read",
    "dashboard:kitchen:read",
  ],
  Manager: MANAGER_PERMISSIONS,
  Administrator: MANAGER_PERMISSIONS,
};

function sendForbidden(response: Response, code: string, message: string): void {
  response.status(403).json({ error: { code, message } });
}

export function requirePermissions(...permissions: Permission[]): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    const principal: AuthPrincipal | undefined = request.auth;
    if (!principal) {
      response.status(401).json({
        error: { code: "missing_access_token", message: "Authentication is required." },
      });
      return;
    }

    const granted = ROLE_PERMISSIONS[principal.role];
    if (!permissions.every((permission) => granted.includes(permission))) {
      sendForbidden(
        response,
        "insufficient_permissions",
        "You do not have permission to perform this action.",
      );
      return;
    }

    next();
  };
}

function requestedRestaurantIds(request: Request): string[] {
  const requestedIds: string[] = [];
  const pathId = request.params.restaurantId;
  const queryId = request.query.restaurantId;
  const body: unknown = request.body;

  if (typeof pathId === "string") requestedIds.push(pathId);
  if (typeof queryId === "string") requestedIds.push(queryId);
  else if (queryId !== undefined) requestedIds.push("");

  if (typeof body === "object" && body !== null && "restaurantId" in body) {
    const bodyId = body.restaurantId;
    if (typeof bodyId === "string") requestedIds.push(bodyId);
    else requestedIds.push("");
  }

  return requestedIds;
}

/**
 * Require an operational principal and reject client-selected tenant IDs that
 * do not match its signed restaurant claim. Resource queries must still include
 * this scope in their MongoDB filter; this middleware is not a replacement for
 * tenant-scoped repository operations.
 */
export function requireRestaurantScope(): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    const principal = request.auth;
    if (!principal) {
      response.status(401).json({
        error: { code: "missing_access_token", message: "Authentication is required." },
      });
      return;
    }

    if (principal.role === "Customer" || !principal.restaurantId) {
      sendForbidden(
        response,
        "restaurant_scope_required",
        "A restaurant-scoped account is required.",
      );
      return;
    }

    const requestedIds = requestedRestaurantIds(request);
    if (requestedIds.some((requestedId) => requestedId !== principal.restaurantId)) {
      sendForbidden(
        response,
        "restaurant_scope_mismatch",
        "The requested restaurant is outside your access scope.",
      );
      return;
    }

    next();
  };
}

/** Use after a repository lookup to enforce customer-owned resource access. */
export function requireResourceOwner(ownerUserId: string): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    const principal = request.auth;
    if (!principal) {
      response.status(401).json({
        error: { code: "missing_access_token", message: "Authentication is required." },
      });
      return;
    }

    if (principal.role !== "Customer" || principal.userId !== ownerUserId) {
      sendForbidden(response, "resource_forbidden", "You do not have access to this resource.");
      return;
    }

    next();
  };
}
