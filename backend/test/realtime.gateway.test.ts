import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import WebSocket, { type RawData } from "ws";
import type { NotificationRecord } from "../src/notifications/notification.types.js";
import { NotificationRealtimeGateway } from "../src/realtime/notification-realtime.gateway.js";
import {
  REALTIME_SOCKET_PATH,
  REALTIME_SOCKET_PROTOCOL,
  REALTIME_TICKET_PROTOCOL_PREFIX,
  type RealtimeIdentity,
} from "../src/realtime/realtime.types.js";
import { RealtimeHub } from "../src/realtime/realtime-hub.js";
import { SocketTicketStore } from "../src/realtime/socket-ticket.store.js";

const allowedOrigin = "https://app.example";
const restaurantId = new ObjectId();
const userId = new ObjectId();
const identity: RealtimeIdentity = { userId, role: "Manager", restaurantId };

function notification(): NotificationRecord {
  return {
    id: new ObjectId(),
    restaurantId,
    type: "incident.critical",
    title: "Low stock",
    body: "Paneer is below threshold.",
    createdAt: new Date("2026-10-11T09:00:00.000Z"),
    deliveredAt: null,
    readAt: null,
  };
}

async function listeningServer(server: ReturnType<typeof createServer>): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `ws://127.0.0.1:${address.port}`;
}

function connectError(client: WebSocket): Promise<Error> {
  return new Promise((resolve, reject) => {
    client.once("open", () => reject(new Error("Expected the handshake to be rejected.")));
    client.once("error", resolve);
  });
}

function rawText(data: RawData): string {
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return data.toString("utf8");
}

function message(client: WebSocket): Promise<{ data: RawData; isBinary: boolean }> {
  return new Promise((resolve, reject) => {
    client.once("message", (data, isBinary) => resolve({ data, isBinary }));
    client.once("error", reject);
  });
}

async function closeResources(
  gateway: NotificationRealtimeGateway,
  server: ReturnType<typeof createServer>,
  clients: WebSocket[],
): Promise<void> {
  gateway.close();
  for (const client of clients) client.terminate();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("gateway authenticates one-use protocol tickets and marks delivery only after ACK", async () => {
  const server = createServer();
  const ticketStore = new SocketTicketStore();
  const hub = new RealtimeHub();
  const record = notification();
  const persisted: Array<{
    scope: unknown;
    notificationId: ObjectId;
    deliveredAt: Date;
  }> = [];
  const gateway = new NotificationRealtimeGateway({
    allowedOrigin,
    ticketStore,
    hub,
    markDelivered: async (scope, notificationId, deliveredAt) => {
      persisted.push({ scope, notificationId, deliveredAt });
      return { ...record, deliveredAt };
    },
  });
  gateway.attach(server);
  const baseUrl = await listeningServer(server);
  const ticket = ticketStore.issue(identity);
  const client = new WebSocket(
    `${baseUrl}${REALTIME_SOCKET_PATH}`,
    [REALTIME_SOCKET_PROTOCOL, `${REALTIME_TICKET_PROTOCOL_PREFIX}${ticket.ticket}`],
    { origin: allowedOrigin },
  );
  const clients = [client];

  try {
    await once(client, "open");
    assert.equal(client.protocol, REALTIME_SOCKET_PROTOCOL);
    assert.equal(hub.connectionCount, 1);

    hub.publishNotification(userId, record);
    const pushed = await message(client);
    assert.equal(pushed.isBinary, false);
    const pushedEnvelope = JSON.parse(rawText(pushed.data)) as {
      eventId: string;
      event: string;
      data: { notification: { deliveredAt: string | null } };
    };
    assert.equal(pushedEnvelope.event, "notification.created");
    assert.equal(pushedEnvelope.data.notification.deliveredAt, null);
    assert.equal(
      persisted.length,
      0,
      "socket delivery is not equivalent to client acknowledgement",
    );

    const receipt = message(client);
    client.send(JSON.stringify({ type: "notification.ack", eventId: pushedEnvelope.eventId }));
    const acknowledged = await receipt;
    const acknowledgementEnvelope = JSON.parse(rawText(acknowledged.data)) as {
      event: string;
      data: { deliveredAt: string | null };
    };
    assert.equal(acknowledgementEnvelope.event, "notification.delivery_acknowledged");
    assert.equal(persisted.length, 1);
    assert.deepEqual(persisted[0]?.scope, { kind: "staff", userId, restaurantId });
    assert.equal(persisted[0]?.notificationId, record.id);
    assert.ok(persisted[0]?.deliveredAt instanceof Date);

    const duplicate = new WebSocket(
      `${baseUrl}${REALTIME_SOCKET_PATH}`,
      [REALTIME_SOCKET_PROTOCOL, `${REALTIME_TICKET_PROTOCOL_PREFIX}${ticket.ticket}`],
      { origin: allowedOrigin },
    );
    clients.push(duplicate);
    const duplicateError = await connectError(duplicate);
    assert.match(duplicateError.message, /401/);
  } finally {
    await closeResources(gateway, server, clients);
  }
});

test("gateway requires the exact configured origin and rejects ticket query strings", async () => {
  const server = createServer();
  const ticketStore = new SocketTicketStore();
  const hub = new RealtimeHub();
  const gateway = new NotificationRealtimeGateway({
    allowedOrigin,
    ticketStore,
    hub,
    markDelivered: async () => null,
  });
  gateway.attach(server);
  const baseUrl = await listeningServer(server);
  const ticket = ticketStore.issue(identity);
  const clients: WebSocket[] = [];

  try {
    const wrongOrigin = new WebSocket(
      `${baseUrl}${REALTIME_SOCKET_PATH}`,
      [REALTIME_SOCKET_PROTOCOL, `${REALTIME_TICKET_PROTOCOL_PREFIX}${ticket.ticket}`],
      { origin: "https://attacker.example" },
    );
    clients.push(wrongOrigin);
    const originError = await connectError(wrongOrigin);
    assert.match(originError.message, /403/);
    assert.equal(ticketStore.pendingCount, 1, "rejected origins must not consume valid tickets");

    const missingTicket = new WebSocket(
      `${baseUrl}${REALTIME_SOCKET_PATH}`,
      REALTIME_SOCKET_PROTOCOL,
      { origin: allowedOrigin },
    );
    clients.push(missingTicket);
    const missingTicketError = await connectError(missingTicket);
    assert.match(missingTicketError.message, /400/);

    const queryTicket = ticketStore.issue(identity);
    const query = new WebSocket(
      `${baseUrl}${REALTIME_SOCKET_PATH}?ticket=${queryTicket.ticket}`,
      [REALTIME_SOCKET_PROTOCOL, `${REALTIME_TICKET_PROTOCOL_PREFIX}${queryTicket.ticket}`],
      { origin: allowedOrigin },
    );
    clients.push(query);
    const queryError = await connectError(query);
    assert.match(queryError.message, /400/);
    assert.equal(ticketStore.pendingCount, 2);
  } finally {
    await closeResources(gateway, server, clients);
  }
});
