import { randomUUID } from "node:crypto";
import type { ObjectId } from "mongodb";
import { WebSocket } from "ws";
import { type Permission, ROLE_PERMISSIONS } from "../auth/authorization.middleware.js";
import type { UserRole } from "../database/schema.js";
import type {
  NotificationRecipientScope,
  NotificationRecord,
} from "../notifications/notification.types.js";
import {
  type CustomerOrderPublisher,
  type NotificationDeliveryAcknowledgement,
  type NotificationRealtimePublisher,
  REALTIME_ACK_TTL_MS,
  REALTIME_MAX_BUFFERED_BYTES,
  REALTIME_MAX_CONNECTIONS_PER_USER,
  REALTIME_MAX_PAYLOAD_BYTES,
  REALTIME_MAX_PENDING_ACKS_PER_CONNECTION,
  type RealtimeEnvelope,
  type RealtimeIdentity,
  type RestaurantRealtimeEvent,
  type RestaurantRealtimePublisher,
} from "./realtime.types.js";

const EVENT_PERMISSIONS: Record<RestaurantRealtimeEvent["event"], Permission> = {
  "order.updated": "orders:read",
  "reservation.updated": "reservations:read",
  "table.updated": "tables:read",
  "waitlist.updated": "waitlist:read",
  "inventory.updated": "inventory:availability:read",
  "incident.updated": "incidents:read",
  "recommendation.updated": "recommendations:read",
  "healthscore.updated": "dashboard:operations:read",
  "menu.availability": "menu:read",
};

/**
 * Events about the public menu carry nothing a visitor could not read from the
 * menu itself, so signed-in customers (who belong to no restaurant) get them too.
 */
const CUSTOMER_VISIBLE_EVENTS = new Set<RestaurantRealtimeEvent["event"]>(["menu.availability"]);

interface PendingAcknowledgement {
  notificationId: ObjectId;
  expiresAt: number;
}

interface ConnectedClient {
  identity: RealtimeIdentity;
  socket: WebSocket;
  pendingAcks: Map<string, PendingAcknowledgement>;
  acknowledgementsInFlight: Set<string>;
}

function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

function notificationScope(identity: RealtimeIdentity): NotificationRecipientScope | null {
  if (identity.role === "Customer") return { kind: "customer", userId: identity.userId };
  if (!identity.restaurantId) return null;
  return {
    kind: "staff",
    userId: identity.userId,
    restaurantId: identity.restaurantId,
  };
}

