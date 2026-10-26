/**
 * Browser side of the S2-13 WebSocket contract.
 *
 * A one-use ticket is minted over the normal (same-origin, proxied) REST API, then
 * the socket is opened directly against the API origin, because Next.js rewrites
 * and Vercel do not proxy WebSocket upgrades. Without a realtime URL the caller
 * falls back to polling.
 */

export const REALTIME_EVENTS = [
  "order.updated",
  "reservation.updated",
  "table.updated",
  "waitlist.updated",
  "inventory.updated",
  "incident.updated",
  "recommendation.updated",
  "healthscore.updated",
  "menu.availability",
  "notification.created",
  // Sent only to the customer who placed the order (S5-03).
  "order.status",
] as const;
export type RealtimeEventName = (typeof REALTIME_EVENTS)[number];

export interface RealtimeEnvelope {
  eventId: string;
  event: RealtimeEventName;
  occurredAt: string;
  restaurantId: string | null;
  data: Record<string, unknown>;
}

interface TicketResponse {
  ticket: string;
  socketPath: string;
  protocol: string;
}

const MAX_BACKOFF_MS = 30_000;

/**
 * The ws(s):// origin of the API. NEXT_PUBLIC_REALTIME_URL wins; on localhost the
 * development API on port 3001 is assumed; otherwise realtime is off (polling).
 */
export function resolveRealtimeBase(
  configured: string | undefined,
  location: { protocol: string; hostname: string } | undefined,
): string | null {
  const value = configured?.trim();
  if (value) {
    try {
      const url = new URL(value);
      if (url.protocol === "https:") url.protocol = "wss:";
      if (url.protocol === "http:") url.protocol = "ws:";
      if (url.protocol !== "wss:" && url.protocol !== "ws:") return null;
      return url.origin.replace(/^http/, "ws");
    } catch {
      return null;
    }
  }
  if (location && ["localhost", "127.0.0.1"].includes(location.hostname)) {
    return `ws://${location.hostname}:3001`;
  }
  return null;
}

export function parseRealtimeEnvelope(raw: unknown): RealtimeEnvelope | null {
  if (typeof raw !== "string" || raw.length > 64_000) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.eventId !== "string" ||
    typeof candidate.event !== "string" ||
    !(REALTIME_EVENTS as readonly string[]).includes(candidate.event) ||
    typeof candidate.data !== "object" ||
    candidate.data === null
  ) {
    return null;
  }
  return {
    eventId: candidate.eventId,
    event: candidate.event as RealtimeEventName,
    occurredAt: typeof candidate.occurredAt === "string" ? candidate.occurredAt : "",
    restaurantId: typeof candidate.restaurantId === "string" ? candidate.restaurantId : null,
    data: candidate.data as Record<string, unknown>,
  };
}

export type RefreshTarget =
  | "orders"
  | "kitchen"
  | "inventory"
  | "reservations"
  | "incidents"
  | "healthScore"
  | "menu";

/** Which dashboard panels an invalidation event makes stale. */
export function refreshTargetsForEvent(event: RealtimeEventName): RefreshTarget[] {
  switch (event) {
    case "order.updated":
      return ["orders", "kitchen"];
    case "inventory.updated":
      return ["inventory"];
    case "reservation.updated":
    case "table.updated":
    case "waitlist.updated":
      return ["reservations"];
    case "incident.updated":
    case "recommendation.updated":
      return ["incidents"];
    case "healthscore.updated":
      return ["healthScore"];
    case "menu.availability":
      return ["menu"];
    default:
      return [];
  }
}

/** Capped exponential backoff: 1 s, 2 s, 4 s ... 30 s. */
export function nextBackoffMs(attempt: number): number {
  return Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** Math.max(0, attempt));
}

export interface RealtimeConnectionOptions {
  base: string;
  /** Mints a ticket; must resolve null when the user is signed out or not allowed. */
  requestTicket: () => Promise<TicketResponse | null>;
  onEvent: (envelope: RealtimeEnvelope) => void;
  /** Called after every (re)connect so the caller can refetch what it missed. */
  onOpen?: () => void;
  onStatus?: (status: "connecting" | "live" | "offline") => void;
}

/** Opens a self-healing connection; returns a function that closes it for good. */
export function connectRealtime(options: RealtimeConnectionOptions): () => void {
  let socket: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let closed = false;

  const scheduleRetry = () => {
    if (closed) return;
    options.onStatus?.("offline");
    retryTimer = setTimeout(open, nextBackoffMs(attempt));
    attempt += 1;
  };

  async function open() {
    if (closed) return;
    options.onStatus?.("connecting");
    let ticket: TicketResponse | null = null;
    try {
      ticket = await options.requestTicket();
    } catch {
      ticket = null;
    }
    if (closed) return;
    if (!ticket) {
      scheduleRetry();
      return;
    }
    try {
      socket = new WebSocket(`${options.base}${ticket.socketPath}`, [
        ticket.protocol,
        `ticket.${ticket.ticket}`,
      ]);
    } catch {
      scheduleRetry();
      return;
    }
    socket.onopen = () => {
      attempt = 0;
      options.onStatus?.("live");
      options.onOpen?.();
    };
    socket.onmessage = (message) => {
      const envelope = parseRealtimeEnvelope(message.data);
      if (!envelope) return;
      if (envelope.event === "notification.created") {
        socket?.send(JSON.stringify({ type: "notification.ack", eventId: envelope.eventId }));
      }
      options.onEvent(envelope);
    };
    socket.onclose = () => {
      socket = null;
      scheduleRetry();
    };
  }

  void open();
  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    socket?.close(1000, "client closed");
    socket = null;
  };
}
