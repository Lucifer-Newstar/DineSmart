import { ObjectId } from "mongodb";
import type { HealthScoreRefreshNotifier } from "../healthscore/health-score.types.js";
import type { IncidentDetectionNotifier } from "../incidents/incident.types.js";
import type {
  NewCustomerOrderRequest,
  OrderItemSnapshot,
  OrderRecord,
  OrderRepository,
  OrderRequestLine,
  OrderServiceReader,
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
  ) {}

  async createForCustomer(request: NewCustomerOrderRequest): Promise<OrderRecord> {
    const now = this.clock();
    validateOrderLines(request.items);

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

    const menuItemIds = request.items.map((item) => item.menuItemId);
    const menuItems = await this.repository.getAvailableMenuItems(
      request.restaurantId,
      menuItemIds,
    );
    const menuById = new Map(menuItems.map((item) => [item.id.toHexString(), item]));
    if (menuById.size !== request.items.length) {
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
      if (!Number.isSafeInteger(item.priceMinor) || item.priceMinor <= 0) {
        throw new OrderError(
          503,
          "order_configuration_unavailable",
          "A menu item has an invalid price and cannot be ordered.",
        );
      }
      const lineTotal = item.priceMinor * line.quantity;
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
        unitPriceMinor: item.priceMinor,
        quantity: line.quantity,
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
      },
      snapshots,
      now,
    );
    this.notifyHealthScoreRefresh(request.restaurantId);
    this.notifyIncidentDetection(request.restaurantId);
    return { ...created, restaurantName: restaurant.name };
  }

  async listForCustomer(userId: ObjectId) {
    const customerId = await this.customerIdForUser(userId);
    return this.repository.listForCustomer(customerId);
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
    const itemId = line.menuItemId.toHexString();
    if (itemIds.has(itemId)) {
      throw new OrderError(
        400,
        "duplicate_order_item",
        "Combine repeated menu items into one quantity per order line.",
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
