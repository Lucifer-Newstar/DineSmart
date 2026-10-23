import type { Db, ObjectId } from "mongodb";
import { COLLECTIONS, type UserDocument } from "../database/schema.js";
import type { IncidentOpenedNotifier } from "../incidents/incident.service.js";
import type { IncidentCandidate } from "../incidents/incident.types.js";
import type { NewNotification } from "./notification.types.js";

/** Roles that receive incident alerts; they are the roles allowed to read incidents. */
export const INCIDENT_ALERT_ROLES = ["Manager", "Administrator"] as const;
const MAX_ALERT_RECIPIENTS = 50;

const INCIDENT_LABELS: Record<IncidentCandidate["type"], string> = {
  kitchen_delay: "Kitchen delay",
  order_delay: "Order delay",
  kitchen_congestion: "Kitchen congestion",
  inventory_shortage: "Low stock",
  reservation_conflict: "Reservation conflict",
  queue_congestion: "Waitlist building up",
  table_congestion: "Tables under pressure",
};

export interface IncidentAlertRecipients {
  listIncidentAlertRecipients(restaurantId: ObjectId): Promise<ObjectId[]>;
}

export class MongoIncidentAlertRecipients implements IncidentAlertRecipients {
  constructor(private readonly db: Db) {}

  async listIncidentAlertRecipients(restaurantId: ObjectId): Promise<ObjectId[]> {
    const users = await this.db
      .collection<UserDocument>(COLLECTIONS.users)
      .find(
        { restaurantId, status: "active", role: { $in: [...INCIDENT_ALERT_ROLES] } },
        { projection: { _id: 1 }, limit: MAX_ALERT_RECIPIENTS },
      )
      .toArray();
    return users.map((user) => user._id);
  }
}

export function incidentNotification(
  restaurantId: ObjectId,
  recipientUserId: ObjectId,
  incident: IncidentCandidate,
): NewNotification {
  const severity = incident.severity === "critical" ? "Critical" : "Warning";
  return {
    restaurantId,
    recipientUserId,
    type: "incident.opened",
    title: `${severity}: ${INCIDENT_LABELS[incident.type] ?? "New incident"}`,
    body: incident.rootCause.slice(0, 2_000) || "A new incident was detected.",
    relatedEntity: { type: incident.affectedEntity.type, id: incident.affectedEntity.id },
  };
}

/**
 * Creates one persisted notification per newly opened incident for every active
 * Manager and Administrator of the restaurant. NotificationService.create also
 * pushes each one over the WebSocket to connected recipients.
 */
export function createIncidentNotifier(
  recipients: IncidentAlertRecipients,
  create: (notification: NewNotification) => Promise<unknown>,
): IncidentOpenedNotifier {
  return async (restaurantId, incidents) => {
    const userIds = await recipients.listIncidentAlertRecipients(restaurantId);
    for (const incident of incidents) {
      for (const userId of userIds) {
        await create(incidentNotification(restaurantId, userId, incident));
      }
    }
  };
}
