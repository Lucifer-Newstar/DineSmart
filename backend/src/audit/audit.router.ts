import { type NextFunction, type Request, type Response, Router } from "express";
import { ObjectId } from "mongodb";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthPrincipal } from "../auth/auth.service.js";
import { requirePermissions, requireRestaurantScope } from "../auth/authorization.middleware.js";
import type { AuditService } from "./audit.service.js";
import {
  AUDIT_ACTIONS,
  AUDIT_PAGE_DEFAULT,
  AUDIT_PAGE_MAX,
  type AuditAction,
  type AuditEntry,
  type AuditQuery,
} from "./audit.types.js";

export interface AuditRuntime {
  service: Pick<AuditService, "list" | "findById">;
  verifyAccessToken: (token: string) => Promise<AuthPrincipal>;
}

export interface AuditRouterOptions {
  createRuntime: () => Promise<AuditRuntime>;
}

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const ALLOWED_QUERY_KEYS = new Set(["limit", "before", "action"]);

function sendUnavailable(response: Response): void {
  response.status(503).json({
    error: { code: "audit_unavailable", message: "The audit log is temporarily unavailable." },
  });
}

function sendInvalidQuery(response: Response, message: string): void {
  response.status(400).json({ error: { code: "invalid_audit_query", message } });
}

function toResponse(entry: AuditEntry) {
  return {
    id: entry.id.toHexString(),
    action: entry.action,
    actor: { userId: entry.actor.userId.toHexString(), role: entry.actor.role },
    target: {
      type: entry.target.type,
      id: entry.target.id.toHexString(),
      ...(entry.target.label ? { label: entry.target.label } : {}),
    },
    before: entry.before,
    after: entry.after,
    createdAt: entry.createdAt.toISOString(),
  };
}

/**
 * GET /api/v1/audit-logs (S4-04): newest first, keyset-paginated with
 * ?before=<entry id>, filterable by ?action=. Managers and Administrators
 * read their own restaurant only.
 */
export function createAuditRouter(options: AuditRouterOptions): Router {
  const router = Router();
  const runtimes = new WeakMap<Request, AuditRuntime>();

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
    requirePermissions("audit:read"),
    requireRestaurantScope(),
    async (request: Request, response: Response) => {
      const restaurantIdValue = request.auth?.restaurantId;
      const runtime = runtimes.get(request);
      if (!restaurantIdValue || !runtime) {
        response.status(401).json({
          error: { code: "missing_access_token", message: "Authentication is required." },
        });
        return;
      }
      const query = request.query;
      if (Object.keys(query).some((key) => !ALLOWED_QUERY_KEYS.has(key))) {
        sendInvalidQuery(response, "Only limit, before and action are supported.");
        return;
      }
      const values: Record<string, string | undefined> = {};
      for (const key of ALLOWED_QUERY_KEYS) {
        const value = query[key];
        if (value !== undefined && typeof value !== "string") {
          sendInvalidQuery(response, `Pass ${key} once.`);
          return;
        }
        values[key] = value;
      }

      const limit = values.limit === undefined ? AUDIT_PAGE_DEFAULT : Number(values.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > AUDIT_PAGE_MAX) {
        sendInvalidQuery(response, `limit must be a whole number from 1 to ${AUDIT_PAGE_MAX}.`);
        return;
      }
      if (
        values.action !== undefined &&
        !(AUDIT_ACTIONS as readonly string[]).includes(values.action)
      ) {
        sendInvalidQuery(response, `action must be one of ${AUDIT_ACTIONS.join(", ")}.`);
        return;
      }
      if (values.before !== undefined && !OBJECT_ID_PATTERN.test(values.before)) {
        sendInvalidQuery(response, "before must be an audit entry ID.");
        return;
      }

      try {
        const restaurantId = new ObjectId(restaurantIdValue);
        const auditQuery: AuditQuery = { limit };
        if (values.action) auditQuery.action = values.action as AuditAction;
        if (values.before) {
          // The cursor is resolved inside this restaurant, so another
          // restaurant's entry ID cannot be used to probe its timestamps.
          const cursor = await runtime.service.findById(restaurantId, new ObjectId(values.before));
          if (!cursor) {
            sendInvalidQuery(response, "before must be an audit entry ID.");
            return;
          }
          auditQuery.before = { createdAt: cursor.createdAt, id: cursor.id };
        }
        const page = await runtime.service.list(restaurantId, auditQuery);
        const last = page.entries.at(-1);
        response.status(200).json({
          entries: page.entries.map(toResponse),
          nextBefore: page.hasMore && last ? last.id.toHexString() : null,
        });
      } catch {
        sendUnavailable(response);
      }
    },
  );

  return router;
}
