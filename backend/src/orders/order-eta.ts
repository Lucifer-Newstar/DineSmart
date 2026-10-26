import type { Db, ObjectId } from "mongodb";
import {
  COLLECTIONS,
  type MenuItemDocument,
  type OrderDocument,
  type OrderStatus,
} from "../database/schema.js";
import type { OrderRecord } from "./order.types.js";

/**
 * Ready-time estimate for a customer's order (S5-03).
 *
 * The estimate is the longest prep time among the ordered dishes plus a queue
 * allowance for every open order placed before this one, capped so a long
 * queue never shows an absurd time. Dishes without prep minutes count as
 * DEFAULT_PREP_MINUTES.
 */

export const DEFAULT_PREP_MINUTES = 15;
export const QUEUE_MINUTES_PER_ORDER = 4;
export const MAX_QUEUE_MINUTES = 60;
/** Orders still waiting for the kitchen; each one ahead adds queue time. */
export const OPEN_KITCHEN_STATUSES: readonly OrderStatus[] = ["Created", "Accepted", "Preparing"];

export interface OrderEtaInput {
  placedAt: Date;
  status: OrderStatus;
  /** Prep minutes per ordered dish; undefined when the menu item has none. */
  prepMinutes: ReadonlyArray<number | undefined>;
  ordersAhead: number;
  now: Date;
}

export interface OrderEta {
  /** Minutes from placing to ready. */
  totalMinutes: number;
  readyAt: Date;
  /** Whole minutes left from `now`, at least 1 while the order is open. */
  minutesLeft: number;
  /** The estimate has passed and the order is still not ready. */
  late: boolean;
}

function prepOf(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(Math.round(value), 240)
    : DEFAULT_PREP_MINUTES;
}

/** Null once the order is ready, served, completed or cancelled. */
export function estimateOrderEta(input: OrderEtaInput): OrderEta | null {
  if (!OPEN_KITCHEN_STATUSES.includes(input.status)) return null;
  const longest = input.prepMinutes.length
    ? Math.max(...input.prepMinutes.map(prepOf))
    : DEFAULT_PREP_MINUTES;
  const queue = Math.min(
    Math.max(0, Math.floor(input.ordersAhead)) * QUEUE_MINUTES_PER_ORDER,
    MAX_QUEUE_MINUTES,
  );
  const totalMinutes = longest + queue;
  const readyAt = new Date(input.placedAt.getTime() + totalMinutes * 60_000);
  const remainingMs = readyAt.getTime() - input.now.getTime();
  return {
    totalMinutes,
    readyAt,
    minutesLeft: Math.max(1, Math.ceil(remainingMs / 60_000)),
    late: remainingMs < 0,
  };
}

export function etaToJson(eta: OrderEta | null) {
  return eta
    ? {
        totalMinutes: eta.totalMinutes,
        readyAt: eta.readyAt.toISOString(),
        minutesLeft: eta.minutesLeft,
        late: eta.late,
      }
    : null;
}

export interface OrderEtaEstimator {
  estimate(order: OrderRecord, now: Date): Promise<OrderEta | null>;
}

export class MongoOrderEtaEstimator implements OrderEtaEstimator {
  private readonly orders;
  private readonly menuItems;

  constructor(db: Db) {
    this.orders = db.collection<OrderDocument>(COLLECTIONS.orders);
    this.menuItems = db.collection<MenuItemDocument>(COLLECTIONS.menuItems);
  }

  async estimate(order: OrderRecord, now: Date): Promise<OrderEta | null> {
    if (!OPEN_KITCHEN_STATUSES.includes(order.status)) return null;
    const menuItemIds: ObjectId[] = order.items.map((item) => item.menuItemId);
    const [menu, ordersAhead] = await Promise.all([
      this.menuItems
        .find(
          { _id: { $in: menuItemIds }, restaurantId: order.restaurantId },
          { projection: { prepMinutes: 1 } },
        )
        .toArray(),
      this.orders.countDocuments(
        {
          restaurantId: order.restaurantId,
          status: { $in: [...OPEN_KITCHEN_STATUSES] },
          createdAt: { $lt: order.createdAt },
        },
        { limit: 100 },
      ),
    ]);
    const prepById = new Map(menu.map((item) => [item._id.toHexString(), item.prepMinutes]));
    return estimateOrderEta({
      placedAt: order.createdAt,
      status: order.status,
      prepMinutes: order.items.map((item) => prepById.get(item.menuItemId.toHexString())),
      ordersAhead,
      now,
    });
  }
}
