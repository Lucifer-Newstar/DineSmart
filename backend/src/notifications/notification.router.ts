import {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
  Router,
} from "express";
import { ObjectId } from "mongodb";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthPrincipal } from "../auth/auth.service.js";
import {
  type Permission,
  requirePermissions,
  requireRestaurantScope,
} from "../auth/authorization.middleware.js";
import { NotificationError } from "./notification.service.js";
import type {
  NotificationRecipientScope,
  NotificationRecord,
  NotificationServiceReader,
} from "./notification.types.js";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

type NotificationOperation = "read" | "update";

export interface NotificationRuntime {
  service: NotificationServiceReader;
  verifyAccessToken: (token: string) => Promise<AuthPrincipal>;
}

export interface NotificationRouterOptions {
  createRuntime: () => Promise<NotificationRuntime>;
}

function sendUnavailable(response: Response): void {
  response.status(503).json({
    error: {
      code: "notification_unavailable",
      message: "Notifications are temporarily unavailable.",
    },
  });
}

function sendNotificationError(error: unknown, response: Response): void {
  if (error instanceof NotificationError) {
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
  return typeof value === "string" && OBJECT_ID_PATTERN.test(value) ? new ObjectId(value) : null;
}

function notificationPermission(operation: NotificationOperation): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    const principal = request.auth;
    const permission: Permission =
      operation === "update"
        ? "notifications:own:update"
        : principal?.role === "Customer"
          ? "notifications:own:read"
          : "notifications:restaurant:read";
    requirePermissions(permission)(request, response, next);
  };
}

const requireNotificationTenantScope: RequestHandler = (request, response, next) => {
  if (request.auth?.role === "Customer") {
    next();
    return;
  }
  requireRestaurantScope()(request, response, next);
};

function recipientScope(principal: AuthPrincipal | undefined): NotificationRecipientScope | null {
  if (!principal) return null;
  const userId = objectId(principal.userId);
  if (!userId) return null;
  if (principal.role === "Customer") return { kind: "customer", userId };

  const restaurantId = objectId(principal.restaurantId);
  if (!restaurantId) return null;
  return { kind: "staff", userId, restaurantId };
}

function toJson(notification: NotificationRecord) {
  return {
    id: notification.id.toHexString(),
    restaurantId: notification.restaurantId.toHexString(),
    type: notification.type,
    title: notification.title,
    body: notification.body,
    ...(notification.relatedEntity
      ? {
          relatedEntity: {
            type: notification.relatedEntity.type,
            id: notification.relatedEntity.id.toHexString(),
          },
        }
      : {}),
    createdAt: notification.createdAt.toISOString(),
    deliveredAt: notification.deliveredAt?.toISOString() ?? null,
    readAt: notification.readAt?.toISOString() ?? null,
  };
}

function sendInvalidPrincipal(response: Response): void {
  response.status(401).json({
    error: { code: "invalid_access_token", message: "A valid access token is required." },
  });
}

export function createNotificationRouter(options: NotificationRouterOptions): Router {
  const router = Router();
  const runtimes = new WeakMap<Request, NotificationRuntime>();

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
    notificationPermission("read"),
    requireNotificationTenantScope,
    async (request: Request, response: Response) => {
      const runtime = runtimes.get(request);
      const scope = recipientScope(request.auth);
      if (!runtime) {
        sendUnavailable(response);
        return;
      }
      if (!scope) {
        sendInvalidPrincipal(response);
        return;
      }
      if (Object.keys(request.query).length > 0) {
        response.status(400).json({
          error: {
            code: "invalid_notification_query",
            message: "Notifications do not accept client-selected filters.",
          },
        });
        return;
      }

      try {
        const result = await runtime.service.list(scope);
        response.status(200).json({
          notifications: result.notifications.map(toJson),
          unreadCount: result.unreadCount,
          truncated: result.truncated,
        });
      } catch (error) {
        sendNotificationError(error, response);
      }
    },
  );

  router.patch(
    "/:id/read",
    notificationPermission("update"),
    requireNotificationTenantScope,
    async (request: Request, response: Response) => {
      const runtime = runtimes.get(request);
      const scope = recipientScope(request.auth);
      if (!runtime) {
        sendUnavailable(response);
        return;
      }
      if (!scope) {
        sendInvalidPrincipal(response);
        return;
      }
      const rawId = request.params.id;
      const notificationId = objectId(rawId);
      if (!notificationId) {
        response.status(400).json({
          error: {
            code: "invalid_notification_id",
            message: "A valid notification ID is required.",
          },
        });
        return;
      }
      if (
        request.body !== undefined &&
        (!isRecord(request.body) || Object.keys(request.body).length > 0)
      ) {
        response.status(400).json({
          error: {
            code: "invalid_notification_request",
            message: "Marking a notification as read does not accept a request body.",
          },
        });
        return;
      }

      try {
        const notification = await runtime.service.markRead(scope, notificationId);
        response.status(200).json({ notification: toJson(notification) });
      } catch (error) {
        sendNotificationError(error, response);
      }
    },
  );

  return router;
}
