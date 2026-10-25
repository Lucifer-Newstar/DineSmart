export type Section =
  | "Overview"
  | "Orders"
  | "Kitchen"
  | "Reservations"
  | "Inventory"
  | "Menu"
  | "Incidents"
  | "Insights"
  | "Analytics"
  | "Settings";
export type OrderStatus = "New" | "Accepted" | "Preparing" | "Ready" | "Served" | "Completed";
export type PreparationStatus = "Created" | "Preparing" | "Ready";
export type OrderFeedStatus = "preview" | "loading" | "live" | "unavailable";
export type IconName =
  | "overview"
  | "orders"
  | "kitchen"
  | "reservations"
  | "inventory"
  | "incidents"
  | "insights"
  | "analytics"
  | "settings"
  | "search"
  | "bell"
  | "chevron"
  | "plus"
  | "arrow-up"
  | "arrow-down"
  | "clock"
  | "spark"
  | "download"
  | "more"
  | "check"
  | "alert"
  | "table"
  | "box"
  | "receipt"
  | "menu"
  | "close"
  | "filter"
  | "refresh"
  | "user"
  | "logout"
  | "calendar"
  | "arrow-right"
  | "leaf"
  | "sun";

export interface StaffOrderItem {
  id: string;
  name: string;
  quantity: number;
  preparationStatus: PreparationStatus;
}

export interface Order {
  id: string;
  guest: string;
  table: string;
  items: string;
  itemRecords?: StaffOrderItem[];
  placed: string;
  elapsed: number;
  status: OrderStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface KitchenTicket {
  id: string;
  status: "Accepted" | "Preparing" | "Ready";
  items: StaffOrderItem[];
  createdAt: string;
  updatedAt: string;
  elapsed: number;
}

export interface InventoryItem {
  id?: string;
  name: string;
  category: string;
  onHand: number;
  minimum: number;
  target: number;
  unit: string;
}

export type ReservationStatus =
  | "Awaiting"
  | "Confirmed"
  | "Seated"
  | "Completed"
  | "Cancelled"
  | "NoShow";
export type ReservationViewStatus = "preview" | "loading" | "live" | "unavailable";

export interface Reservation {
  id: string;
  guest: string;
  time: string;
  party: number;
  table: string;
  status: ReservationStatus;
  startAt?: string;
  restaurantName?: string;
}

export type RecommendationViewStatus =
  | "preview"
  | "loading"
  | "live"
  | "empty"
  | "unavailable"
  | "restricted";
export type IncidentViewStatus =
  | "preview"
  | "loading"
  | "live"
  | "empty"
  | "unavailable"
  | "restricted";

export interface HealthScoreMetric {
  score: number;
  weight: number;
  observations: number;
  status: "observed" | "insufficient_data";
  detail: string;
}

export interface HealthScoreData {
  score: number;
  calculatedAt: string;
  components: {
    kitchenEfficiency: HealthScoreMetric;
    inventoryHealth: HealthScoreMetric;
    orderCompletionRate: HealthScoreMetric;
    reservationEfficiency: HealthScoreMetric;
    tableUtilization: HealthScoreMetric;
    incidentFrequency: HealthScoreMetric;
  };
  sampling: { perCollectionLimit: number; truncatedCollections: string[] };
}

export type HealthScoreViewStatus = "demo" | "loading" | "live" | "unavailable" | "restricted";
export type InventoryViewStatus = "preview" | "loading" | "live" | "unavailable";

export interface ParsedInventoryResponse {
  items: InventoryItem[];
  truncated: boolean;
}

export interface ParsedReservationsResponse {
  reservations: Reservation[];
  truncated: boolean;
}

export interface ParsedStaffOrdersResponse {
  orders: Order[];
  truncated: boolean;
}

export interface ParsedKitchenQueueResponse {
  tickets: KitchenTicket[];
  truncated: boolean;
}
