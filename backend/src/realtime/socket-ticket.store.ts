import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import {
  REALTIME_TICKET_TTL_MS,
  type RealtimeIdentity,
  type SocketTicket,
} from "./realtime.types.js";

const TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class SocketTicketCapacityError extends Error {
  constructor() {
    super("The real-time ticket service is at capacity.");
    this.name = "SocketTicketCapacityError";
  }
}

export interface SocketTicketStoreOptions {
  clock?: () => number;
  createToken?: () => string;
  ttlMs?: number;
  maxPendingTickets?: number;
}

interface StoredTicket {
  identity: RealtimeIdentity;
  expiresAt: number;
}

/** One-use, per-process tickets keep access tokens out of WebSocket URLs and logs. */
export class SocketTicketStore {
  private readonly tickets = new Map<string, StoredTicket>();
  private readonly clock: () => number;
  private readonly createToken: () => string;
  private readonly ttlMs: number;
  private readonly maxPendingTickets: number;

  constructor(options: SocketTicketStoreOptions = {}) {
    this.clock = options.clock ?? Date.now;
    this.createToken = options.createToken ?? (() => randomBytes(32).toString("base64url"));
    this.ttlMs = options.ttlMs ?? REALTIME_TICKET_TTL_MS;
    this.maxPendingTickets = options.maxPendingTickets ?? 5_000;
  }

  issue(identity: RealtimeIdentity): SocketTicket {
    const now = this.clock();
    this.removeExpired(now);
    if (this.tickets.size >= this.maxPendingTickets) throw new SocketTicketCapacityError();

    let ticket = this.createToken();
    while (this.tickets.has(ticket)) ticket = this.createToken();
    if (!TICKET_PATTERN.test(ticket))
      throw new Error("The ticket generator returned an invalid token.");

    const storedIdentity: RealtimeIdentity = {
      userId: new ObjectId(identity.userId.toHexString()),
      role: identity.role,
      restaurantId: identity.restaurantId
        ? new ObjectId(identity.restaurantId.toHexString())
        : null,
    };
    const expiresAt = now + this.ttlMs;
    this.tickets.set(ticket, { identity: storedIdentity, expiresAt });
    return { ticket, expiresAt: new Date(expiresAt) };
  }

  consume(ticket: string, now = this.clock()): RealtimeIdentity | null {
    if (!TICKET_PATTERN.test(ticket)) return null;
    const stored = this.tickets.get(ticket);
    if (!stored) return null;
    this.tickets.delete(ticket);
    if (stored.expiresAt <= now) return null;
    return stored.identity;
  }

  get pendingCount(): number {
    this.removeExpired(this.clock());
    return this.tickets.size;
  }

  private removeExpired(now: number): void {
    for (const [ticket, stored] of this.tickets) {
      if (stored.expiresAt <= now) this.tickets.delete(ticket);
    }
  }
}
