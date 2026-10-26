import type { ObjectId } from "mongodb";
import type { UserRole } from "../database/schema.js";
import type {
  NotificationRecipientScope,
  NotificationRecord,
} from "../notifications/notification.types.js";

export const REALTIME_SOCKET_PATH = "/api/v1/notifications/socket";
export const REALTIME_SOCKET_PROTOCOL = "andhrimnir.events.v1";
export const REALTIME_TICKET_PROTOCOL_PREFIX = "ticket.";
export const REALTIME_TICKET_TTL_MS = 30_000;
export const REALTIME_HEARTBEAT_INTERVAL_MS = 30_000;
export const REALTIME_MAX_PAYLOAD_BYTES = 8 * 1_024;
export const REALTIME_MAX_BUFFERED_BYTES = 64 * 1_024;
export const REALTIME_MAX_CONNECTIONS_PER_USER = 5;
export const REALTIME_MAX_PENDING_ACKS_PER_CONNECTION = 200;
export const REALTIME_ACK_TTL_MS = 5 * 60_000;

export interface RealtimeIdentity {
  userId: ObjectId;
  role: UserRole;
  restaurantId: ObjectId | null;
}

interface RestaurantRealtimeEventBase {
  restaurantId: ObjectId;
}

export type RestaurantRealtimeEvent =
  | (RestaurantRealtimeEventBase & {
      event: "order.updated";
      data: { orderId: string; status: string };
    })
  | (RestaurantRealtimeEventBase & {
      event: "reservation.updated";
      data: { reservationId: string; status: string };
    })
  | (RestaurantRealtimeEventBase & {
      event: "table.updated";
      data: { tableId: string; status: string };
    })
  | (RestaurantRealtimeEventBase & {
      event: "waitlist.updated";
      data: { waitlistId: string; status: string };
    })
  | (RestaurantRealtimeEventBase & {
      event: "inventory.updated";
      data: { inventoryItemId: string };
    })
  | (RestaurantRealtimeEventBase & {
      event: "incident.updated";
      data: { changedCount: number };
    })
  | (RestaurantRealtimeEventBase & {
      event: "recommendation.updated";
      data: { incidentId: string };
    })
  | (RestaurantRealtimeEventBase & {
      event: "menu.availability";
      data: { menuItemId: string; isAvailable: boolean };
    })
  | (RestaurantRealtimeEventBase & {
      event: "healthscore.updated";
      data: { score: number; calculatedAt: string };
    });

export interface RealtimeEnvelope {
  eventId: string;
  event: string;
  occurredAt: string;
  restaurantId: string;
  data: Record<string, unknown>;
}

export interface SocketTicket {
  ticket: string;
  expiresAt: Date;
}

export interface PendingNotificationAcknowledgement {
  eventId: string;
  notificationId: ObjectId;
}

export interface NotificationDeliveryAcknowledgement {
  scope: NotificationRecipientScope;
  notificationId: ObjectId;
}

export type NotificationRealtimePublisher = (
  recipientUserId: ObjectId,
  notification: NotificationRecord,
) => void;

export type RestaurantRealtimePublisher = (event: RestaurantRealtimeEvent) => void;

/** A status change on one order, for the customer who placed it (S5-03). */
export interface CustomerOrderEvent {
  customerUserId: ObjectId;
  restaurantId: ObjectId;
  orderId: string;
  status: string;
}

/** Returns how many of the customer's open connections received the event. */
export type CustomerOrderPublisher = (event: CustomerOrderEvent) => number;

export type NotificationDeliveryMarker = (
  scope: NotificationRecipientScope,
  notificationId: ObjectId,
  deliveredAt: Date,
) => Promise<NotificationRecord | null>;
