import { ObjectId } from "mongodb";
import type { MenuOptionGroup, OrderItemOption } from "../database/schema.js";
import type { HealthScoreRefreshNotifier } from "../healthscore/health-score.types.js";
import type { IncidentDetectionNotifier } from "../incidents/incident.types.js";
import type { RestaurantRealtimePublisher } from "../realtime/realtime.types.js";
import type {
  NewCustomerOrderRequest,
  OrderItemSnapshot,
  OrderRecord,
  OrderRepository,
  OrderRequestLine,
  OrderServiceReader,
  TableTokenResolver,
} from "./order.types.js";

export const ORDER_MAX_LINES = 20;
export const ORDER_MAX_QUANTITY_PER_LINE = 20;
export const ORDER_MAX_TOTAL_UNITS = 50;

export class OrderError extends Error {
  constructor(
    readonly statusCode: 400 | 403 | 404 | 409 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OrderError";
  }
}

export class OrderService implements OrderServiceReader {
  constructor(
    private readonly repository: OrderRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly notifyHealthScoreRefresh: HealthScoreRefreshNotifier = () => undefined,
    private readonly notifyIncidentDetection: IncidentDetectionNotifier = () => undefined,
    private readonly publishRealtime: RestaurantRealtimePublisher = () => undefined,
    private readonly resolveTable?: TableTokenResolver,
  ) {}

  async createForCustomer(request: NewCustomerOrderRequest): Promise<OrderRecord> {
    const now = this.clock();
    validateOrderLines(request.items);
    const table = await this.tableFor(request);

    const restaurant = await this.repository.getActiveRestaurant(request.restaurantId);
    if (!restaurant) {
      throw new OrderError(404, "restaurant_not_found", "The restaurant was not found.");
    }
    if (!restaurant.name.trim() || !/^[A-Z]{3}$/.test(restaurant.currency)) {
      throw new OrderError(
        503,
        "order_configuration_unavailable",
        "The restaurant is not configured to accept orders.",
      );
    }

    const menuItemIds = [
      ...new Map(
        request.items.map((item) => [item.menuItemId.toHexString(), item.menuItemId]),
      ).values(),
    ];
    const menuItems = await this.repository.getAvailableMenuItems(
      request.restaurantId,
      menuItemIds,
    );
    const menuById = new Map(menuItems.map((item) => [item.id.toHexString(), item]));
    if (menuById.size !== menuItemIds.length) {
      throw new OrderError(
        409,
        "order_menu_item_unavailable",
        "One or more selected items are unavailable. Refresh the menu and try again.",
      );
    }

    const snapshots: OrderItemSnapshot[] = [];
    let totalMinor = 0;
    for (const line of request.items) {
      const item = menuById.get(line.menuItemId.toHexString());
      if (!item) {
        throw new OrderError(
          409,
          "order_menu_item_unavailable",
          "One or more selected items are unavailable. Refresh the menu and try again.",
        );
      }
      const chosen = resolveOptions(item.optionGroups ?? [], line.options ?? {});
      if (!Number.isSafeInteger(item.priceMinor) || item.priceMinor <= 0) {
        throw new OrderError(
          503,
          "order_configuration_unavailable",
          "A menu item has an invalid price and cannot be ordered.",
        );
      }
      const unitPriceMinor = chosen.reduce(
        (total, option) => total + option.priceDeltaMinor,
        item.priceMinor,
      );
      const lineTotal = unitPriceMinor * line.quantity;
      if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(totalMinor + lineTotal)) {
        throw new OrderError(
          400,
          "order_total_too_large",
          "The order total exceeds the allowed range.",
        );
      }
      totalMinor += lineTotal;
      snapshots.push({
        menuItemId: item.id,
        nameSnapshot: item.name,
        unitPriceMinor,
        quantity: line.quantity,
        ...(chosen.length > 0 ? { options: chosen } : {}),
        preparationStatus: "Created",
      });
    }

