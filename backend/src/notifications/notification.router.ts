import {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
  Router,
} from "express";
import rateLimit from "express-rate-limit";
import type { ObjectId } from "mongodb";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthPrincipal } from "../auth/auth.service.js";
import {
  type Permission,
  requirePermissions,
  requireRestaurantScope,
} from "../auth/authorization.middleware.js";
import { parseObjectId, requireObjectIdParam } from "../http/object-id-param.js";
import {
  REALTIME_SOCKET_PATH,
  REALTIME_SOCKET_PROTOCOL,
  type RealtimeIdentity,
  type SocketTicket,
} from "../realtime/realtime.types.js";
import { NotificationError } from "./notification.service.js";
import type {
  NotificationRecipientScope,
  NotificationRecord,
  NotificationServiceReader,
} from "./notification.types.js";
import {
  effectivePreferences,
  type NotificationPreferenceStore,
  parsePreferenceChanges,
} from "./notification-preferences.js";

type NotificationOperation = "read" | "update";

export interface NotificationRuntime {
  service: NotificationServiceReader;
  verifyAccessToken: (token: string) => Promise<AuthPrincipal>;
  issueSocketTicket: (identity: RealtimeIdentity) => SocketTicket;
  /** Per-user notification categories (S5-04). */
  preferences?: NotificationPreferenceStore;
  clock?: () => Date;
}

export interface NotificationRouterOptions {
  createRuntime: () => Promise<NotificationRuntime>;
  webOrigin: string;
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
  return parseObjectId(value);
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

const requireEmptySocketTicketQuery: RequestHandler = (request, response, next) => {
  if (Object.keys(request.query).length > 0) {
    response.status(400).json({
      error: {
        code: "invalid_notification_query",
        message: "WebSocket ticket requests do not accept query parameters.",
      },
    });
    return;
  }
  next();
};

const requireEmptySocketTicketBody: RequestHandler = (request, response, next) => {
  if (
    request.body !== undefined &&
    (!isRecord(request.body) || Object.keys(request.body).length > 0)
  ) {
    response.status(400).json({
      error: {
        code: "invalid_notification_request",
        message: "A WebSocket ticket request does not accept a body.",
      },
    });
    return;
  }
  next();
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
  const socketTicketRateLimit = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: "rate_limited",
        message: "Too many real-time connection tickets. Try again later.",
      },
    },
  });

  router.use((request: Request, response: Response, next: NextFunction) => {
    if (request.method === "POST" && request.path === "/socket-ticket") {
      socketTicketRateLimit(request, response, next);
      return;
    }
    next();
  });

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
    "/socket-ticket",
    requireEmptySocketTicketQuery,
    requireEmptySocketTicketBody,
    notificationPermission("read"),
    requireNotificationTenantScope,
    async (request: Request, response: Response) => {
      const runtime = runtimes.get(request);
      const scope = recipientScope(request.auth);
      if (!runtime) {
        sendUnavailable(response);
        return;
      }
      if (!scope || !request.auth) {
        sendInvalidPrincipal(response);
        return;
      }
      if (request.get("origin") !== options.webOrigin) {
        response.status(403).json({
          error: {
            code: "untrusted_origin",
            message: "A request from the configured web application is required.",
          },
        });
        return;
      }
      const identity: RealtimeIdentity = {
        userId: scope.userId,
        role: request.auth.role,
        restaurantId: scope.kind === "staff" ? scope.restaurantId : null,
      };
      try {
        const ticket = runtime.issueSocketTicket(identity);
        response.set("Cache-Control", "no-store");
        response.status(201).json({
          ticket: ticket.ticket,
          expiresAt: ticket.expiresAt.toISOString(),
          socketPath: REALTIME_SOCKET_PATH,
          protocol: REALTIME_SOCKET_PROTOCOL,
        });
      } catch {
        response.status(503).json({
          error: {
            code: "notification_socket_unavailable",
            message: "A real-time connection ticket is temporarily unavailable.",
          },
        });
      }
    },
  );

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

  router.get(
    "/preferences",
    notificationPermission("read"),
    requireNotificationTenantScope,
    async (request: Request, response: Response) => {
      const runtime = runtimes.get(request);
      const scope = recipientScope(request.auth);
      if (!runtime?.preferences) {
        sendUnavailable(response);
        return;
      }
      if (!scope || !request.auth) {
        sendInvalidPrincipal(response);
        return;
      }
      try {
        const stored = await runtime.preferences.get(scope.userId);
        response.set("Cache-Control", "no-store");
        response.status(200).json({ preferences: effectivePreferences(request.auth.role, stored) });
      } catch {
        sendUnavailable(response);
      }
    },
  );

  router.put(
    "/preferences",
    notificationPermission("update"),
    requireNotificationTenantScope,
    async (request: Request, response: Response) => {
      const runtime = runtimes.get(request);
      const scope = recipientScope(request.auth);
      if (!runtime?.preferences) {
        sendUnavailable(response);
        return;
      }
      if (!scope || !request.auth) {
        sendInvalidPrincipal(response);
        return;
      }
      const changes = parsePreferenceChanges(request.auth.role, request.body);
      if (!changes) {
        response.status(400).json({
          error: {
            code: "invalid_notification_preferences",
            message: "Send true or false for the notification categories available to you.",
          },
        });
        return;
      }
      try {
        const now = runtime.clock?.() ?? new Date();
        if (!(await runtime.preferences.update(scope.userId, changes, now))) {
          sendInvalidPrincipal(response);
          return;
        }
        const stored = await runtime.preferences.get(scope.userId);
        response.status(200).json({ preferences: effectivePreferences(request.auth.role, stored) });
      } catch {
        sendUnavailable(response);
      }
    },
  );

  router.patch(
    "/:id/read",
    notificationPermission("update"),
    requireNotificationTenantScope,
    requireObjectIdParam("id", "invalid_notification_id", "A valid notification ID is required."),
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
