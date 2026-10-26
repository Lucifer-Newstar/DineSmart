import { type GuestProfileView, parseGuestProfile } from "./guest-profile-data";
import type {
  HealthScoreData,
  InventoryItem,
  KitchenTicket,
  Order,
  OrderStatus,
  ParsedInventoryResponse,
  ParsedKitchenQueueResponse,
  ParsedReservationsResponse,
  ParsedStaffOrdersResponse,
  Reservation,
  ReservationStatus,
  StaffOrderItem,
} from "./types";

export function isHealthScoreData(value: unknown): value is HealthScoreData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.score !== "number" ||
    !Number.isFinite(candidate.score) ||
    candidate.score < 0 ||
    candidate.score > 100 ||
    typeof candidate.calculatedAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.calculatedAt)) ||
    typeof candidate.components !== "object" ||
    candidate.components === null ||
    typeof candidate.sampling !== "object" ||
    candidate.sampling === null
  ) {
    return false;
  }

  const components = candidate.components as Record<string, unknown>;
  const sampling = candidate.sampling as Record<string, unknown>;
  if (
    typeof sampling.perCollectionLimit !== "number" ||
    !Array.isArray(sampling.truncatedCollections) ||
    !sampling.truncatedCollections.every((name) => typeof name === "string")
  ) {
    return false;
  }

  return [
    "kitchenEfficiency",
    "inventoryHealth",
    "orderCompletionRate",
    "reservationEfficiency",
    "tableUtilization",
    "incidentFrequency",
  ].every((name) => {
    const metric = components[name];
    if (typeof metric !== "object" || metric === null) return false;
    const record = metric as Record<string, unknown>;
    return (
      typeof record.score === "number" &&
      record.score >= 0 &&
      record.score <= 100 &&
      typeof record.weight === "number" &&
      typeof record.observations === "number" &&
      typeof record.detail === "string" &&
      (record.status === "observed" || record.status === "insufficient_data")
    );
  });
}

export function parseInventoryResponse(value: unknown): ParsedInventoryResponse | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  if (!Array.isArray(response.items) || typeof response.truncated !== "boolean") return null;

  const items: InventoryItem[] = [];
  for (const candidate of response.items) {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate))
      return null;
    const item = candidate as Record<string, unknown>;
    if (
      typeof item.id !== "string" ||
      !/^[a-f\d]{24}$/i.test(item.id) ||
      typeof item.name !== "string"
    ) {
      return null;
    }

    if (
      typeof item.quantity === "number" &&
      Number.isFinite(item.quantity) &&
      item.quantity >= 0 &&
      typeof item.unit === "string" &&
      typeof item.lowStockThreshold === "number" &&
      Number.isFinite(item.lowStockThreshold) &&
      item.lowStockThreshold >= 0
    ) {
      items.push({
        id: item.id,
        name: item.name,
        category: "Live inventory",
        onHand: item.quantity,
        minimum: item.lowStockThreshold,
        target: 0,
        unit: item.unit,
      });
      continue;
    }

    if (item.availability === "low" || item.availability === "available") {
      items.push({
        id: item.id,
        name: item.name,
        category: "Live inventory",
        onHand: item.availability === "low" ? 0 : 1,
        minimum: 0,
        target: 1,
        unit: "",
      });
      continue;
    }
    return null;
  }

  return { items, truncated: response.truncated };
}

export function parseReservationRecord(value: unknown): Reservation | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const statuses: ReservationStatus[] = [
    "Awaiting",
    "Confirmed",
    "Arrived",
    "Seated",
    "Completed",
    "Cancelled",
    "NoShow",
  ];
  if (
    typeof record.id !== "string" ||
    !/^[a-f\d]{24}$/i.test(record.id) ||
    typeof record.guestName !== "string" ||
    typeof record.restaurantName !== "string" ||
    typeof record.partySize !== "number" ||
    !Number.isInteger(record.partySize) ||
    record.partySize < 1 ||
    record.partySize > 12 ||
    typeof record.startAt !== "string" ||
    !Number.isFinite(Date.parse(record.startAt)) ||
    typeof record.status !== "string" ||
    !statuses.includes(record.status as ReservationStatus) ||
    (record.tableNumber !== null && typeof record.tableNumber !== "string")
  ) {
    return null;
  }
  const startAt = new Date(record.startAt);
  return {
    id: record.id,
    guest: record.guestName,
    time: new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(startAt),
    party: record.partySize,
    table: record.tableNumber ? `Table ${record.tableNumber}` : "Unassigned",
    status: record.status as ReservationStatus,
    startAt: record.startAt,
    ...(typeof record.endAt === "string" && Number.isFinite(Date.parse(record.endAt))
      ? { endAt: record.endAt }
      : {}),
    restaurantName: record.restaurantName,
    ...(typeof record.notes === "string" && record.notes ? { notes: record.notes } : {}),
    ...(typeof record.occasion === "string" ? { occasion: record.occasion } : {}),
    ...(typeof record.dietaryNotes === "string" ? { dietaryNotes: record.dietaryNotes } : {}),
    ...(typeof record.customerId === "string" && /^[a-f\d]{24}$/i.test(record.customerId)
      ? { customerId: record.customerId }
      : {}),
    ...(parseGuestProfile(record.guestProfile)
      ? { guestProfile: parseGuestProfile(record.guestProfile) as GuestProfileView }
      : {}),
  };
}

