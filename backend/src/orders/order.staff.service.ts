import type { ObjectId } from "mongodb";
import type { OrderStatus, PreparationStatus } from "../database/schema.js";
import type { HealthScoreRefreshNotifier } from "../healthscore/health-score.types.js";
import type { IncidentDetectionNotifier } from "../incidents/incident.types.js";
import type { RestaurantRealtimePublisher } from "../realtime/realtime.types.js";
import { OrderError } from "./order.service.js";
import type {
  KitchenPreparationUpdate,
  StaffOrderRepository,
  StaffOrderServiceReader,
  StaffOrderView,
} from "./order.staff.types.js";
import { KITCHEN_QUEUE_STATUSES, STAFF_ORDER_LIST_STATUSES } from "./order.staff.types.js";
import type { OrderRecord } from "./order.types.js";

const STAFF_ORDER_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus>> = {
  Created: "Accepted",
  Ready: "Served",
  Served: "Completed",
};

const ITEM_PREPARATION_TRANSITIONS: Record<PreparationStatus, KitchenPreparationUpdate | null> = {
  Created: "Preparing",
  Preparing: "Ready",
  Ready: null,
};

const HEADER_SYNC_ATTEMPTS = 6;

export class StaffOrderService implements StaffOrderServiceReader {
  constructor(
    private readonly repository: StaffOrderRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly notifyHealthScoreRefresh: HealthScoreRefreshNotifier = () => undefined,
    private readonly notifyIncidentDetection: IncidentDetectionNotifier = () => undefined,
    private readonly publishRealtime: RestaurantRealtimePublisher = () => undefined,
  ) {}

  listRestaurantOrders(restaurantId: ObjectId, view: StaffOrderView) {
    const statuses = view === "kitchen" ? KITCHEN_QUEUE_STATUSES : STAFF_ORDER_LIST_STATUSES;
    return this.repository.listRestaurantOrders(restaurantId, statuses);
  }

  listKitchenQueue(restaurantId: ObjectId) {
    return this.repository.listKitchenQueue(restaurantId);
  }

  async updateOrderStatus(
    restaurantId: ObjectId,
    orderId: ObjectId,
    nextStatus: OrderStatus,
  ): Promise<OrderRecord> {
    const current = await this.findOrder(orderId, restaurantId);
    if (STAFF_ORDER_TRANSITIONS[current.status] !== nextStatus) {
      throw new OrderError(
        409,
        "invalid_order_transition",
        "The order cannot be moved to the requested status.",
      );
    }

    const updated = await this.repository.updateOrderStatusIfCurrent(
      orderId,
      restaurantId,
      current.status,
      current.updatedAt,
      nextStatus,
      this.clock(),
    );
    if (!updated) {
      throw new OrderError(
        409,
        "order_changed",
        "The order changed while the update was being processed. Refresh and try again.",
      );
    }

    this.notifyHealthScoreRefresh(restaurantId);
    this.notifyIncidentDetection(restaurantId);
    this.publishRealtime({
      restaurantId,
      event: "order.updated",
      data: { orderId: orderId.toHexString(), status: nextStatus },
    });
    return this.findOrder(orderId, restaurantId);
  }

  async updateItemPreparationStatus(
    restaurantId: ObjectId,
    orderId: ObjectId,
    itemId: ObjectId,
    nextStatus: KitchenPreparationUpdate,
  ): Promise<OrderRecord> {
    const current = await this.findOrder(orderId, restaurantId);
    const item = current.items.find((candidate) => candidate.id.equals(itemId));
    if (!item) {
      throw new OrderError(404, "order_item_not_found", "The order item was not found.");
    }

    if (item.preparationStatus === nextStatus) {
      const reconciled = await this.synchronizeHeader(orderId, restaurantId);
      this.notifyHealthScoreRefresh(restaurantId);
      this.notifyIncidentDetection(restaurantId);
      this.publishRealtime({
        restaurantId,
        event: "order.updated",
        data: { orderId: orderId.toHexString(), status: reconciled.status },
      });
      return reconciled;
    }

    const expectedNext = ITEM_PREPARATION_TRANSITIONS[item.preparationStatus];
    if (expectedNext !== nextStatus || !isKitchenWorkInProgress(current.status)) {
      throw new OrderError(
        409,
        "invalid_preparation_transition",
        "The item cannot be moved to the requested preparation status.",
      );
    }

    const updated = await this.repository.updateItemPreparationStatusIfCurrent(
      orderId,
      restaurantId,
      itemId,
      item.preparationStatus,
      nextStatus,
      this.clock(),
    );

    if (!updated) {
      const latest = await this.findOrder(orderId, restaurantId);
      const latestItem = latest.items.find((candidate) => candidate.id.equals(itemId));
      if (!latestItem || latestItem.preparationStatus !== nextStatus) {
        throw new OrderError(
          409,
          "order_changed",
          "The order item changed while the update was being processed. Refresh and try again.",
        );
      }
    }

    this.notifyHealthScoreRefresh(restaurantId);
    this.notifyIncidentDetection(restaurantId);
    const synchronized = await this.synchronizeHeader(orderId, restaurantId);
    this.publishRealtime({
      restaurantId,
      event: "order.updated",
      data: { orderId: orderId.toHexString(), status: synchronized.status },
    });
    return synchronized;
  }

  private async findOrder(orderId: ObjectId, restaurantId: ObjectId): Promise<OrderRecord> {
    const order = await this.repository.findForRestaurant(orderId, restaurantId);
    if (!order) {
      throw new OrderError(404, "order_not_found", "The order was not found.");
    }
    return order;
  }

  /**
   * Derive the order header from item state using conditional writes. A retry
   * of an already-applied item update also runs this reconciliation, so a
   * client retry can repair the non-transactional item/header write boundary.
   */
  private async synchronizeHeader(orderId: ObjectId, restaurantId: ObjectId): Promise<OrderRecord> {
    for (let attempt = 0; attempt < HEADER_SYNC_ATTEMPTS; attempt += 1) {
      const current = await this.findOrder(orderId, restaurantId);
      if (!isKitchenWorkInProgress(current.status)) return current;

      const preparationStatuses = await this.repository.listItemPreparationStatuses(
        orderId,
        restaurantId,
      );
      if (preparationStatuses.length === 0) {
        throw new OrderError(
          503,
          "order_items_unavailable",
          "The order items could not be loaded for status synchronization.",
        );
      }

      const allReady = preparationStatuses.every((status) => status === "Ready");
      const anyStarted = preparationStatuses.some((status) => status !== "Created");
      const nextStatus: OrderStatus | null =
        current.status === "Accepted" && anyStarted
          ? "Preparing"
          : current.status === "Preparing" && allReady
            ? "Ready"
            : null;

      if (!nextStatus) return current;

      const updated = await this.repository.updateOrderStatusIfCurrent(
        orderId,
        restaurantId,
        current.status,
        current.updatedAt,
        nextStatus,
        this.clock(),
      );
      if (updated) continue;
      // Another item update or front-of-house transition won the compare-and-set.
      // Re-read both parent and child state before deciding whether to retry.
    }

    const latest = await this.findOrder(orderId, restaurantId);
    throw new OrderError(
      409,
      "order_changed",
      `The order changed while kitchen progress was being synchronized (current status: ${latest.status}). Retry the item update to reconcile it.`,
    );
  }
}

function isKitchenWorkInProgress(status: OrderStatus): status is "Accepted" | "Preparing" {
  return status === "Accepted" || status === "Preparing";
}