function jsonNotification(notification: NotificationRecord) {
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

export class RealtimeHub {
  private readonly clients = new Map<WebSocket, ConnectedClient>();
  private readonly clock: () => number;
  private readonly onError: (error: unknown) => void;

  constructor(options: { clock?: () => number; onError?: (error: unknown) => void } = {}) {
    this.clock = options.clock ?? Date.now;
    this.onError = options.onError ?? (() => undefined);
  }

  addConnection(identity: RealtimeIdentity, socket: WebSocket): boolean {
    let perUserCount = 0;
    for (const client of this.clients.values()) {
      if (client.identity.userId.equals(identity.userId)) perUserCount += 1;
    }
    if (perUserCount >= REALTIME_MAX_CONNECTIONS_PER_USER) return false;

    const client: ConnectedClient = {
      identity: {
        userId: identity.userId,
        role: identity.role,
        restaurantId: identity.restaurantId,
      },
      socket,
      pendingAcks: new Map(),
      acknowledgementsInFlight: new Set(),
    };
    this.clients.set(socket, client);
    socket.once("close", () => this.removeConnection(socket));
    socket.once("error", () => this.removeConnection(socket));
    return true;
  }

  removeConnection(socket: WebSocket): void {
    this.clients.delete(socket);
  }

  /** Deliver a minimal tenant event only to same-tenant roles with read permission. */
  readonly publishRestaurantEvent: RestaurantRealtimePublisher = (event) => {
    const permission = EVENT_PERMISSIONS[event.event];
    const envelope: RealtimeEnvelope = {
      eventId: randomUUID(),
      event: event.event,
      occurredAt: new Date(this.clock()).toISOString(),
      restaurantId: event.restaurantId.toHexString(),
      data: event.data,
    };
    const payload = JSON.stringify(envelope);
    const tenantId = event.restaurantId.toHexString();

    for (const client of this.clients.values()) {
      const sameTenantReader =
        client.identity.restaurantId?.toHexString() === tenantId &&
        hasPermission(client.identity.role, permission);
      const customerReader =
        CUSTOMER_VISIBLE_EVENTS.has(event.event) &&
        client.identity.role === "Customer" &&
        hasPermission(client.identity.role, permission);
      if (sameTenantReader || customerReader) {
        this.send(client, payload);
      }
    }
  };

  /**
   * Order status for the customer who placed the order (S5-03). Only that
   * customer's own connections receive it; staff get the restaurant event.
   */
  readonly publishCustomerOrderEvent: CustomerOrderPublisher = (event) => {
    const envelope: RealtimeEnvelope = {
      eventId: randomUUID(),
      event: "order.status",
      occurredAt: new Date(this.clock()).toISOString(),
      restaurantId: event.restaurantId.toHexString(),
      data: { orderId: event.orderId, status: event.status },
    };
    const payload = JSON.stringify(envelope);
    let deliveries = 0;
    for (const client of this.clients.values()) {
      if (
        client.identity.role === "Customer" &&
        client.identity.userId.equals(event.customerUserId) &&
        this.send(client, payload)
      ) {
        deliveries += 1;
      }
    }
    return deliveries;
  };

  /** Notifications are sent only to the stored recipient and within the recipient's scope. */
  readonly publishNotification: NotificationRealtimePublisher = (recipientUserId, notification) => {
    const eventId = randomUUID();
    const envelope: RealtimeEnvelope = {
      eventId,
      event: "notification.created",
      occurredAt: new Date(this.clock()).toISOString(),
      restaurantId: notification.restaurantId.toHexString(),
      data: { notification: jsonNotification(notification) },
    };
    const payload = JSON.stringify(envelope);
    let deliveryCount = 0;

    for (const client of this.clients.values()) {
      if (!this.canReceiveNotification(client.identity, recipientUserId, notification)) continue;
      this.addPendingAck(client, eventId, notification.id);
      if (this.send(client, payload, () => client.pendingAcks.delete(eventId))) deliveryCount += 1;
    }

    return deliveryCount;
  };

  beginNotificationAcknowledgement(
    socket: WebSocket,
    eventId: string,
  ): NotificationDeliveryAcknowledgement | null {
    const client = this.clients.get(socket);
    if (!client || client.acknowledgementsInFlight.has(eventId)) return null;
    const pending = client.pendingAcks.get(eventId);
    if (!pending) return null;
    if (pending.expiresAt <= this.clock()) {
      client.pendingAcks.delete(eventId);
      return null;
    }

    const scope = notificationScope(client.identity);
    if (!scope) return null;
    client.acknowledgementsInFlight.add(eventId);
    return { scope, notificationId: pending.notificationId };
  }

  finishNotificationAcknowledgement(socket: WebSocket, eventId: string, persisted: boolean): void {
    const client = this.clients.get(socket);
    if (!client) return;
    client.acknowledgementsInFlight.delete(eventId);
    if (persisted) client.pendingAcks.delete(eventId);
  }

  sendAcknowledgementReceipt(
    socket: WebSocket,
    eventId: string,
    notification: NotificationRecord,
  ): void {
    const envelope: RealtimeEnvelope = {
      eventId,
      event: "notification.delivery_acknowledged",
      occurredAt: new Date(this.clock()).toISOString(),
      restaurantId: notification.restaurantId.toHexString(),
      data: {
        notificationId: notification.id.toHexString(),
        deliveredAt: notification.deliveredAt?.toISOString() ?? null,
      },
    };
    const client = this.clients.get(socket);
    if (client) this.send(client, JSON.stringify(envelope));
  }

  get connectionCount(): number {
    return this.clients.size;
  }

  private canReceiveNotification(
    identity: RealtimeIdentity,
    recipientUserId: ObjectId,
    notification: NotificationRecord,
  ): boolean {
    if (!identity.userId.equals(recipientUserId)) return false;
    const permission =
      identity.role === "Customer" ? "notifications:own:read" : "notifications:restaurant:read";
    if (!hasPermission(identity.role, permission)) return false;
    if (identity.role === "Customer") return true;
    return identity.restaurantId?.equals(notification.restaurantId) ?? false;
  }

  private addPendingAck(client: ConnectedClient, eventId: string, notificationId: ObjectId): void {
    for (const [pendingEventId, pending] of client.pendingAcks) {
      if (pending.expiresAt <= this.clock()) client.pendingAcks.delete(pendingEventId);
    }
    while (client.pendingAcks.size >= REALTIME_MAX_PENDING_ACKS_PER_CONNECTION) {
      const oldestEventId = client.pendingAcks.keys().next().value as string | undefined;
      if (!oldestEventId) break;
      client.pendingAcks.delete(oldestEventId);
    }
    client.pendingAcks.set(eventId, {
      notificationId,
      expiresAt: this.clock() + REALTIME_ACK_TTL_MS,
    });
  }

  private send(client: ConnectedClient, payload: string, onFailure?: () => void): boolean {
    const { socket } = client;
    if (Buffer.byteLength(payload, "utf8") > REALTIME_MAX_PAYLOAD_BYTES) {
      onFailure?.();
      try {
        socket.close(1009, "Event is too large.");
      } catch {
        this.removeConnection(socket);
      }
      return false;
    }
    if (
      socket.readyState !== WebSocket.OPEN ||
      socket.bufferedAmount > REALTIME_MAX_BUFFERED_BYTES
    ) {
      onFailure?.();
      try {
        socket.close(1013, "Connection cannot keep up with updates.");
      } catch {
        this.removeConnection(socket);
      }
      return false;
    }

    try {
      socket.send(payload, (error?: Error) => {
        if (!error) return;
        onFailure?.();
        this.onError(error);
        this.removeConnection(socket);
      });
      return true;
    } catch (error) {
      onFailure?.();
      this.onError(error);
      this.removeConnection(socket);
      return false;
    }
  }
}
