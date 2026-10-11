import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import WebSocket from "ws";
import { NotificationRealtimeGateway } from "../src/realtime/notification-realtime.gateway.js";
import {
  REALTIME_MAX_PAYLOAD_BYTES,
  REALTIME_SOCKET_PATH,
  REALTIME_SOCKET_PROTOCOL,
  REALTIME_TICKET_PROTOCOL_PREFIX,
} from "../src/realtime/realtime.types.js";
import { RealtimeHub } from "../src/realtime/realtime-hub.js";
import { SocketTicketStore } from "../src/realtime/socket-ticket.store.js";

const origin = "https://app.example";
const userId = new ObjectId();
const restaurantId = new ObjectId();

function open(client: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    client.once("open", resolve);
    client.once("error", reject);
  });
}

function closed(client: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    client.once("close", (code, reason) => resolve({ code, reason: reason.toString("utf8") }));
  });
}

test("gateway closes unknown client messages and enforces its 8 KiB receive limit", async () => {
  const server = createServer();
  const store = new SocketTicketStore();
  const gateway = new NotificationRealtimeGateway({
    allowedOrigin: origin,
    ticketStore: store,
    hub: new RealtimeHub(),
    markDelivered: async () => null,
  });
  gateway.attach(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `ws://127.0.0.1:${address.port}${REALTIME_SOCKET_PATH}`;
  const clients: WebSocket[] = [];

  try {
    const firstTicket = store.issue({ userId, role: "Manager", restaurantId });
    const invalid = new WebSocket(
      baseUrl,
      [REALTIME_SOCKET_PROTOCOL, `${REALTIME_TICKET_PROTOCOL_PREFIX}${firstTicket.ticket}`],
      { origin },
    );
    clients.push(invalid);
    await open(invalid);
    const invalidClosed = closed(invalid);
    invalid.send(JSON.stringify({ type: "order.updated" }));
    assert.equal((await invalidClosed).code, 1008);

    const secondTicket = store.issue({ userId, role: "Manager", restaurantId });
    const oversized = new WebSocket(
      baseUrl,
      [REALTIME_SOCKET_PROTOCOL, `${REALTIME_TICKET_PROTOCOL_PREFIX}${secondTicket.ticket}`],
      { origin },
    );
    clients.push(oversized);
    await open(oversized);
    const oversizedClosed = closed(oversized);
    oversized.send("x".repeat(REALTIME_MAX_PAYLOAD_BYTES + 1));
    assert.equal((await oversizedClosed).code, 1009);
  } finally {
    gateway.close();
    for (const client of clients) client.terminate();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