    const customerId = await this.customerIdForUser(request.userId, now);
    const created = await this.repository.createOrder(
      {
        restaurantId: request.restaurantId,
        customerId,
        totalMinor,
        currency: restaurant.currency,
        status: "Created",
        statusTimestamps: { Created: now },
        ...(table ? { tableId: table.tableId } : {}),
      },
      snapshots,
      now,
    );
    this.notifyHealthScoreRefresh(request.restaurantId);
    this.notifyIncidentDetection(request.restaurantId);
    this.publishRealtime({
      restaurantId: request.restaurantId,
      event: "order.updated",
      data: { orderId: created.id.toHexString(), status: created.status },
    });
    return {
      ...created,
      restaurantName: restaurant.name,
      ...(table ? { tableNumber: table.tableNumber } : {}),
    };
  }

  /** A QR order must carry a valid token for a table of the same restaurant. */
  private async tableFor(request: NewCustomerOrderRequest) {
    if (request.tableToken === undefined) return null;
    if (!this.resolveTable) {
      throw new OrderError(503, "table_ordering_unavailable", "Table ordering is unavailable.");
    }
    let table: Awaited<ReturnType<TableTokenResolver>>;
    try {
      table = await this.resolveTable(request.tableToken);
    } catch {
      throw new OrderError(
        400,
        "invalid_table_token",
        "This table link is not valid. Ask a server for help.",
      );
    }
    if (!table.restaurantId.equals(request.restaurantId)) {
      throw new OrderError(
        400,
        "invalid_table_token",
        "This table link belongs to another restaurant.",
      );
    }
    return table;
  }

  async listForCustomer(userId: ObjectId) {
    const customerId = await this.customerIdForUser(userId);
    return this.repository.listForCustomer(customerId);
  }

  async getForCustomer(userId: ObjectId, orderId: ObjectId): Promise<OrderRecord> {
    const customerId = await this.customerIdForUser(userId);
    const order = await this.repository.findForCustomer(orderId, customerId);
    if (!order) throw new OrderError(404, "order_not_found", "The order was not found.");
    return order;
  }

  async cancelForCustomer(userId: ObjectId, orderId: ObjectId): Promise<OrderRecord> {
    const customerId = await this.customerIdForUser(userId);
    const current = await this.repository.findForCustomer(orderId, customerId);
    if (!current) {
      throw new OrderError(404, "order_not_found", "The order was not found.");
    }
    if (current.status !== "Created") {
      throw new OrderError(
        409,
        "order_cannot_be_cancelled",
        "An order can only be cancelled before restaurant acceptance.",
      );
    }

    const cancelled = await this.repository.cancelForCustomer(
      orderId,
      customerId,
      current.updatedAt,
      this.clock(),
    );
    if (!cancelled) {
      throw new OrderError(
        409,
        "order_changed",
        "The order changed while cancellation was being processed. Refresh and try again.",
      );
    }
    this.notifyHealthScoreRefresh(current.restaurantId);
    this.notifyIncidentDetection(current.restaurantId);
    this.publishRealtime({
      restaurantId: current.restaurantId,
      event: "order.updated",
      data: { orderId: cancelled.id.toHexString(), status: cancelled.status },
    });
    return cancelled;
  }

  private async customerIdForUser(userId: ObjectId, now = this.clock()): Promise<ObjectId> {
    const customerId = await this.repository.getCustomerIdForUser(userId, now);
    if (!customerId) {
      throw new OrderError(
        403,
        "customer_profile_required",
        "An active customer account is required to place or manage orders.",
      );
    }
    return customerId;
  }
}

function validateOrderLines(lines: OrderRequestLine[]): void {
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > ORDER_MAX_LINES) {
    throw new OrderError(
      400,
      "invalid_order_lines",
      `Orders must contain between 1 and ${ORDER_MAX_LINES} distinct items.`,
    );
  }

  const itemIds = new Set<string>();
  let totalUnits = 0;
  for (const line of lines) {
    if (!(line.menuItemId instanceof ObjectId)) {
      throw new OrderError(
        400,
        "invalid_order_lines",
        "Each order line needs a valid menu item ID.",
      );
    }
    // The same dish may appear twice with different options (one mild, one hot).
    const itemId = `${line.menuItemId.toHexString()}:${optionKey(line.options)}`;
    if (itemIds.has(itemId)) {
      throw new OrderError(
        400,
        "duplicate_order_item",
        "Combine repeated menu items with the same options into one quantity per order line.",
      );
    }
    itemIds.add(itemId);
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > ORDER_MAX_QUANTITY_PER_LINE
    ) {
      throw new OrderError(
        400,
        "invalid_order_quantity",
        `Each item quantity must be a whole number from 1 to ${ORDER_MAX_QUANTITY_PER_LINE}.`,
      );
    }
    totalUnits += line.quantity;
  }

  if (totalUnits > ORDER_MAX_TOTAL_UNITS) {
    throw new OrderError(
      400,
      "order_quantity_limit_exceeded",
      `An order may contain at most ${ORDER_MAX_TOTAL_UNITS} total items.`,
    );
  }
}

function optionKey(options: Record<string, string> | undefined): string {
  return Object.entries(options ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([group, choice]) => `${group}=${choice}`)
    .join("&");
}

/**
 * Turns `{ spice: "hot" }` into the stored snapshot. Every chosen group and
 * choice must exist on the item, and every required group must be answered.
 */
export function resolveOptions(
  groups: MenuOptionGroup[],
  selected: Record<string, string>,
): OrderItemOption[] {
  for (const groupId of Object.keys(selected)) {
    if (!groups.some((group) => group.id === groupId)) {
      throw new OrderError(
        400,
        "invalid_order_options",
        "An order line names an option this item does not have.",
      );
    }
  }
  const chosen: OrderItemOption[] = [];
  for (const group of groups) {
    const choiceId = selected[group.id];
    if (choiceId === undefined) {
      if (group.required) {
        throw new OrderError(
          400,
          "order_option_required",
          `Choose a ${group.name.toLowerCase()} for every item that needs one.`,
        );
      }
      continue;
    }
    const choice = group.choices.find((candidate) => candidate.id === choiceId);
    if (!choice) {
      throw new OrderError(
        400,
        "invalid_order_options",
        "An order line names an option this item does not have.",
      );
    }
    chosen.push({
      group: group.name,
      choice: choice.label,
      priceDeltaMinor: choice.priceDeltaMinor,
    });
  }
  return chosen;
}
