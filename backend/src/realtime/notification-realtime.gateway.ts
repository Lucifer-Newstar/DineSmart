import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { ROLE_PERMISSIONS } from "../auth/authorization.middleware.js";
import type { NotificationDeliveryMarker, RealtimeIdentity } from "./realtime.types.js";
import {
  REALTIME_HEARTBEAT_INTERVAL_MS,
  REALTIME_MAX_PAYLOAD_BYTES,
  REALTIME_SOCKET_PATH,
  REALTIME_SOCKET_PROTOCOL,
  REALTIME_TICKET_PROTOCOL_PREFIX,
} from "./realtime.types.js";
import type { RealtimeHub } from "./realtime-hub.js";
import type { SocketTicketStore } from "./socket-ticket.store.js";

const EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface NotificationRealtimeGatewayOptions {
  allowedOrigin: string;
  ticketStore: SocketTicketStore;
  hub: RealtimeHub;
  markDelivered: NotificationDeliveryMarker;
  clock?: () => Date;
  onError?: (error: unknown) => void;
}

function notificationReadAllowed(identity: RealtimeIdentity): boolean {
  if (identity.role === "Customer") {
    return (
      identity.restaurantId === null && ROLE_PERMISSIONS.Customer.includes("notifications:own:read")
    );
  }
  return (
    identity.restaurantId !== null &&
    ROLE_PERMISSIONS[identity.role].includes("notifications:restaurant:read")
  );
}

