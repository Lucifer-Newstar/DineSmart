import { type Db, ObjectId, type WithId } from "mongodb";
import { MongoCustomerProfileRepository } from "../customers/customer-profile.repository.js";
import {
  COLLECTIONS,
  type MenuItemDocument,
  type OrderDocument,
  type OrderItemDocument,
  type OrderStatus,
  type PreparationStatus,
  type RestaurantDocument,
} from "../database/schema.js";
import {
  KITCHEN_QUEUE_LIMIT,
  KITCHEN_QUEUE_STATUSES,
  type KitchenQueueResult,
  type StaffOrderRepository,
} from "./order.staff.types.js";
import type {
  ActiveOrderRestaurant,
  NewOrder,
  OrderItemRecord,
  OrderItemSnapshot,
  OrderListResult,
  OrderRecord,
  OrderRepository,
} from "./order.types.js";
import { ORDER_HISTORY_LIMIT } from "./order.types.js";

export class MongoOrderRepository implements OrderRepository, StaffOrderRepository {
  private readonly customerProfiles: MongoCustomerProfileRepository;
  private readonly menuItems;
  private readonly orderItems;
  private readonly orders;
  private readonly restaurants;

  constructor(db: Db) {
    this.customerProfiles = new MongoCustomerProfileRepository(db);
    this.menuItems = db.collection<MenuItemDocument>(COLLECTIONS.menuItems);
    this.orderItems = db.collection<OrderItemDocument>(COLLECTIONS.orderItems);
    this.orders = db.collection<OrderDocument>(COLLECTIONS.orders);
    this.restaurants = db.collection<RestaurantDocument>(COLLECTIONS.restaurants);
  }

  getCustomerIdForUser(userId: ObjectId, now: Date): Promise<ObjectId | null> {
    return this.customerProfiles.getCustomerIdForUser(userId, now);
  }

  async getActiveRestaurant(restaurantId: ObjectId): Promise<ActiveOrderRestaurant | null> {
    const restaurant = await this.restaurants.findOne(
      { _id: restaurantId, status: "active" },
      { projection: { _id: 1, name: 1, currency: 1 } },
    );
    if (!restaurant) return null;
    return { id: restaurant._id, name: restaurant.name, currency: restaurant.currency };
  }

  async getAvailableMenuItems(
    restaurantId: ObjectId,
    menuItemIds: ObjectId[],
  ): Promise<Array<{ id: ObjectId; name: string; priceMinor: number }>> {
    const items = await this.menuItems
      .find(
        { _id: { $in: menuItemIds }, restaurantId, isAvailable: true },
        { projection: { _id: 1, name: 1, priceMinor: 1 } },
      )
      .toArray();
    return items.map((item) => ({ id: item._id, name: item.name, priceMinor: item.priceMinor }));
  }

  async createOrder(order: NewOrder, items: OrderItemSnapshot[], now: Date): Promise<OrderRecord> {
    const orderId = new ObjectId();
    const orderItems: Array<OrderItemDocument & { _id: ObjectId }> = items.map((item) => ({
      ...item,
      restaurantId: order.restaurantId,
      orderId,
      createdAt: now,
      updatedAt: now,
      _id: new ObjectId(),
    }));
    const orderDocument: OrderDocument & { _id: ObjectId } = {
      ...order,
      _id: orderId,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.orderItems.insertMany(orderItems, { ordered: true });
      // The parent is written last so an order is not visible before its items exist.
      await this.orders.insertOne(orderDocument);
    } catch (error) {
      // Standalone MongoDB cannot atomically write both collections; clean up partial writes.
      await Promise.allSettled([
        this.orderItems.deleteMany({ restaurantId: order.restaurantId, orderId }),
        this.orders.deleteOne({
          _id: orderId,
          restaurantId: order.restaurantId,
          customerId: order.customerId,
          status: "Created",
        }),
      ]);
      throw error;
    }

    return toOrderRecord(orderDocument, "Restaurant", orderItems.map(toItemRecord));
  }

