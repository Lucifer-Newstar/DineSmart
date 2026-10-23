import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import type { IncidentCandidate } from "../src/incidents/incident.types.js";
import {
  createIncidentNotifier,
  incidentNotification,
} from "../src/notifications/incident-notifier.js";
import type { NewNotification } from "../src/notifications/notification.types.js";

const restaurantId = new ObjectId();
const itemId = new ObjectId();

function candidate(overrides: Partial<IncidentCandidate> = {}): IncidentCandidate {
  return {
    type: "inventory_shortage",
    severity: "critical",
    triggerSnapshot: { quantity: 1 },
    affectedEntity: { type: "inventory_item", id: itemId },
    rootCause: "Paneer is below its low-stock threshold.",
    ...overrides,
  };
}

test("incident notifications name the severity and incident and point at the affected entity", () => {
  const recipient = new ObjectId();
  const notification = incidentNotification(restaurantId, recipient, candidate());
  assert.equal(notification.type, "incident.opened");
  assert.equal(notification.title, "Critical: Low stock");
  assert.equal(notification.body, "Paneer is below its low-stock threshold.");
  assert.ok(notification.recipientUserId.equals(recipient));
  assert.deepEqual(notification.relatedEntity, { type: "inventory_item", id: itemId });
  assert.equal(
    incidentNotification(
      restaurantId,
      recipient,
      candidate({ type: "kitchen_delay", severity: "warning" }),
    ).title,
    "Warning: Kitchen delay",
  );
});

test("every manager and administrator gets one notification per opened incident", async () => {
  const managers = [new ObjectId(), new ObjectId()];
  const created: NewNotification[] = [];
  const scopes: ObjectId[] = [];
  const notify = createIncidentNotifier(
    {
      async listIncidentAlertRecipients(scope) {
        scopes.push(scope);
        return managers;
      },
    },
    async (notification) => {
      created.push(notification);
    },
  );

  await notify(restaurantId, [candidate(), candidate({ type: "order_delay" })]);
  assert.ok(scopes[0].equals(restaurantId), "recipients are looked up in the incident's tenant");
  assert.equal(created.length, 4);
  assert.ok(created.every((notification) => notification.restaurantId.equals(restaurantId)));
});