function rejectUpgrade(socket: Duplex, status: number, message: string): void {
  const statusText = status === 403 ? "Forbidden" : status === 401 ? "Unauthorized" : "Bad Request";
  const body = `${message}\n`;
  try {
    socket.write(
      `HTTP/1.1 ${status} ${statusText}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
    );
  } finally {
    socket.destroy();
  }
}

function validOriginConfiguration(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.origin === origin && ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function offeredProtocols(request: IncomingMessage): string[] {
  const header = request.headers["sec-websocket-protocol"];
  return typeof header === "string"
    ? header
        .split(",")
        .map((protocol) => protocol.trim())
        .filter(Boolean)
    : [];
}

function isNotificationAck(value: unknown): value is { type: "notification.ack"; eventId: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  return (
    Object.keys(message).length === 2 &&
    message.type === "notification.ack" &&
    typeof message.eventId === "string" &&
    EVENT_ID_PATTERN.test(message.eventId)
  );
}

export class NotificationRealtimeGateway {
  private readonly clock: () => Date;
  private readonly onError: (error: unknown) => void;
  private readonly webSockets: WebSocketServer;
  private readonly alive = new WeakMap<WebSocket, boolean>();
  private readonly upgradeListener: (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => void;
  private server: Server | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private readonly closingSockets = new Set<ReturnType<typeof setTimeout>>();
  private gatewayClosing = false;
  private webSocketServerClosing = false;

  constructor(private readonly options: NotificationRealtimeGatewayOptions) {
    if (options.allowedOrigin && !validOriginConfiguration(options.allowedOrigin)) {
      throw new Error("The real-time gateway requires a canonical HTTP(S) WEB_ORIGIN.");
    }
    this.clock = options.clock ?? (() => new Date());
    this.onError = options.onError ?? (() => undefined);
    this.webSockets = new WebSocketServer({
      noServer: true,
      perMessageDeflate: false,
      maxPayload: REALTIME_MAX_PAYLOAD_BYTES,
      handleProtocols: (protocols) =>
        protocols.has(REALTIME_SOCKET_PROTOCOL) ? REALTIME_SOCKET_PROTOCOL : false,
    });
    this.upgradeListener = (request, socket, head) => this.handleUpgrade(request, socket, head);
    this.webSockets.on("connection", (socket, request) =>
      this.initializeConnection(socket, request),
    );
  }

  attach(server: Server): void {
    if (this.gatewayClosing) throw new Error("The real-time gateway has already been closed.");
    if (this.server) throw new Error("The real-time gateway is already attached to a server.");
    this.server = server;
    server.on("upgrade", this.upgradeListener);
    this.heartbeat = setInterval(() => this.pingClients(), REALTIME_HEARTBEAT_INTERVAL_MS);
    this.heartbeat.unref();
  }

  close(): void {
    if (this.gatewayClosing) return;
    this.gatewayClosing = true;
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = undefined;
    }
    if (this.server) {
      this.server.off("upgrade", this.upgradeListener);
      this.server = undefined;
    }
    if (this.webSocketServerClosing) return;
    for (const socket of this.webSockets.clients) {
      const timeout = setTimeout(() => {
        this.closingSockets.delete(timeout);
        socket.terminate();
      }, 500);
      timeout.unref();
      this.closingSockets.add(timeout);
      socket.once("close", () => {
        clearTimeout(timeout);
        this.closingSockets.delete(timeout);
        this.closeWebSocketServerWhenDrained();
      });
      socket.close(1001, "Server is shutting down.");
    }
    this.closeWebSocketServerWhenDrained();
  }

  private closeWebSocketServerWhenDrained(): void {
    if (!this.gatewayClosing || this.webSocketServerClosing || this.webSockets.clients.size > 0)
      return;
    this.webSocketServerClosing = true;
    this.webSockets.close();
  }

  private handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const requestTarget = request.url ?? "";
    if (!requestTarget.startsWith("/") || requestTarget.startsWith("//")) {
      rejectUpgrade(socket, 400, "Invalid WebSocket request target.");
      return;
    }
    let url: URL;
    try {
      url = new URL(requestTarget, "http://localhost");
    } catch {
      rejectUpgrade(socket, 400, "Invalid WebSocket request.");
      return;
    }
    if (url.pathname !== REALTIME_SOCKET_PATH || url.search !== "" || url.hash !== "") {
      rejectUpgrade(socket, 400, "Invalid WebSocket endpoint.");
      return;
    }
    if (!this.options.allowedOrigin || request.headers.origin !== this.options.allowedOrigin) {
      rejectUpgrade(socket, 403, "WebSocket origin is not allowed.");
      return;
    }

    const protocols = offeredProtocols(request);
    const ticketProtocols = protocols.filter((protocol) =>
      protocol.startsWith(REALTIME_TICKET_PROTOCOL_PREFIX),
    );
    if (
      !protocols.includes(REALTIME_SOCKET_PROTOCOL) ||
      ticketProtocols.length !== 1 ||
      protocols.length !== 2
    ) {
      rejectUpgrade(socket, 400, "A one-use WebSocket ticket is required.");
      return;
    }

    const ticket = ticketProtocols[0].slice(REALTIME_TICKET_PROTOCOL_PREFIX.length);
    const identity = this.options.ticketStore.consume(ticket);
    if (!identity || !notificationReadAllowed(identity)) {
      rejectUpgrade(socket, 401, "The WebSocket ticket is invalid or expired.");
      return;
    }

    this.webSockets.handleUpgrade(request, socket, head, (webSocket) => {
      webSocket.once("close", () => this.closeWebSocketServerWhenDrained());
      if (!this.options.hub.addConnection(identity, webSocket)) {
        webSocket.close(1013, "The connection limit has been reached.");
        return;
      }
      this.webSockets.emit("connection", webSocket, request);
    });
  }

  private initializeConnection(socket: WebSocket, _request: IncomingMessage): void {
    this.alive.set(socket, true);
    socket.on("pong", () => this.alive.set(socket, true));
    socket.on("message", (data, isBinary) => {
      void this.handleClientMessage(socket, data, isBinary);
    });
  }

  private async handleClientMessage(
    socket: WebSocket,
    data: Buffer | ArrayBuffer | Buffer[],
    isBinary: boolean,
  ): Promise<void> {
    if (isBinary) {
      socket.close(1003, "Only notification acknowledgements are accepted.");
      return;
    }
    const text = Array.isArray(data)
      ? Buffer.concat(data).toString("utf8")
      : data instanceof ArrayBuffer
        ? Buffer.from(data).toString("utf8")
        : data.toString("utf8");
    if (Buffer.byteLength(text, "utf8") > REALTIME_MAX_PAYLOAD_BYTES) {
      socket.close(1009, "Message is too large.");
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch {
      socket.close(1008, "Invalid client message.");
      return;
    }
    if (!isNotificationAck(message)) {
      socket.close(1008, "Only notification acknowledgements are accepted.");
      return;
    }

    const acknowledgement = this.options.hub.beginNotificationAcknowledgement(
      socket,
      message.eventId,
    );
    if (!acknowledgement) return;

    try {
      const updated = await this.options.markDelivered(
        acknowledgement.scope,
        acknowledgement.notificationId,
        this.clock(),
      );
      this.options.hub.finishNotificationAcknowledgement(socket, message.eventId, true);
      if (updated) this.options.hub.sendAcknowledgementReceipt(socket, message.eventId, updated);
    } catch (error) {
      this.options.hub.finishNotificationAcknowledgement(socket, message.eventId, false);
      this.onError(error);
    }
  }

  private pingClients(): void {
    for (const socket of this.webSockets.clients) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (this.alive.get(socket) === false) {
        socket.terminate();
        continue;
      }
      this.alive.set(socket, false);
      socket.ping();
    }
  }
}