  async listForCustomer(customerId: ObjectId): Promise<OrderListResult> {
    const documents = await this.orders
      .find({ customerId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(ORDER_HISTORY_LIMIT + 1)
      .toArray();
    const truncated = documents.length > ORDER_HISTORY_LIMIT;
    const visibleOrders = documents.slice(0, ORDER_HISTORY_LIMIT);
    if (visibleOrders.length === 0) return { orders: [], truncated };

    const itemFilter = {
      $or: visibleOrders.map((order) => ({ restaurantId: order.restaurantId, orderId: order._id })),
    };
    const restaurantIds = [
      ...new Map(
        visibleOrders.map((order) => [order.restaurantId.toHexString(), order.restaurantId]),
      ).values(),
    ];
    const [items, restaurants] = await Promise.all([
      this.orderItems.find(itemFilter).sort({ createdAt: 1, _id: 1 }).toArray(),
      this.restaurants.find({ _id: { $in: restaurantIds } }).toArray(),
    ]);
    const restaurantNames = new Map(
      restaurants.map((restaurant) => [restaurant._id.toHexString(), restaurant.name]),
    );
    const itemsByOrder = groupItemsByOrder(items);

    return {
      orders: visibleOrders.map((order) =>
        toOrderRecord(
          order,
          restaurantNames.get(order.restaurantId.toHexString()) ?? "Restaurant",
          itemsByOrder.get(order._id.toHexString()) ?? [],
        ),
      ),
      truncated,
    };
  }

  async listKitchenQueue(restaurantId: ObjectId): Promise<KitchenQueueResult> {
    const documents = await this.orders
      .find({ restaurantId, status: { $in: [...KITCHEN_QUEUE_STATUSES] } })
      .sort({ createdAt: 1, _id: 1 })
      .limit(KITCHEN_QUEUE_LIMIT + 1)
      .toArray();
    const truncated = documents.length > KITCHEN_QUEUE_LIMIT;
    const visibleOrders = documents.slice(0, KITCHEN_QUEUE_LIMIT);
    if (visibleOrders.length === 0) return { tickets: [], truncated };

    const items = await this.orderItems
      .find({
        restaurantId,
        orderId: { $in: visibleOrders.map((order) => order._id) },
      })
      .sort({ createdAt: 1, _id: 1 })
      .toArray();
    const itemsByOrder = groupItemsByOrder(items);

    return {
      tickets: visibleOrders.map((order) => ({
        id: order._id,
        status: order.status as (typeof KITCHEN_QUEUE_STATUSES)[number],
        items: (itemsByOrder.get(order._id.toHexString()) ?? []).map((item) => ({
          id: item.id,
          name: item.nameSnapshot,
          quantity: item.quantity,
          preparationStatus: item.preparationStatus,
        })),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      })),
      truncated,
    };
  }

  async findForRestaurant(orderId: ObjectId, restaurantId: ObjectId): Promise<OrderRecord | null> {
    const order = await this.orders.findOne({ _id: orderId, restaurantId });
    if (!order) return null;

    const [items, restaurant] = await Promise.all([
      this.orderItems
        .find({ restaurantId, orderId: order._id })
        .sort({ createdAt: 1, _id: 1 })
        .toArray(),
      this.restaurants.findOne({ _id: restaurantId }, { projection: { _id: 1, name: 1 } }),
    ]);
    return toOrderRecord(order, restaurant?.name ?? "Restaurant", items.map(toItemRecord));
  }

  async updateOrderStatusIfCurrent(
    orderId: ObjectId,
    restaurantId: ObjectId,
    expectedStatus: OrderStatus,
    expectedUpdatedAt: Date,
    nextStatus: OrderStatus,
    now: Date,
  ): Promise<boolean> {
    const timestampPath = `statusTimestamps.${nextStatus}`;
    const result = await this.orders.updateOne(
      { _id: orderId, restaurantId, status: expectedStatus, updatedAt: expectedUpdatedAt },
      {
        $set: {
          status: nextStatus,
          updatedAt: now,
          [timestampPath]: now,
        },
      },
    );
    return result.matchedCount === 1;
  }

  async updateItemPreparationStatusIfCurrent(
    orderId: ObjectId,
    restaurantId: ObjectId,
    itemId: ObjectId,
    expectedStatus: PreparationStatus,
    nextStatus: PreparationStatus,
    now: Date,
  ): Promise<boolean> {
    const result = await this.orderItems.updateOne(
      { _id: itemId, restaurantId, orderId, preparationStatus: expectedStatus },
      { $set: { preparationStatus: nextStatus, updatedAt: now } },
    );
    return result.matchedCount === 1;
  }

  async listItemPreparationStatuses(
    orderId: ObjectId,
    restaurantId: ObjectId,
  ): Promise<PreparationStatus[]> {
    const items = await this.orderItems
      .find({ restaurantId, orderId }, { projection: { _id: 0, preparationStatus: 1 } })
      .toArray();
    return items.map((item) => item.preparationStatus);
  }

  async findForCustomer(orderId: ObjectId, customerId: ObjectId): Promise<OrderRecord | null> {
    const order = await this.orders.findOne({ _id: orderId, customerId });
    if (!order) return null;
    const [items, restaurant] = await Promise.all([
      this.orderItems
        .find({ restaurantId: order.restaurantId, orderId: order._id })
        .sort({ createdAt: 1, _id: 1 })
        .toArray(),
      this.restaurants.findOne({ _id: order.restaurantId }, { projection: { _id: 1, name: 1 } }),
    ]);
    return toOrderRecord(order, restaurant?.name ?? "Restaurant", items.map(toItemRecord));
  }

  async cancelForCustomer(
    orderId: ObjectId,
    customerId: ObjectId,
    expectedUpdatedAt: Date,
    now: Date,
  ): Promise<OrderRecord | null> {
    const result = await this.orders.updateOne(
      { _id: orderId, customerId, status: "Created", updatedAt: expectedUpdatedAt },
      {
        $set: {
          status: "Cancelled",
          updatedAt: now,
          "statusTimestamps.Cancelled": now,
        },
      },
    );
    if (result.matchedCount === 0) return null;
    return this.findForCustomer(orderId, customerId);
  }
}

function toItemRecord(item: WithId<OrderItemDocument>): OrderItemRecord {
  return {
    id: item._id,
    menuItemId: item.menuItemId,
    nameSnapshot: item.nameSnapshot,
    unitPriceMinor: item.unitPriceMinor,
    quantity: item.quantity,
    preparationStatus: item.preparationStatus,
  };
}

function groupItemsByOrder(
  items: Array<WithId<OrderItemDocument>>,
): Map<string, OrderItemRecord[]> {
  const grouped = new Map<string, OrderItemRecord[]>();
  for (const item of items) {
    const key = item.orderId.toHexString();
    const current = grouped.get(key) ?? [];
    current.push(toItemRecord(item));
    grouped.set(key, current);
  }
  return grouped;
}

function toOrderRecord(
  order: WithId<OrderDocument>,
  restaurantName: string,
  items: OrderItemRecord[],
): OrderRecord {
  return {
    id: order._id,
    restaurantId: order.restaurantId,
    restaurantName,
    status: order.status,
    totalMinor: order.totalMinor,
    currency: order.currency,
    items,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
