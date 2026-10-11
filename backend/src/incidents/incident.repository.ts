import type { Db, ObjectId, WithId } from "mongodb";
import {
  COLLECTIONS,
  type IncidentDocument,
  type InventoryItemDocument,
  type OrderDocument,
  type OrderItemDocument,
  type ReservationDocument,
  type RestaurantDocument,
  type TableDocument,
} from "../database/schema.js";
import type {
  DetectionInventoryItem,
  DetectionOrder,
  DetectionOrderItem,
  DetectionReservation,
  DetectionTable,
  IncidentCandidate,
  IncidentDetectionRepository,
  IncidentDetectionSnapshot,
  IncidentListResult,
  IncidentRecord,
} from "./incident.types.js";
import { incidentActiveKey } from "./incident.types.js";

export const INCIDENT_SOURCE_RECORD_LIMIT = 2_000;
export const INCIDENT_LIST_LIMIT = 200;

function bounded<T>(source: string, records: T[], truncatedSources: Set<string>): T[] {
  if (records.length > INCIDENT_SOURCE_RECORD_LIMIT) {
    truncatedSources.add(source);
    return records.slice(0, INCIDENT_SOURCE_RECORD_LIMIT);
  }
  return records;
}

function incidentRecord(
  document: WithId<IncidentDocument>,
  restaurantId: ObjectId,
): IncidentRecord {
  return {
    id: document._id,
    restaurantId: document.restaurantId ?? restaurantId,
    type: document.type,
    severity: document.severity,
    status: document.status,
    triggerSnapshot: document.triggerSnapshot,
    affectedEntity: document.affectedEntity,
    ...(document.rootCause === undefined ? {} : { rootCause: document.rootCause }),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    ...(document.resolvedAt === undefined ? {} : { resolvedAt: document.resolvedAt }),
    ...(document.resolutionReason === undefined
      ? {}
      : { resolutionReason: document.resolutionReason }),
  };
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export class MongoIncidentDetectionRepository implements IncidentDetectionRepository {
  private readonly incidents;
  private readonly inventoryItems;
  private readonly orderItems;
  private readonly orders;
  private readonly reservations;
  private readonly restaurants;
  private readonly tables;

  constructor(db: Db) {
    this.incidents = db.collection<IncidentDocument>(COLLECTIONS.incidents);
    this.inventoryItems = db.collection<InventoryItemDocument>(COLLECTIONS.inventoryItems);
    this.orderItems = db.collection<OrderItemDocument>(COLLECTIONS.orderItems);
    this.orders = db.collection<OrderDocument>(COLLECTIONS.orders);
    this.reservations = db.collection<ReservationDocument>(COLLECTIONS.reservations);
    this.restaurants = db.collection<RestaurantDocument>(COLLECTIONS.restaurants);
    this.tables = db.collection<TableDocument>(COLLECTIONS.tables);
  }

  async listActiveRestaurantIds(): Promise<ObjectId[]> {
    const restaurants = await this.restaurants
      .find({ status: "active" }, { projection: { _id: 1 } })
      .sort({ _id: 1 })
      .toArray();
    return restaurants.map((restaurant) => restaurant._id);
  }

  async getSnapshot(restaurantId: ObjectId, now: Date): Promise<IncidentDetectionSnapshot> {
    const truncatedSources = new Set<string>();
    const [restaurant, orderRecords, inventoryRecords, reservationRecords, tableRecords] =
      await Promise.all([
        this.restaurants.findOne({ _id: restaurantId }, { projection: { thresholds: 1 } }),
        this.orders
          .find(
            { restaurantId, status: { $in: ["Accepted", "Preparing", "Ready"] } },
            { projection: { status: 1, createdAt: 1, statusTimestamps: 1 } },
          )
          .sort({ createdAt: 1, _id: 1 })
          .limit(INCIDENT_SOURCE_RECORD_LIMIT + 1)
          .toArray(),
        this.inventoryItems
          .find({ restaurantId }, { projection: { quantity: 1, lowStockThreshold: 1, unit: 1 } })
          .sort({ _id: 1 })
          .limit(INCIDENT_SOURCE_RECORD_LIMIT + 1)
          .toArray(),
        this.reservations
          .find(
            {
              restaurantId,
              status: { $in: ["Confirmed", "Seated"] },
              endAt: { $gt: now },
            },
            { projection: { partySize: 1, startAt: 1, endAt: 1, tableId: 1, status: 1 } },
          )
          .sort({ startAt: 1, _id: 1 })
          .limit(INCIDENT_SOURCE_RECORD_LIMIT + 1)
          .toArray(),
        this.tables
          .find({ restaurantId }, { projection: { capacity: 1, status: 1 } })
          .sort({ _id: 1 })
          .limit(INCIDENT_SOURCE_RECORD_LIMIT + 1)
          .toArray(),
      ]);

    const visibleOrders = bounded("orders", orderRecords, truncatedSources);
    const visibleInventory = bounded("inventoryItems", inventoryRecords, truncatedSources);
    const visibleReservations = bounded("reservations", reservationRecords, truncatedSources);
    const visibleTables = bounded("tables", tableRecords, truncatedSources);
    const orderIds = visibleOrders.map((order) => order._id);
    const orderItemRecords =
      orderIds.length === 0
        ? []
        : await this.orderItems
            .find(
              {
                restaurantId,
                orderId: { $in: orderIds },
                preparationStatus: "Preparing",
              },
              { projection: { orderId: 1, preparationStatus: 1, updatedAt: 1 } },
            )
            .sort({ updatedAt: 1, _id: 1 })
            .limit(INCIDENT_SOURCE_RECORD_LIMIT + 1)
            .toArray();
    const visibleOrderItems = bounded("orderItems", orderItemRecords, truncatedSources);

    const orders: DetectionOrder[] = visibleOrders.map((order) => ({
      id: order._id,
      status: order.status,
      createdAt: order.createdAt,
      statusTimestamps: order.statusTimestamps,
    }));
    const orderItems: DetectionOrderItem[] = visibleOrderItems.map((item) => ({
      id: item._id,
      orderId: item.orderId,
      preparationStatus: item.preparationStatus,
      updatedAt: item.updatedAt,
    }));
    const inventory: DetectionInventoryItem[] = visibleInventory.map((item) => ({
      id: item._id,
      quantity: item.quantity,
      lowStockThreshold: item.lowStockThreshold,
      unit: item.unit,
    }));
    const reservations: DetectionReservation[] = visibleReservations.map((reservation) => ({
      id: reservation._id,
      partySize: reservation.partySize,
      startAt: reservation.startAt,
      endAt: reservation.endAt,
      tableId: reservation.tableId,
      status: reservation.status,
    }));
    const tables: DetectionTable[] = visibleTables.map((table) => ({
      id: table._id,
      capacity: table.capacity,
      status: table.status,
    }));

    return {
      restaurantId,
      thresholds: restaurant?.thresholds ?? {},
      orders,
      orderItems,
      inventoryItems: inventory,
      reservations,
      tables,
      truncatedSources: [...truncatedSources],
    };
  }

  async listActiveIncidents(restaurantId: ObjectId): Promise<IncidentListResult> {
    const records = await this.incidents
      .find({ restaurantId, status: { $in: ["open", "active"] } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(INCIDENT_SOURCE_RECORD_LIMIT + 1)
      .toArray();
    const truncated = records.length > INCIDENT_SOURCE_RECORD_LIMIT;
    return {
      incidents: records
        .slice(0, INCIDENT_SOURCE_RECORD_LIMIT)
        .map((record) => incidentRecord(record, restaurantId)),
      truncated,
    };
  }

  async upsertActiveIncident(
    restaurantId: ObjectId,
    incident: IncidentCandidate,
    now: Date,
  ): Promise<void> {
    const activeKey = incidentActiveKey(restaurantId, incident);
    const identity = {
      restaurantId,
      type: incident.type,
      "affectedEntity.type": incident.affectedEntity.type,
      "affectedEntity.id": incident.affectedEntity.id,
      status: { $in: ["open", "active"] },
    };
    const update = {
      $set: {
        status: "open",
        activeKey,
        severity: incident.severity,
        triggerSnapshot: incident.triggerSnapshot,
        affectedEntity: incident.affectedEntity,
        rootCause: incident.rootCause,
        updatedAt: now,
      },
      $setOnInsert: {
        restaurantId,
        type: incident.type,
        createdAt: now,
      },
      $unset: { resolvedAt: "", resolutionReason: "" },
    };

    try {
      await this.incidents.updateOne(identity, update, { upsert: true });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      await this.incidents.updateOne({ restaurantId, activeKey }, update);
    }
  }

  async resolveActiveIncident(
    restaurantId: ObjectId,
    incidentId: ObjectId,
    now: Date,
  ): Promise<void> {
    await this.incidents.updateOne(
      { _id: incidentId, restaurantId, status: { $in: ["open", "active"] } },
      {
        $set: {
          status: "resolved",
          resolvedAt: now,
          resolutionReason: "condition_cleared",
          updatedAt: now,
        },
        $unset: { activeKey: "" },
      },
    );
  }

  async listForRestaurant(restaurantId: ObjectId): Promise<IncidentListResult> {
    const records = await this.incidents
      .find({ restaurantId, status: { $in: ["open", "active", "resolved"] } })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(INCIDENT_LIST_LIMIT + 1)
      .toArray();
    const truncated = records.length > INCIDENT_LIST_LIMIT;
    return {
      incidents: records
        .slice(0, INCIDENT_LIST_LIMIT)
        .map((record) => incidentRecord(record, restaurantId)),
      truncated,
    };
  }
}