export function parseReservationsResponse(value: unknown): ParsedReservationsResponse | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  if (!Array.isArray(response.reservations) || typeof response.truncated !== "boolean") return null;
  const reservations = response.reservations.map(parseReservationRecord);
  if (reservations.some((reservation) => reservation === null)) return null;
  return { reservations: reservations as Reservation[], truncated: response.truncated };
}

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseStaffOrderItem(value: unknown): StaffOrderItem | null {
  if (!isObjectRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    !/^[a-f\d]{24}$/i.test(value.id) ||
    typeof value.name !== "string" ||
    typeof value.quantity !== "number" ||
    !Number.isInteger(value.quantity) ||
    value.quantity < 1 ||
    (value.preparationStatus !== "Created" &&
      value.preparationStatus !== "Preparing" &&
      value.preparationStatus !== "Ready")
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    quantity: value.quantity,
    preparationStatus: value.preparationStatus,
    ...(typeof value.notes === "string" && value.notes ? { notes: value.notes.slice(0, 140) } : {}),
  };
}

export function parseStaffOrderRecord(value: unknown): Order | null {
  if (!isObjectRecord(value)) return null;
  const statusMap: Record<string, OrderStatus> = {
    Created: "New",
    Accepted: "Accepted",
    Preparing: "Preparing",
    Ready: "Ready",
    Served: "Served",
    Completed: "Completed",
  };
  if (
    typeof value.id !== "string" ||
    !/^[a-f\d]{24}$/i.test(value.id) ||
    typeof value.status !== "string" ||
    !Object.hasOwn(statusMap, value.status) ||
    !Array.isArray(value.items) ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  const createdAt = new Date(value.createdAt);
  const updatedAt = new Date(value.updatedAt);
  if (!Number.isFinite(createdAt.getTime()) || !Number.isFinite(updatedAt.getTime())) return null;
  const itemRecords = value.items.map(parseStaffOrderItem);
  if (itemRecords.some((item) => item === null)) return null;
  const elapsed = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 60_000));
  const items = itemRecords as StaffOrderItem[];
  return {
    id: value.id,
    guest: "Customer order",
    table: "Unassigned",
    items: items.map((item) => `${item.name} × ${item.quantity}`).join(", ") || "No item details",
    itemRecords: items,
    placed: elapsed === 0 ? "Just now" : `${elapsed} min ago`,
    elapsed,
    status: statusMap[value.status],
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

export function parseStaffOrderListResponse(value: unknown): ParsedStaffOrdersResponse | null {
  if (
    !isObjectRecord(value) ||
    !Array.isArray(value.orders) ||
    typeof value.truncated !== "boolean"
  )
    return null;
  const orders = value.orders.map(parseStaffOrderRecord);
  if (orders.some((order) => order === null)) return null;
  return { orders: orders as Order[], truncated: value.truncated };
}

export function parseStaffOrderResponse(value: unknown): Order | null {
  if (!isObjectRecord(value)) return null;
  return parseStaffOrderRecord(value.order);
}

export function parseKitchenQueueResponse(value: unknown): ParsedKitchenQueueResponse | null {
  if (
    !isObjectRecord(value) ||
    !Array.isArray(value.orders) ||
    typeof value.truncated !== "boolean"
  )
    return null;
  const tickets: KitchenTicket[] = [];
  for (const candidate of value.orders) {
    if (!isObjectRecord(candidate)) return null;
    if (
      typeof candidate.id !== "string" ||
      !/^[a-f\d]{24}$/i.test(candidate.id) ||
      (candidate.status !== "Accepted" &&
        candidate.status !== "Preparing" &&
        candidate.status !== "Ready") ||
      !Array.isArray(candidate.items) ||
      typeof candidate.createdAt !== "string" ||
      typeof candidate.updatedAt !== "string"
    ) {
      return null;
    }
    const createdAt = new Date(candidate.createdAt);
    const updatedAt = new Date(candidate.updatedAt);
    if (!Number.isFinite(createdAt.getTime()) || !Number.isFinite(updatedAt.getTime())) return null;
    const items = candidate.items.map(parseStaffOrderItem);
    if (items.some((item) => item === null)) return null;
    tickets.push({
      id: candidate.id,
      status: candidate.status,
      ...(typeof candidate.tableNumber === "string" && candidate.tableNumber
        ? { tableNumber: candidate.tableNumber }
        : {}),
      items: items as StaffOrderItem[],
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      elapsed: Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 60_000)),
    });
  }
  return { tickets, truncated: value.truncated };
}

export function kitchenTicketFromOrder(order: Order): KitchenTicket | null {
  if (
    (order.status !== "Accepted" && order.status !== "Preparing" && order.status !== "Ready") ||
    !order.itemRecords ||
    !order.createdAt ||
    !order.updatedAt
  ) {
    return null;
  }
  return {
    id: order.id,
    status: order.status,
    items: order.itemRecords,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    elapsed: order.elapsed,
  };
}

export function displayOrderId(id: string): string {
  return /^[a-f\d]{24}$/i.test(id) ? `#${id.slice(-6).toUpperCase()}` : id;
}

export function parseReservationResponse(value: unknown): Reservation | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  return parseReservationRecord(response.reservation);
}

export function parseInventoryUpdate(value: unknown): InventoryItem | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  if (typeof response.item !== "object" || response.item === null || Array.isArray(response.item))
    return null;
  const item = response.item as Record<string, unknown>;
  if (
    typeof item.id !== "string" ||
    !/^[a-f\d]{24}$/i.test(item.id) ||
    typeof item.name !== "string" ||
    typeof item.quantity !== "number" ||
    !Number.isFinite(item.quantity) ||
    item.quantity < 0 ||
    typeof item.unit !== "string" ||
    typeof item.lowStockThreshold !== "number" ||
    !Number.isFinite(item.lowStockThreshold) ||
    item.lowStockThreshold < 0
  ) {
    return null;
  }
  return {
    id: item.id,
    name: item.name,
    category: "Live inventory",
    onHand: item.quantity,
    minimum: item.lowStockThreshold,
    target: 0,
    unit: item.unit,
  };
}
