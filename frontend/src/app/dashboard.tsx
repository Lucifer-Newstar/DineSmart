"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { type AnalyticsData, type AnalyticsRange, parseAnalyticsData } from "./analytics-data";
import { type AuthUser, useAuth } from "./auth-provider";
import { BrandMark } from "./brand-mark";
import {
  canAccessDashboardSection,
  canViewAnalytics,
  canViewHealthScore,
  canViewRecommendations,
  dashboardWorkspaceScopeKey,
  navigationForRole,
  resolveDashboardSection,
  valueForDashboardWorkspace,
} from "./dashboard-access";

type Section =
  | "Overview"
  | "Orders"
  | "Kitchen"
  | "Reservations"
  | "Inventory"
  | "Incidents"
  | "Insights"
  | "Analytics"
  | "Settings";
type OrderStatus = "New" | "Accepted" | "Preparing" | "Ready" | "Served" | "Completed";
type PreparationStatus = "Created" | "Preparing" | "Ready";
type OrderFeedStatus = "preview" | "loading" | "live" | "unavailable";
type IconName =
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

interface StaffOrderItem {
  id: string;
  name: string;
  quantity: number;
  preparationStatus: PreparationStatus;
}

interface Order {
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

interface KitchenTicket {
  id: string;
  status: "Accepted" | "Preparing" | "Ready";
  items: StaffOrderItem[];
  createdAt: string;
  updatedAt: string;
  elapsed: number;
}

interface InventoryItem {
  id?: string;
  name: string;
  category: string;
  onHand: number;
  minimum: number;
  target: number;
  unit: string;
}

type ReservationStatus = "Awaiting" | "Confirmed" | "Seated" | "Completed" | "Cancelled" | "NoShow";
type ReservationViewStatus = "preview" | "loading" | "live" | "unavailable";

interface Reservation {
  id: string;
  guest: string;
  time: string;
  party: number;
  table: string;
  status: ReservationStatus;
  startAt?: string;
  restaurantName?: string;
}

interface Recommendation {
  incidentId: string;
  summary: string;
  rootCause: string;
  priority: string;
  source: "gemini" | "fallback" | "demo";
  confidence: number;
  actions: Array<{ description: string; rationale: string; expectedImpact: string }>;
}

interface HealthScoreMetric {
  score: number;
  weight: number;
  observations: number;
  status: "observed" | "insufficient_data";
  detail: string;
}

interface HealthScoreData {
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

type HealthScoreViewStatus = "demo" | "loading" | "live" | "unavailable" | "restricted";
type InventoryViewStatus = "preview" | "loading" | "live" | "unavailable";

interface ParsedInventoryResponse {
  items: InventoryItem[];
  truncated: boolean;
}

interface ParsedReservationsResponse {
  reservations: Reservation[];
  truncated: boolean;
}

interface ParsedStaffOrdersResponse {
  orders: Order[];
  truncated: boolean;
}

interface ParsedKitchenQueueResponse {
  tickets: KitchenTicket[];
  truncated: boolean;
}

const INCIDENT_INVENTORY_ID = "71000000000000000000001d";
const API_BASE = "/api/v1";

const NAVIGATION: Array<{ label: Section; icon: IconName; group: "main" | "manage" }> = [
  { label: "Overview", icon: "overview", group: "main" },
  { label: "Orders", icon: "orders", group: "main" },
  { label: "Kitchen", icon: "kitchen", group: "main" },
  { label: "Reservations", icon: "reservations", group: "main" },
  { label: "Inventory", icon: "inventory", group: "manage" },
  { label: "Incidents", icon: "incidents", group: "manage" },
  { label: "Insights", icon: "insights", group: "manage" },
  { label: "Analytics", icon: "analytics", group: "manage" },
  { label: "Settings", icon: "settings", group: "manage" },
];

const INITIAL_ORDERS: Order[] = [
  {
    id: "DS-1042",
    guest: "Aarav Menon",
    table: "Table 04",
    items: "Podi ghee dosa × 2, filter coffee",
    placed: "6:18 pm",
    elapsed: 23,
    status: "Preparing",
  },
  {
    id: "DS-1043",
    guest: "Isha Krishnan",
    table: "Table 08",
    items: "Paneer tikka, lemon rice",
    placed: "6:27 pm",
    elapsed: 14,
    status: "Ready",
  },
  {
    id: "DS-1044",
    guest: "Takeaway · pickup 6:55",
    table: "Pickup",
    items: "Masala dosa × 1, filter coffee × 2",
    placed: "6:38 pm",
    elapsed: 3,
    status: "New",
  },
  {
    id: "DS-1045",
    guest: "Meera Raman",
    table: "Table 03",
    items: "Curd rice, crispy okra",
    placed: "6:32 pm",
    elapsed: 9,
    status: "Preparing",
  },
];

const INITIAL_INVENTORY: InventoryItem[] = [
  {
    name: "Fresh paneer",
    category: "Dairy & chilled",
    onHand: 3,
    minimum: 8,
    target: 24,
    unit: "kg",
  },
  {
    name: "Filter coffee blend",
    category: "Pantry",
    onHand: 18,
    minimum: 10,
    target: 30,
    unit: "bags",
  },
  { name: "Cold-pressed oil", category: "Pantry", onHand: 7, minimum: 6, target: 20, unit: "L" },
  {
    name: "Baby spinach",
    category: "Fresh produce",
    onHand: 5,
    minimum: 8,
    target: 18,
    unit: "kg",
  },
];

const INITIAL_RESERVATIONS: Reservation[] = [
  {
    id: "RS-209",
    guest: "Priya Shah",
    time: "7:00 pm",
    party: 4,
    table: "Table 02",
    status: "Confirmed",
  },
  {
    id: "RS-210",
    guest: "Nikhil Iyer",
    time: "7:15 pm",
    party: 2,
    table: "Table 06",
    status: "Awaiting",
  },
  {
    id: "RS-211",
    guest: "Ananya Rao",
    time: "7:30 pm",
    party: 6,
    table: "Table 09",
    status: "Confirmed",
  },
  {
    id: "RS-212",
    guest: "Kabir Das",
    time: "8:00 pm",
    party: 3,
    table: "Table 05",
    status: "Confirmed",
  },
];

const DEMO_RECOMMENDATION: Recommendation = {
  incidentId: INCIDENT_INVENTORY_ID,
  summary: "Fresh paneer is projected to run short before the dinner rush ends.",
  rootCause:
    "Current stock is below the eight-kilogram reorder point while paneer orders are trending above the evening average.",
  priority: "critical",
  source: "demo",
  confidence: 0.91,
  actions: [
    {
      description: "Confirm an emergency transfer of 6 kg from the nearby location.",
      rationale: "The transfer covers the forecast gap without changing today's menu.",
      expectedImpact: "Protects roughly 18 expected orders.",
    },
    {
      description:
        "Ask the kitchen to hold the paneer garnish for staff meals until the transfer arrives.",
      rationale: "Preserves guest portions while the replenishment is in transit.",
      expectedImpact: "Adds a small buffer of about 4 servings.",
    },
  ],
};

function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  let content: ReactNode;
  switch (name) {
    case "overview":
      content = (
        <>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.3" {...common} />
          <rect x="13.5" y="3.5" width="7" height="5" rx="1.3" {...common} />
          <rect x="13.5" y="11.5" width="7" height="9" rx="1.3" {...common} />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.3" {...common} />
        </>
      );
      break;
    case "orders":
      content = (
        <>
          <path d="M7 3.5h7l4 4v13H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" {...common} />
          <path d="M14 3.5v4h4M9 12h6M9 16h6" {...common} />
        </>
      );
      break;
    case "kitchen":
      content = (
        <>
          <path d="M5 11h14l-1.2 9H6.2L5 11Z" {...common} />
          <path
            d="M8 8.5c0-1.4 1-2.1 1-3.5M12 8.5c0-1.4 1-2.1 1-3.5M16 8.5c0-1.4 1-2.1 1-3.5"
            {...common}
          />
          <path d="M4 11h16" {...common} />
        </>
      );
      break;
    case "reservations":
      content = (
        <>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" {...common} />
          <path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 13h3M8 16.5h7" {...common} />
        </>
      );
      break;
    case "inventory":
    case "box":
      content = (
        <>
          <path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2L12 3Z" {...common} />
          <path d="m4.4 7.5 7.6 4 7.6-4M12 11.5V21M8 5l8 4.1" {...common} />
        </>
      );
      break;
    case "incidents":
    case "alert":
      content = (
        <>
          <path d="M12 3 2.8 19a1.3 1.3 0 0 0 1.1 2h16.2a1.3 1.3 0 0 0 1.1-2L12 3Z" {...common} />
          <path d="M12 9v4.5M12 17h.01" {...common} />
        </>
      );
      break;
    case "insights":
    case "spark":
      content = (
        <>
          <path
            d="m12 3 1.35 5.65L19 10l-5.65 1.35L12 17l-1.35-5.65L5 10l5.65-1.35L12 3Z"
            {...common}
          />
          <path
            d="m19 15 .65 2.35L22 18l-2.35.65L19 21l-.65-2.35L16 18l2.35-.65L19 15ZM5 14l.6 2.4L8 17l-2.4.6L5 20l-.6-2.4L2 17l2.4-.6L5 14Z"
            {...common}
          />
        </>
      );
      break;
    case "analytics":
      content = (
        <>
          <path d="M4 19.5V12h4v7.5M10 19.5V5h4v14.5M16 19.5V9h4v10.5" {...common} />
          <path d="M2.5 20.5h19" {...common} />
        </>
      );
      break;
    case "settings":
      content = (
        <>
          <circle cx="12" cy="12" r="3" {...common} />
          <path
            d="m19.4 15 .1.1 1.1.9-1.2 2.1-1.3-.5a7.4 7.4 0 0 1-1.5.9l-.2 1.4h-2.5l-.3-1.4a7.4 7.4 0 0 1-1.5-.9l-1.3.5-1.2-2.1 1.1-.9a6.8 6.8 0 0 1 0-1.8l-1.1-.9 1.2-2.1 1.3.5a7.4 7.4 0 0 1 1.5-.9l.3-1.4h2.5l.2 1.4a7.4 7.4 0 0 1 1.5.9l1.3-.5 1.2 2.1-1.1.9a6.8 6.8 0 0 1 0 1.8Z"
            {...common}
          />
        </>
      );
      break;
    case "search":
      content = (
        <>
          <circle cx="10.8" cy="10.8" r="6.3" {...common} />
          <path d="m16 16 4.2 4.2" {...common} />
        </>
      );
      break;
    case "bell":
      content = <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" {...common} />;
      break;
    case "chevron":
      content = <path d="m8 10 4 4 4-4" {...common} />;
      break;
    case "plus":
      content = <path d="M12 5v14M5 12h14" {...common} />;
      break;
    case "arrow-up":
      content = <path d="M12 19V5M6 11l6-6 6 6" {...common} />;
      break;
    case "arrow-down":
      content = <path d="M12 5v14M18 13l-6 6-6-6" {...common} />;
      break;
    case "clock":
      content = (
        <>
          <circle cx="12" cy="12" r="9" {...common} />
          <path d="M12 7v5l3.5 2" {...common} />
        </>
      );
      break;
    case "download":
      content = <path d="M12 3v12M7 10l5 5 5-5M4 20h16" {...common} />;
      break;
    case "more":
      content = (
        <>
          <circle cx="5" cy="12" r=".7" {...common} />
          <circle cx="12" cy="12" r=".7" {...common} />
          <circle cx="19" cy="12" r=".7" {...common} />
        </>
      );
      break;
    case "check":
      content = <path d="m5 12 4.2 4.2L19 6.5" {...common} />;
      break;
    case "table":
      content = (
        <>
          <rect x="4" y="4" width="16" height="16" rx="4" {...common} />
          <path d="M4 10h16M10 4v16" {...common} />
        </>
      );
      break;
    case "receipt":
      content = (
        <>
          <path
            d="M6 3.5 8 5l2-1.5L12 5l2-1.5L16 5l2-1.5v17l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5v-17Z"
            {...common}
          />
          <path d="M9 10h6M9 14h6" {...common} />
        </>
      );
      break;
    case "menu":
      content = <path d="M4 7h16M4 12h16M4 17h16" {...common} />;
      break;
    case "close":
      content = <path d="m6 6 12 12M18 6 6 18" {...common} />;
      break;
    case "filter":
      content = (
        <>
          <path d="M4 6h16M7 12h10M10 18h4" {...common} />
          <circle cx="8" cy="6" r="1.5" {...common} />
          <circle cx="15" cy="12" r="1.5" {...common} />
        </>
      );
      break;
    case "refresh":
      content = (
        <>
          <path d="M20 7v5h-5M4 17v-5h5" {...common} />
          <path d="M6 9a6.5 6.5 0 0 1 11-2l3 5M18 15a6.5 6.5 0 0 1-11 2l-3-5" {...common} />
        </>
      );
      break;
    case "user":
      content = (
        <>
          <circle cx="12" cy="8" r="3.5" {...common} />
          <path d="M4.5 20a7.5 7.5 0 0 1 15 0" {...common} />
        </>
      );
      break;
    case "logout":
      content = <path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" {...common} />;
      break;
    case "calendar":
      content = (
        <>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" {...common} />
          <path
            d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01"
            {...common}
          />
        </>
      );
      break;
    case "arrow-right":
      content = <path d="M4 12h15M13 6l6 6-6 6" {...common} />;
      break;
    case "leaf":
      content = (
        <>
          <path d="M19.5 4.5C11 4.5 5 7 5 13c0 3.5 2.3 6 5.5 6 6 0 8.5-6 9-14.5Z" {...common} />
          <path d="M4 21c2.5-5 6.5-8.5 12-11" {...common} />
        </>
      );
      break;
    case "sun":
      content = (
        <>
          <circle cx="12" cy="12" r="4" {...common} />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"
            {...common}
          />
        </>
      );
      break;
    default:
      content = null;
  }
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
    >
      {content}
    </svg>
  );
}

function statusClass(status: string): string {
  return `status-pill status-${status.toLowerCase().replaceAll(" ", "-")}`;
}

function StatusPill({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={tone ?? statusClass(String(children))}>{children}</span>;
}

function MetricCard({
  icon,
  label,
  value,
  delta,
  detail,
  tone,
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  delta: string;
  detail: string;
  tone: "green" | "coral" | "blue" | "gold";
}) {
  return (
    <article className="metric-card">
      <div className="metric-card-top">
        <span className={`metric-icon metric-icon-${tone}`}>
          <Icon name={icon} size={19} />
        </span>
        <span className={`metric-delta ${delta.startsWith("↓") ? "delta-good" : ""}`}>
          {delta.startsWith("↑") || delta.startsWith("↓") ? (
            <Icon name={delta.startsWith("↓") ? "arrow-down" : "arrow-up"} size={13} />
          ) : null}
          {delta.replace(/^[↑↓]\s?/, "")}
        </span>
      </div>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
    </article>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div className="page-heading-copy">
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children ? <div className="page-heading-actions">{children}</div> : null}
    </div>
  );
}

function DemoBanner({
  onDismiss,
  inventoryStatus,
  reservationsStatus,
  ordersStatus,
  kitchenQueueStatus,
  canManageInventory,
}: {
  onDismiss: () => void;
  inventoryStatus: InventoryViewStatus;
  reservationsStatus: ReservationViewStatus;
  ordersStatus: OrderFeedStatus;
  kitchenQueueStatus: OrderFeedStatus;
  canManageInventory: boolean;
}) {
  return (
    <div className="demo-banner" role="status">
      <span className="demo-banner-icon">
        <Icon name="leaf" size={17} />
      </span>
      <p>
        <strong>Preview workspace</strong>
        <span>
          {inventoryStatus === "live"
            ? `Inventory is live${canManageInventory ? " and manager adjustments save" : " in read-only mode"}. `
            : inventoryStatus === "loading"
              ? "Loading live inventory; sample rows are shown until it arrives. "
              : inventoryStatus === "unavailable"
                ? "The inventory API is unavailable; sample rows are shown and adjustments are not saved. "
                : "Inventory is sample-only and not saved. "}
          {reservationsStatus === "live"
            ? "Reservations are live and status updates save. "
            : reservationsStatus === "loading"
              ? "Loading reservations; sample bookings are shown until the API responds. "
              : reservationsStatus === "unavailable"
                ? "The reservation API is unavailable; sample bookings are shown and updates are not saved. "
                : "Reservations are sample-only and not saved. "}
          {ordersStatus === "live"
            ? "Orders are live; permitted staff status updates save. "
            : ordersStatus === "loading"
              ? "Loading live orders; sample rows are shown until they arrive. "
              : ordersStatus === "unavailable"
                ? "The orders API is unavailable; sample rows and actions are not saved. "
                : "Orders are sample-only and not saved. "}
          {kitchenQueueStatus === "live"
            ? "The kitchen queue is live and item updates save. "
            : kitchenQueueStatus === "loading"
              ? "Loading the kitchen queue; the sample board is shown until it arrives. "
              : kitchenQueueStatus === "unavailable"
                ? "The kitchen queue is unavailable; sample actions are not saved. "
                : "The kitchen queue is sample-only and not saved. "}
          Health score and recommendations use the API only when connected.
        </span>
      </p>
      <button type="button" className="demo-banner-link" onClick={onDismiss}>
        Got it
      </button>
      <span className="demo-banner-dot" aria-hidden="true" />
    </div>
  );
}

function OrdersTable({
  orders,
  onAdvance,
  canUpdate,
  status,
  compact = false,
}: {
  orders: Order[];
  onAdvance: (id: string) => void;
  canUpdate: boolean;
  status: OrderFeedStatus;
  compact?: boolean;
}) {
  return (
    <div className="table-scroll">
      <table className={`data-table ${compact ? "data-table-compact" : ""}`}>
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Guest / table</th>
            <th scope="col">Items</th>
            <th scope="col">Elapsed</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <span className="order-number">{displayOrderId(order.id)}</span>
                <span className="cell-subline">{order.placed}</span>
              </td>
              <td>
                <span className="cell-strong">{order.guest}</span>
                <span className="cell-subline">{order.table}</span>
              </td>
              <td className="order-items-cell">{order.items}</td>
              <td>
                <span className={order.elapsed > 20 ? "elapsed-late" : "elapsed-normal"}>
                  <Icon name="clock" size={13} /> {order.elapsed} min
                </span>
              </td>
              <td>
                <StatusPill>{order.status}</StatusPill>
              </td>
              <td className="table-action-cell">
                {order.status === "Completed" ? (
                  <span className="completed-label">
                    <Icon name="check" size={14} /> Done
                  </span>
                ) : !canUpdate ? (
                  <span className="completed-label">Read only</span>
                ) : status === "live" &&
                  (order.status === "Accepted" || order.status === "Preparing") ? (
                  <span className="completed-label">In kitchen</span>
                ) : status === "live" && order.status === "New" ? (
                  <button
                    className="table-action"
                    type="button"
                    onClick={() => onAdvance(order.id)}
                  >
                    Accept
                  </button>
                ) : status === "live" && order.status === "Served" ? (
                  <button
                    className="table-action"
                    type="button"
                    onClick={() => onAdvance(order.id)}
                  >
                    Complete
                  </button>
                ) : order.status === "Served" ? (
                  <span className="completed-label">
                    <Icon name="check" size={14} /> Done
                  </span>
                ) : (
                  <button
                    className="table-action"
                    type="button"
                    onClick={() => onAdvance(order.id)}
                  >
                    {status === "live"
                      ? "Serve"
                      : order.status === "Ready"
                        ? "Serve"
                        : order.status === "New"
                          ? "Start"
                          : "Mark ready"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RevenueChart() {
  return (
    <div className="chart-wrap">
      <span className="sr-only">
        Revenue increased through the week and peaked on Saturday at 84,260 rupees.
      </span>
      <svg
        className="revenue-chart"
        viewBox="0 0 700 190"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="revenueFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#D88A5E" stopOpacity=".22" />
            <stop offset="100%" stopColor="#D88A5E" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="chart-grid-line" d="M0 30H700M0 75H700M0 120H700M0 165H700" />
        <path
          d="M0 142 C38 132 54 128 88 134 S145 117 176 122 S234 108 265 116 S322 89 352 96 S409 76 440 86 S496 68 528 76 S582 44 616 56 S664 25 700 31 V190 H0Z"
          fill="url(#revenueFill)"
        />
        <path
          d="M0 142 C38 132 54 128 88 134 S145 117 176 122 S234 108 265 116 S322 89 352 96 S409 76 440 86 S496 68 528 76 S582 44 616 56 S664 25 700 31"
          className="chart-line"
        />
        <circle cx="700" cy="31" r="5" className="chart-point" />
        <circle cx="700" cy="31" r="9" className="chart-point-halo" />
      </svg>
      <div className="chart-labels">
        <span>Sun</span>
        <span>Mon</span>
        <span>Tue</span>
        <span>Wed</span>
        <span>Thu</span>
        <span>Fri</span>
        <span className="chart-label-active">Sat</span>
      </div>
    </div>
  );
}

function InventoryRows({
  inventory,
  onRestock,
  compact = false,
  canManage = true,
}: {
  inventory: InventoryItem[];
  onRestock: (item: InventoryItem, quantity: number) => Promise<boolean>;
  compact?: boolean;
  canManage?: boolean;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [quantityDraft, setQuantityDraft] = useState("");
  const [adjustmentError, setAdjustmentError] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const rows = compact ? inventory.slice(0, 3) : inventory;

  return (
    <div className="inventory-list">
      {rows.length === 0 ? (
        <p className="health-empty-note">
          {canManage
            ? "No inventory items are configured for this restaurant yet."
            : "No stock availability is configured for this restaurant yet."}
        </p>
      ) : null}
      {rows.map((item) => {
        const rowKey = item.id ?? item.name;
        const isEditing = editingKey === rowKey;
        const isSaving = savingKey === rowKey;
        const low = item.onHand <= item.minimum;
        const percent = canManage
          ? item.target > 0
            ? Math.min((item.onHand / item.target) * 100, 100)
            : 0
          : low
            ? 25
            : 75;
        const progressStyle = { "--progress": `${percent}%` } as CSSProperties;
        return (
          <div
            className={`inventory-row ${canManage ? "" : "inventory-row-readonly"} ${isEditing ? "inventory-row-editing" : ""}`}
            key={rowKey}
          >
            <span className={`inventory-food-icon ${low ? "inventory-food-low" : ""}`}>
              <Icon name="box" size={16} />
            </span>
            <div className="inventory-row-name">
              <strong>{item.name}</strong>
              <span>{item.category}</span>
            </div>
            <div className="inventory-stock">
              <div className="inventory-stock-top">
                <strong>
                  {canManage ? (
                    <>
                      {item.onHand} <small>{item.unit}</small>
                    </>
                  ) : low ? (
                    "Low"
                  ) : (
                    "Available"
                  )}
                </strong>
                <span className={low ? "stock-low-label" : "stock-ok-label"}>
                  {low ? "Reorder" : "In stock"}
                </span>
              </div>
              {!canManage || item.target > 0 ? (
                <div
                  className={`stock-track ${low ? "stock-track-low" : ""}`}
                  style={progressStyle}
                >
                  <span />
                </div>
              ) : null}
            </div>
            {canManage ? (
              isEditing ? (
                <form
                  className="inventory-adjust-form"
                  aria-label={`Adjust stock count for ${item.name}`}
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const quantity = Number(quantityDraft);
                    if (quantityDraft.trim() === "" || !Number.isFinite(quantity) || quantity < 0) {
                      setAdjustmentError("Enter a finite, non-negative stock count.");
                      return;
                    }
                    setSavingKey(rowKey);
                    setAdjustmentError("");
                    const saved = await onRestock(item, quantity);
                    setSavingKey(null);
                    if (saved) setEditingKey(null);
                    else
                      setAdjustmentError(
                        "The count was not saved. Check the connection and retry.",
                      );
                  }}
                >
                  <input
                    aria-label={`New on-hand count for ${item.name}${item.unit ? ` in ${item.unit}` : ""}`}
                    type="number"
                    min="0"
                    step="any"
                    value={quantityDraft}
                    onChange={(event) => setQuantityDraft(event.currentTarget.value)}
                    aria-invalid={Boolean(adjustmentError)}
                    disabled={isSaving}
                  />
                  {item.unit ? <span className="inventory-adjust-unit">{item.unit}</span> : null}
                  <button className="button button-dark" type="submit" disabled={isSaving}>
                    {isSaving ? "Saving…" : "Save count"}
                  </button>
                  <button
                    className="button button-soft"
                    type="button"
                    onClick={() => {
                      setEditingKey(null);
                      setAdjustmentError("");
                    }}
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                  {adjustmentError ? (
                    <span className="inventory-adjust-error" role="alert">
                      {adjustmentError}
                    </span>
                  ) : null}
                </form>
              ) : (
                <button
                  className="icon-button restock-button"
                  type="button"
                  onClick={() => {
                    setEditingKey(rowKey);
                    setQuantityDraft(String(item.onHand));
                    setAdjustmentError("");
                  }}
                  aria-label={`Set stock count for ${item.name}`}
                  title="Set stock count"
                >
                  <Icon name="plus" size={16} />
                </button>
              )
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function RecommendationCard({
  recommendation,
  reviewed,
  onReview,
  onGenerate,
  generating,
}: {
  recommendation: Recommendation;
  reviewed: boolean;
  onReview: () => void;
  onGenerate?: () => void;
  generating?: boolean;
}) {
  const sourceLabel =
    recommendation.source === "gemini"
      ? "Gemini AI"
      : recommendation.source === "fallback"
        ? "Rule-based fallback"
        : "Preview suggestion";
  return (
    <article className="recommendation-card">
      <div className="recommendation-topline">
        <span className="recommendation-symbol">
          <Icon name="spark" size={18} />
        </span>
        <span className="recommendation-kicker">DINESMART ASSIST</span>
        <span className="recommendation-priority">{recommendation.priority} priority</span>
      </div>
      <h3>{recommendation.summary}</h3>
      <p className="recommendation-root">{recommendation.rootCause}</p>
      <div className="recommendation-actions-list">
        {recommendation.actions.slice(0, 2).map((action, index) => (
          <div className="recommendation-action" key={action.description}>
            <span className="recommendation-step">0{index + 1}</span>
            <div>
              <strong>{action.description}</strong>
              <span>{action.expectedImpact}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="recommendation-foot">
        <span className="recommendation-source">
          <span className={`source-dot source-${recommendation.source}`} />
          {sourceLabel} · {Math.round(recommendation.confidence * 100)}% confidence
        </span>
        <div className="recommendation-buttons">
          {onGenerate ? (
            <button
              type="button"
              className="button button-soft"
              onClick={onGenerate}
              disabled={generating}
            >
              <Icon name="refresh" size={15} />
              {generating ? "Generating…" : "Generate again"}
            </button>
          ) : null}
          <button
            type="button"
            className={`button ${reviewed ? "button-reviewed" : "button-dark"}`}
            onClick={onReview}
            disabled={reviewed}
          >
            {reviewed ? (
              <>
                <Icon name="check" size={15} /> Reviewed
              </>
            ) : (
              "Mark reviewed"
            )}
          </button>
        </div>
      </div>
    </article>
  );
}

function isHealthScoreData(value: unknown): value is HealthScoreData {
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

function parseInventoryResponse(value: unknown): ParsedInventoryResponse | null {
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

function parseReservationRecord(value: unknown): Reservation | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const statuses: ReservationStatus[] = [
    "Awaiting",
    "Confirmed",
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
    restaurantName: record.restaurantName,
  };
}

function parseReservationsResponse(value: unknown): ParsedReservationsResponse | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  if (!Array.isArray(response.reservations) || typeof response.truncated !== "boolean") return null;
  const reservations = response.reservations.map(parseReservationRecord);
  if (reservations.some((reservation) => reservation === null)) return null;
  return { reservations: reservations as Reservation[], truncated: response.truncated };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStaffOrderItem(value: unknown): StaffOrderItem | null {
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
  };
}

function parseStaffOrderRecord(value: unknown): Order | null {
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

function parseStaffOrderListResponse(value: unknown): ParsedStaffOrdersResponse | null {
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

function parseStaffOrderResponse(value: unknown): Order | null {
  if (!isObjectRecord(value)) return null;
  return parseStaffOrderRecord(value.order);
}

function parseKitchenQueueResponse(value: unknown): ParsedKitchenQueueResponse | null {
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
      items: items as StaffOrderItem[],
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      elapsed: Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 60_000)),
    });
  }
  return { tickets, truncated: value.truncated };
}

function kitchenTicketFromOrder(order: Order): KitchenTicket | null {
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

function displayOrderId(id: string): string {
  return /^[a-f\d]{24}$/i.test(id) ? `#${id.slice(-6).toUpperCase()}` : id;
}

function parseReservationResponse(value: unknown): Reservation | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  return parseReservationRecord(response.reservation);
}

function parseInventoryUpdate(value: unknown): InventoryItem | null {
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

export function Dashboard() {
  const { user, accessToken, signOut } = useAuth();
  const [section, setSection] = useState<Section>("Overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [demoBannerVisible, setDemoBannerVisible] = useState(true);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [ordersStatus, setOrdersStatus] = useState<OrderFeedStatus>("preview");
  const [ordersTruncated, setOrdersTruncated] = useState(false);
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);
  const [kitchenTickets, setKitchenTickets] = useState<KitchenTicket[]>([]);
  const [kitchenQueueStatus, setKitchenQueueStatus] = useState<OrderFeedStatus>("preview");
  const [kitchenQueueTruncated, setKitchenQueueTruncated] = useState(false);
  const [kitchenQueueRefreshKey, setKitchenQueueRefreshKey] = useState(0);
  const [inventory, setInventory] = useState(INITIAL_INVENTORY);
  const [inventoryStatus, setInventoryStatus] = useState<InventoryViewStatus>("preview");
  const [inventoryTruncated, setInventoryTruncated] = useState(false);
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
  const [reservations, setReservations] = useState(INITIAL_RESERVATIONS);
  const [reservationsStatus, setReservationsStatus] = useState<ReservationViewStatus>("preview");
  const [reservationsTruncated, setReservationsTruncated] = useState(false);
  const [reservationsRefreshKey, setReservationsRefreshKey] = useState(0);
  const [savingReservationId, setSavingReservationId] = useState("");
  const [recommendation, setRecommendation] = useState(DEMO_RECOMMENDATION);
  const [recommendationScopeKey, setRecommendationScopeKey] = useState("preview");
  const [recommendationReviewed, setRecommendationReviewed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("All orders");
  const [healthScore, setHealthScore] = useState<HealthScoreData | null>(null);
  const [healthScoreError, setHealthScoreError] = useState("");
  const [healthScoreLoading, setHealthScoreLoading] = useState(false);
  const [healthScoreRefreshKey, setHealthScoreRefreshKey] = useState(0);
  const role = user?.role;
  const workspaceScopeKey = dashboardWorkspaceScopeKey(user);
  const currentRecommendation = valueForDashboardWorkspace(
    recommendation,
    recommendationScopeKey,
    workspaceScopeKey,
    DEMO_RECOMMENDATION,
  );
  const currentRecommendationReviewed = valueForDashboardWorkspace(
    recommendationReviewed,
    recommendationScopeKey,
    workspaceScopeKey,
    false,
  );

  useEffect(() => {
    if (recommendationScopeKey === workspaceScopeKey) return;
    setRecommendation(DEMO_RECOMMENDATION);
    setRecommendationReviewed(false);
    setRecommendationScopeKey(workspaceScopeKey);
  }, [recommendationScopeKey, workspaceScopeKey]);

  useEffect(() => {
    if (!accessToken || !role || role === "Customer") {
      setOrders(INITIAL_ORDERS);
      setOrdersStatus("preview");
      setOrdersTruncated(false);
      return;
    }

    const controller = new AbortController();
    setOrders([]);
    setOrdersTruncated(false);
    setOrdersStatus("loading");
    void fetch(`${API_BASE}/orders`, {
      cache: ordersRefreshKey > 0 ? "reload" : "no-store",
      credentials: "include",
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Orders are not available from the API.");
        const payload: unknown = await response.json();
        const parsed = parseStaffOrderListResponse(payload);
        if (!parsed) throw new Error("The staff order response was invalid.");
        if (controller.signal.aborted) return;
        setOrders(parsed.orders);
        setOrdersTruncated(parsed.truncated);
        setOrdersStatus("live");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError"))
          return;
        setOrders([]);
        setOrdersTruncated(false);
        setOrdersStatus("unavailable");
      });

    return () => controller.abort();
  }, [accessToken, role, ordersRefreshKey]);

  useEffect(() => {
    if (
      !accessToken ||
      (role !== "Kitchen Staff" && role !== "Manager" && role !== "Administrator")
    ) {
      setKitchenTickets([]);
      setKitchenQueueStatus("preview");
      setKitchenQueueTruncated(false);
      return;
    }

    const controller = new AbortController();
    setKitchenTickets([]);
    setKitchenQueueTruncated(false);
    setKitchenQueueStatus("loading");
    void fetch(`${API_BASE}/kitchen/queue`, {
      cache: kitchenQueueRefreshKey > 0 ? "reload" : "no-store",
      credentials: "include",
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("The kitchen queue is not available from the API.");
        const payload: unknown = await response.json();
        const parsed = parseKitchenQueueResponse(payload);
        if (!parsed) throw new Error("The kitchen queue response was invalid.");
        if (controller.signal.aborted) return;
        setKitchenTickets(parsed.tickets);
        setKitchenQueueTruncated(parsed.truncated);
        setKitchenQueueStatus("live");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError"))
          return;
        setKitchenTickets([]);
        setKitchenQueueTruncated(false);
        setKitchenQueueStatus("unavailable");
      });

    return () => controller.abort();
  }, [accessToken, role, kitchenQueueRefreshKey]);

  useEffect(() => {
    if (!accessToken || !role || role === "Customer") {
      setInventory(INITIAL_INVENTORY);
      setInventoryStatus("preview");
      setInventoryTruncated(false);
      return;
    }

    const controller = new AbortController();
    setInventory([]);
    setInventoryTruncated(false);
    setInventoryStatus("loading");
    void fetch(`${API_BASE}/inventory`, {
      cache: inventoryRefreshKey > 0 ? "reload" : "no-store",
      credentials: "include",
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Inventory is not available from the API.");
        const payload: unknown = await response.json();
        const parsed = parseInventoryResponse(payload);
        if (!parsed) throw new Error("The inventory response was invalid.");
        if (controller.signal.aborted) return;
        setInventory(parsed.items);
        setInventoryTruncated(parsed.truncated);
        setInventoryStatus("live");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError"))
          return;
        setInventory([]);
        setInventoryTruncated(false);
        setInventoryStatus("unavailable");
      });

    return () => controller.abort();
  }, [accessToken, role, inventoryRefreshKey]);

  useEffect(() => {
    if (!accessToken || !role || role === "Customer" || role === "Kitchen Staff") {
      setReservations(INITIAL_RESERVATIONS);
      setReservationsStatus("preview");
      setReservationsTruncated(false);
      return;
    }

    const controller = new AbortController();
    setReservations([]);
    setReservationsTruncated(false);
    setReservationsStatus("loading");
    void fetch(`${API_BASE}/reservations`, {
      cache: reservationsRefreshKey > 0 ? "reload" : "no-store",
      credentials: "include",
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Reservations are not available from the API.");
        const payload: unknown = await response.json();
        const parsed = parseReservationsResponse(payload);
        if (!parsed) throw new Error("The reservation response was invalid.");
        if (controller.signal.aborted) return;
        setReservations(parsed.reservations);
        setReservationsTruncated(parsed.truncated);
        setReservationsStatus("live");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError"))
          return;
        setReservations([]);
        setReservationsTruncated(false);
        setReservationsStatus("unavailable");
      });

    return () => controller.abort();
  }, [accessToken, role, reservationsRefreshKey]);

  useEffect(() => {
    if (!accessToken || !canViewHealthScore(role)) {
      setHealthScore(null);
      setHealthScoreError("");
      setHealthScoreLoading(false);
      return;
    }

    const controller = new AbortController();
    setHealthScore(null);
    setHealthScoreLoading(true);
    setHealthScoreError("");

    void fetch(`${API_BASE}/healthscore`, {
      cache: healthScoreRefreshKey > 0 ? "reload" : "no-store",
      credentials: "include",
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            response.status === 403
              ? "Your role cannot view the health score."
              : "The health-score service is unavailable.",
          );
        }
        const payload: unknown = await response.json();
        if (!isHealthScoreData(payload)) throw new Error("The health-score response was invalid.");
        setHealthScore(payload);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setHealthScore(null);
        setHealthScoreError(
          error instanceof Error ? error.message : "The health-score service is unavailable.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setHealthScoreLoading(false);
      });

    return () => controller.abort();
  }, [accessToken, role, healthScoreRefreshKey]);

  const availableNav = navigationForRole(NAVIGATION, role);
  const currentSection = resolveDashboardSection(NAVIGATION, role, section) as Section;

  useEffect(() => {
    if (section !== currentSection) setSection(currentSection);
  }, [currentSection, section]);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  };

  const canUpdateOrderHeaders =
    role === "Reception" || role === "Manager" || role === "Administrator";

  const advanceOrder = async (id: string) => {
    const currentOrder = orders.find((order) => order.id === id);
    if (!currentOrder) return;

    if (ordersStatus === "live") {
      if (!accessToken || !canUpdateOrderHeaders) {
        notify("Your role cannot update this order header.");
        return;
      }
      const requestedStatus =
        currentOrder.status === "New"
          ? "Accepted"
          : currentOrder.status === "Ready"
            ? "Served"
            : currentOrder.status === "Served"
              ? "Completed"
              : null;
      if (!requestedStatus) {
        notify("Preparation progress is managed item-by-item in the kitchen queue.");
        return;
      }
      try {
        const response = await fetch(`${API_BASE}/orders/${currentOrder.id}/status`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ status: requestedStatus }),
        });
        if (!response.ok) {
          setOrdersRefreshKey((current) => current + 1);
          setKitchenQueueRefreshKey((current) => current + 1);
          notify(
            response.status === 409
              ? "The order changed. Refresh the feed and try again."
              : "The order update was not saved. Check your permissions and connection.",
          );
          return;
        }
        const updated = parseStaffOrderResponse(await response.json());
        const expectedViewStatus: OrderStatus =
          requestedStatus === "Accepted"
            ? "Accepted"
            : requestedStatus === "Served"
              ? "Served"
              : "Completed";
        if (!updated || updated.id !== id || updated.status !== expectedViewStatus) {
          setOrdersRefreshKey((current) => current + 1);
          notify("The API saved an update but returned an invalid order. The feed is refreshing.");
          return;
        }
        setOrders((current) =>
          updated.status === "Completed"
            ? current.filter((order) => order.id !== id)
            : current.map((order) => (order.id === id ? updated : order)),
        );
        setKitchenQueueRefreshKey((current) => current + 1);
        notify(`${displayOrderId(id)} moved to ${requestedStatus.toLowerCase()} and was saved.`);
      } catch {
        setOrdersRefreshKey((current) => current + 1);
        notify("Orders are unavailable; the status update was not saved.");
      }
      return;
    }

    const nextStatus: OrderStatus | null =
      currentOrder.status === "New"
        ? "Accepted"
        : currentOrder.status === "Accepted"
          ? "Preparing"
          : currentOrder.status === "Preparing"
            ? "Ready"
            : currentOrder.status === "Ready"
              ? "Served"
              : null;
    if (nextStatus) {
      setOrders((current) =>
        current.map((order) => (order.id === id ? { ...order, status: nextStatus } : order)),
      );
      notify(
        `${displayOrderId(id)} moved to ${nextStatus.toLowerCase()} in this preview; it was not saved.`,
      );
    }
  };

  const advanceKitchenItem = async (orderId: string, itemId: string) => {
    if (kitchenQueueStatus !== "live") {
      await advanceOrder(orderId);
      return;
    }
    if (!accessToken) {
      notify("Sign in again before updating a kitchen item.");
      return;
    }
    const ticket = kitchenTickets.find((current) => current.id === orderId);
    const item = ticket?.items.find((current) => current.id === itemId);
    if (!ticket || !item) {
      notify("The kitchen item is no longer in this queue. Refresh and try again.");
      setKitchenQueueRefreshKey((current) => current + 1);
      return;
    }
    const preparationStatus =
      item.preparationStatus === "Created"
        ? "Preparing"
        : item.preparationStatus === "Preparing"
          ? "Ready"
          : null;
    if (!preparationStatus) return;

    try {
      const response = await fetch(`${API_BASE}/kitchen/queue/${orderId}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ itemId, preparationStatus }),
      });
      if (!response.ok) {
        setKitchenQueueRefreshKey((current) => current + 1);
        notify(
          response.status === 409
            ? "The item changed. The kitchen queue is refreshing."
            : "The preparation update was not saved. Check your permissions and connection.",
        );
        return;
      }
      const updated = parseStaffOrderResponse(await response.json());
      if (!updated || updated.id !== orderId) {
        setKitchenQueueRefreshKey((current) => current + 1);
        notify("The API saved an update but returned an invalid order. The queue is refreshing.");
        return;
      }
      setOrders((current) => current.map((order) => (order.id === orderId ? updated : order)));
      const updatedTicket = kitchenTicketFromOrder(updated);
      setKitchenTickets((current) =>
        updatedTicket
          ? current.map((currentTicket) =>
              currentTicket.id === orderId ? updatedTicket : currentTicket,
            )
          : current.filter((currentTicket) => currentTicket.id !== orderId),
      );
      notify(`${item.name} moved to ${preparationStatus.toLowerCase()} and was saved.`);
    } catch {
      setKitchenQueueRefreshKey((current) => current + 1);
      notify("The kitchen queue is unavailable; the item update was not saved.");
    }
  };

  const addStock = async (item: InventoryItem, quantity: number): Promise<boolean> => {
    const liveManager =
      accessToken && inventoryStatus === "live" && (role === "Manager" || role === "Administrator");

    if (liveManager) {
      if (!item.id) {
        notify("This inventory item cannot be identified; the count was not saved.");
        return false;
      }
      try {
        const response = await fetch(`${API_BASE}/inventory/${item.id}`, {
          method: "PUT",
          credentials: "include",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ quantity, lowStockThreshold: item.minimum }),
        });
        if (!response.ok) {
          notify("The stock count was not saved. Check your permissions and connection.");
          return false;
        }
        const updated = parseInventoryUpdate(await response.json());
        if (!updated) {
          notify("The inventory response was invalid; the count was not saved.");
          return false;
        }
        setInventory((current) =>
          current.map((currentItem) => (currentItem.id === updated.id ? updated : currentItem)),
        );
        notify(`${item.name} stock count saved.`);
        return true;
      } catch {
        notify("Inventory is unavailable; the stock count was not saved.");
        return false;
      }
    }

    setInventory((current) =>
      current.map((currentItem) => {
        const matches = item.id ? currentItem.id === item.id : currentItem.name === item.name;
        return matches ? { ...currentItem, onHand: quantity } : currentItem;
      }),
    );
    notify(`${item.name} count changed in this preview; it was not saved.`);
    return true;
  };

  const updateReservation = async (id: string) => {
    const current = reservations.find((reservation) => reservation.id === id);
    if (!current) return;
    const next: ReservationStatus | null =
      current.status === "Awaiting"
        ? "Confirmed"
        : current.status === "Confirmed"
          ? "Seated"
          : current.status === "Seated"
            ? "Completed"
            : null;
    if (!next) return;

    if (reservationsStatus === "live" && accessToken) {
      setSavingReservationId(id);
      try {
        const response = await fetch(`${API_BASE}/reservations/${id}`, {
          method: "PUT",
          credentials: "include",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ status: next }),
        });
        if (!response.ok) {
          notify("The reservation was not updated. Refresh and check your permissions.");
          return;
        }
        const updated = parseReservationResponse(await response.json());
        if (!updated) {
          notify("The reservation response was invalid; no local change was made.");
          return;
        }
        setReservations((currentReservations) =>
          currentReservations.map((item) => (item.id === id ? updated : item)),
        );
        notify(`Reservation marked ${next.toLowerCase()}.`);
      } catch {
        notify("Reservations are unavailable; the status was not changed.");
      } finally {
        setSavingReservationId("");
      }
      return;
    }

    setReservations((currentReservations) =>
      currentReservations.map((item) => (item.id === id ? { ...item, status: next } : item)),
    );
    notify(`${id} changed in this preview only; the API did not save it.`);
  };

  const generateRecommendation = async () => {
    setGenerating(true);
    try {
      if (!accessToken) {
        setRecommendation({ ...DEMO_RECOMMENDATION, source: "demo" });
        setRecommendationScopeKey(workspaceScopeKey);
        notify(
          "Preview guidance refreshed. Sign in as a manager and connect the API for live recommendations.",
        );
        return;
      }
      const response = await fetch(
        `${API_BASE}/incidents/${INCIDENT_INVENTORY_ID}/recommendations`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${accessToken}` },
          credentials: "include",
        },
      );
      if (!response.ok) {
        throw new Error(
          response.status === 403
            ? "Your role cannot generate recommendations."
            : "The live recommendation service is not available yet.",
        );
      }
      const result = (await response.json()) as {
        recommendation: Omit<Recommendation, "incidentId"> & { incidentId: string };
      };
      setRecommendation(result.recommendation);
      setRecommendationScopeKey(workspaceScopeKey);
      setRecommendationReviewed(false);
      notify(
        result.recommendation.source === "gemini"
          ? "A new AI recommendation is ready."
          : "A safe fallback recommendation is ready.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Live recommendations are unavailable.";
      notify(`${message} Keeping the preview guidance on screen.`);
    } finally {
      setGenerating(false);
    }
  };

  const goTo = (next: Section) => {
    if (!canAccessDashboardSection(NAVIGATION, role, next)) {
      setSection("Overview");
      setMobileMenuOpen(false);
      setNotificationsOpen(false);
      return;
    }
    setSection(next);
    setMobileMenuOpen(false);
    setNotificationsOpen(false);
  };

  const signOutAndNotify = async () => {
    await signOut();
    notify("You are signed out. The sample workspace is available at /dashboard.");
  };

  if (user?.role === "Customer") {
    return <CustomerPortal userName={user.name} accessToken={accessToken} onSignOut={signOut} />;
  }

  const greetingName = user?.name.split(" ")[0] ?? "Maya";
  const isDemo = !user;
  const canManageInventory = !role || role === "Manager" || role === "Administrator";
  const canViewCommercialData = !role || role === "Manager" || role === "Administrator";
  const canUseInsights = canViewRecommendations(role);
  const healthScoreStatus: HealthScoreViewStatus = !user
    ? "demo"
    : !canViewHealthScore(role)
      ? "restricted"
      : healthScoreLoading
        ? "loading"
        : healthScore
          ? "live"
          : healthScoreError
            ? "unavailable"
            : "loading";
  const headingBySection: Record<Section, { eyebrow: string; title: string; description: string }> =
    {
      Overview: {
        eyebrow: "SATURDAY · 10 OCTOBER 2026",
        title: `Good evening, ${greetingName}.`,
        description: "Here’s the rhythm of your restaurant, at a glance.",
      },
      Orders: {
        eyebrow: "SERVICE WORKSPACE",
        title: "Orders",
        description: "Keep every ticket moving from first touch to final plate.",
      },
      Kitchen: {
        eyebrow: "SERVICE WORKSPACE",
        title: "Kitchen display",
        description: "A calmer pass starts with a clear view of what’s cooking.",
      },
      Reservations: {
        eyebrow: "GUEST EXPERIENCE",
        title: "Reservations",
        description: "Know who’s coming in, and make every arrival feel expected.",
      },
      Inventory: {
        eyebrow: "OPERATIONS",
        title: "Inventory",
        description: "A live-looking snapshot of what’s on hand and what needs attention.",
      },
      Incidents: {
        eyebrow: "OPERATIONS",
        title: "Incidents",
        description: "Spot service risks early and keep a clear record of what happened.",
      },
      Insights: {
        eyebrow: "DINESMART ASSIST",
        title: "Better calls, made earlier.",
        description: "Practical, explainable recommendations grounded in your service context.",
      },
      Analytics: {
        eyebrow: "PERFORMANCE",
        title: "Service analytics",
        description: "A simple read on the trends shaping your week.",
      },
      Settings: {
        eyebrow: "WORKSPACE",
        title: "Settings & connections",
        description: "Your workspace, access, and service connections in one place.",
      },
    };
  const pageMeta = headingBySection[currentSection];

  return (
    <div className="app-shell">
      {mobileMenuOpen ? (
        <button
          className="sidebar-scrim"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}
      <aside
        className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="sidebar-brand">
          <BrandMark />
          <div className="brand-wordmark">
            <span>DineSmart</span>
            <small>RESTAURANT OS</small>
          </div>
          <button
            className="mobile-close icon-button"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileMenuOpen(false)}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <button
          className="restaurant-switcher"
          type="button"
          onClick={() =>
            notify("Restaurant switching will be available when a live workspace is connected.")
          }
        >
          <span className="restaurant-avatar">S</span>
          <span className="restaurant-switch-copy">
            <strong>Saffron &amp; Co.</strong>
            <small>Adyar · Chennai</small>
          </span>
          <Icon name="chevron" size={16} className="switch-chevron" />
        </button>
        <nav className="sidebar-nav" aria-label="Workspace">
          <span className="nav-caption">WORKSPACE</span>
          {availableNav.map((item, index) => (
            <div key={item.label}>
              {item.group === "manage" &&
              (index === 0 || availableNav[index - 1]?.group !== "manage") ? (
                <span className="nav-caption nav-caption-spaced">MANAGE</span>
              ) : null}
              <button
                type="button"
                className={`nav-item ${currentSection === item.label ? "nav-item-active" : ""}`}
                onClick={() => goTo(item.label)}
                aria-current={currentSection === item.label ? "page" : undefined}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
                {item.label === "Orders" ? (
                  <span className="nav-count">18</span>
                ) : item.label === "Incidents" ? (
                  <span className="nav-alert-dot" role="img" aria-label="1 open incident" />
                ) : null}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {canUseInsights ? (
            <div className="sidebar-tip">
              <span className="tip-star">
                <Icon name="spark" size={16} />
              </span>
              <strong>A little more in sync.</strong>
              <p>Connect your operations to see insights shaped around your service.</p>
              <button type="button" onClick={() => goTo("Insights")}>
                Explore insights <Icon name="arrow-right" size={14} />
              </button>
            </div>
          ) : null}
          <div className="sidebar-profile">
            <span className="profile-avatar">
              {user
                ? user.name
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()
                : "MN"}
            </span>
            <span className="profile-copy">
              <strong>{user?.name ?? "Maya Nair"}</strong>
              <small>{user?.role ?? "Manager · Preview"}</small>
            </span>
            {user ? (
              <button
                className="profile-action"
                type="button"
                aria-label="Sign out"
                onClick={() => void signOutAndNotify()}
                title="Sign out"
              >
                <Icon name="logout" size={17} />
              </button>
            ) : (
              <Link className="profile-action" href="/login" aria-label="Sign in" title="Sign in">
                <Icon name="arrow-right" size={17} />
              </Link>
            )}
          </div>
        </div>
      </aside>

      <main className="workspace-main" id="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu-button icon-button"
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Icon name="menu" size={20} />
            </button>
            <span className="topbar-crumb">
              SAFFRON &amp; CO. <span>/</span> <strong>{currentSection}</strong>
            </span>
          </div>
          <div className="topbar-right">
            <span
              className={`connection-pill ${isDemo ? "connection-demo" : "connection-preview"}`}
            >
              <span />
              {isDemo ? "Preview mode" : "Signed-in preview"}
            </span>
            <div className="notification-wrap">
              <button
                className={`icon-button notification-button ${notificationsOpen ? "notification-active" : ""}`}
                type="button"
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
                onClick={() => setNotificationsOpen(!notificationsOpen)}
              >
                <Icon name="bell" size={19} />
                <span className="notification-dot" />
              </button>
              {notificationsOpen ? (
                <div className="notification-popover">
                  <div className="popover-heading">
                    <strong>Notifications</strong>
                    <span>2 new</span>
                  </div>
                  <div className="notification-item">
                    <span className="notification-mark notification-mark-coral">
                      <Icon name="alert" size={15} />
                    </span>
                    <div>
                      <strong>Paneer stock is low</strong>
                      <p>Below the reorder point · 6 min ago</p>
                    </div>
                  </div>
                  <div className="notification-item">
                    <span className="notification-mark notification-mark-green">
                      <Icon name="check" size={15} />
                    </span>
                    <div>
                      <strong>Service is on track</strong>
                      <p>Average ticket time improved today</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="popover-link"
                    onClick={() =>
                      goTo(
                        canUseInsights
                          ? "Incidents"
                          : user?.role === "Reception"
                            ? "Orders"
                            : "Inventory",
                      )
                    }
                  >
                    View activity <Icon name="arrow-right" size={14} />
                  </button>
                </div>
              ) : null}
            </div>
            <span className="topbar-divider" />
            <div className="topbar-date">
              <Icon name="sun" size={16} />
              <span>Evening service</span>
            </div>
          </div>
        </header>

        <div className="page-content">
          <PageHeading
            eyebrow={pageMeta.eyebrow}
            title={pageMeta.title}
            description={pageMeta.description}
          >
            {currentSection === "Overview" ? (
              <>
                {canViewCommercialData ? (
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={() => notify("A preview service report has been prepared.")}
                  >
                    <Icon name="download" size={16} />
                    <span>Export</span>
                  </button>
                ) : null}
                {role !== "Kitchen Staff" ? (
                  <button
                    type="button"
                    className="button button-dark"
                    onClick={() => {
                      goTo("Orders");
                      notify("You’re viewing the sample order queue.");
                    }}
                  >
                    <Icon name="plus" size={16} />
                    <span>New order</span>
                  </button>
                ) : null}
              </>
            ) : currentSection === "Orders" ? (
              <>
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => setOrderStatusFilter("All orders")}
                >
                  <Icon name="filter" size={16} />
                  Filters
                </button>
                {role !== "Kitchen Staff" ? (
                  <button
                    type="button"
                    className="button button-dark"
                    onClick={() =>
                      notify("Order creation is available when your live POS is connected.")
                    }
                  >
                    <Icon name="plus" size={16} />
                    New order
                  </button>
                ) : null}
              </>
            ) : currentSection === "Insights" ? (
              <button
                type="button"
                className="button button-dark"
                disabled={generating}
                onClick={() => void generateRecommendation()}
              >
                <Icon name="spark" size={16} />
                {generating ? "Generating…" : "Generate insight"}
              </button>
            ) : null}
          </PageHeading>

          {demoBannerVisible ? (
            <DemoBanner
              onDismiss={() => setDemoBannerVisible(false)}
              inventoryStatus={inventoryStatus}
              reservationsStatus={reservationsStatus}
              ordersStatus={ordersStatus}
              kitchenQueueStatus={kitchenQueueStatus}
              canManageInventory={canManageInventory}
            />
          ) : null}

          {currentSection === "Overview" ? (
            <OverviewPage
              orders={orders}
              orderFeedStatus={ordersStatus}
              ordersTruncated={ordersTruncated}
              canUpdateOrders={canUpdateOrderHeaders}
              inventory={inventory}
              inventoryStatus={inventoryStatus}
              inventoryTruncated={inventoryTruncated}
              recommendation={currentRecommendation}
              showAi={canUseInsights}
              role={role}
              healthScore={healthScore}
              healthScoreStatus={healthScoreStatus}
              healthScoreError={healthScoreError}
              onRefreshHealthScore={() => setHealthScoreRefreshKey((current) => current + 1)}
              canManageInventory={canManageInventory}
              onAdvance={advanceOrder}
              onRestock={addStock}
              onOpen={() => goTo("Insights")}
              onOrders={() => goTo("Orders")}
              onReservations={() => goTo("Reservations")}
            />
          ) : currentSection === "Orders" ? (
            <OrdersPage
              orders={orders}
              status={ordersStatus}
              truncated={ordersTruncated}
              canUpdateOrders={canUpdateOrderHeaders}
              onAdvance={advanceOrder}
              search={orderSearch}
              onSearch={setOrderSearch}
              statusFilter={orderStatusFilter}
              onFilter={setOrderStatusFilter}
              onRefresh={() => setOrdersRefreshKey((current) => current + 1)}
            />
          ) : currentSection === "Kitchen" ? (
            <KitchenPage
              orders={orders}
              tickets={kitchenTickets}
              status={kitchenQueueStatus}
              truncated={kitchenQueueTruncated}
              onRefresh={() => setKitchenQueueRefreshKey((current) => current + 1)}
              onAdvanceItem={(orderId, itemId) => void advanceKitchenItem(orderId, itemId)}
              onAdvanceOrder={(orderId) => void advanceOrder(orderId)}
            />
          ) : currentSection === "Reservations" ? (
            <ReservationsPage
              reservations={reservations}
              status={reservationsStatus}
              truncated={reservationsTruncated}
              savingId={savingReservationId}
              onUpdate={updateReservation}
              onRefresh={() => setReservationsRefreshKey((current) => current + 1)}
              onToast={notify}
            />
          ) : currentSection === "Inventory" ? (
            <InventoryPage
              inventory={inventory}
              onRestock={addStock}
              canManageInventory={canManageInventory}
              inventoryStatus={inventoryStatus}
              inventoryTruncated={inventoryTruncated}
              onRefresh={() => setInventoryRefreshKey((current) => current + 1)}
            />
          ) : currentSection === "Incidents" ? (
            <IncidentsPage
              recommendation={currentRecommendation}
              onInsights={() => goTo("Insights")}
            />
          ) : currentSection === "Insights" ? (
            <InsightsPage
              recommendation={currentRecommendation}
              reviewed={currentRecommendationReviewed}
              onReview={() => {
                setRecommendationReviewed(true);
                setRecommendationScopeKey(workspaceScopeKey);
                notify("Insight marked as reviewed.");
              }}
              onGenerate={() => void generateRecommendation()}
              generating={generating}
            />
          ) : currentSection === "Analytics" ? (
            <AnalyticsPage key={workspaceScopeKey} />
          ) : (
            <SettingsPage
              userName={user?.name ?? "Maya Nair"}
              role={user?.role ?? "Manager preview"}
              onToast={notify}
            />
          )}

          <footer className="app-footer">
            <span>© 2026 DineSmart</span>
            <span>Thoughtful service, in rhythm.</span>
            <button type="button" onClick={() => goTo("Settings")}>
              Help &amp; support
            </button>
          </footer>
        </div>
      </main>
      {toast ? (
        <div className="toast-message" role="status">
          <span>
            <Icon name="check" size={16} />
          </span>
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function HealthScoreCard({
  data,
  status,
  error,
  onRefresh,
}: {
  data: HealthScoreData | null;
  status: HealthScoreViewStatus;
  error: string;
  onRefresh: () => void;
}) {
  const score = status === "demo" ? 88 : (data?.score ?? null);
  const circumference = 251.3;
  const ringStyle = {
    strokeDasharray: `${((score ?? 0) / 100) * circumference} ${circumference}`,
  } as CSSProperties;
  const title =
    status === "demo"
      ? "Sample service pulse"
      : status === "loading"
        ? "Calculating service health"
        : status === "unavailable"
          ? "Health score unavailable"
          : score !== null && score >= 75
            ? "Service is steady"
            : "Service needs attention";
  const summary =
    status === "demo"
      ? "Sample score · preview only"
      : status === "live" && data
        ? "Calculated on request from current restaurant records."
        : status === "loading"
          ? "Reading current restaurant records…"
          : status === "unavailable"
            ? "Connect the API and MongoDB, then try again."
            : "This role has no access to the restaurant-wide score.";
  const breakdown: Array<
    [string, { score: number; detail: string; status?: "observed" | "insufficient_data" }]
  > = data
    ? [
        ["Kitchen efficiency", data.components.kitchenEfficiency],
        ["Inventory health", data.components.inventoryHealth],
        ["Order completion", data.components.orderCompletionRate],
        ["Reservation efficiency", data.components.reservationEfficiency],
        ["Table utilization", data.components.tableUtilization],
        ["Incident frequency", data.components.incidentFrequency],
      ]
    : status === "demo"
      ? [
          ["Order flow · sample", { score: 92, detail: "Preview metric" }],
          ["Guest wait · sample", { score: 84, detail: "Preview metric" }],
          ["Stock cover · sample", { score: 71, detail: "Preview metric" }],
        ]
      : [];

  return (
    <article className="card health-card">
      <div className="card-heading-row">
        <div>
          <div className="card-overline">
            {status === "live"
              ? "LIVE HEALTH SCORE"
              : status === "demo"
                ? "PREVIEW SAMPLE"
                : "SERVICE PULSE"}
          </div>
          <h2>{title}</h2>
        </div>
        <button
          className="more-button icon-button"
          type="button"
          aria-label="Refresh health score"
          title="Refresh health score"
          onClick={onRefresh}
          disabled={status === "loading" || status === "demo" || status === "restricted"}
        >
          <Icon name="refresh" size={17} />
        </button>
      </div>
      <div className="health-score-wrap">
        <div
          className="health-ring"
          role="img"
          aria-label={
            score === null
              ? "Service health score unavailable"
              : `Service health score ${score} out of 100`
          }
        >
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="40" className="ring-track" />
            <circle cx="50" cy="50" r="40" className="ring-value" style={ringStyle} />
          </svg>
          <div className="health-score-number">
            <strong>{score ?? (status === "loading" ? "…" : "—")}</strong>
            {score !== null ? <span>/ 100</span> : null}
          </div>
        </div>
        <div className="health-score-copy">
          <span className="health-trend">
            {status === "live"
              ? "Live"
              : status === "demo"
                ? "Sample"
                : status === "loading"
                  ? "Updating"
                  : "Offline"}
          </span>
          <p>{summary}</p>
          <span className="health-caption">
            {status === "unavailable" && error
              ? "The live score could not be loaded."
              : "Weighted across six operational signals."}
          </span>
        </div>
      </div>
      {breakdown.length ? (
        <div className="health-breakdown">
          {breakdown.map(([label, metric]) => {
            const insufficient = metric.status === "insufficient_data";
            return (
              <div key={label} title={metric.detail}>
                <span>{label}</span>
                <strong>
                  {metric.score}
                  {insufficient ? "*" : ""}
                </strong>
                <i className="health-bar">
                  <b style={{ width: `${metric.score}%` }} />
                </i>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="health-empty-note">
          {status === "loading"
            ? "Fetching the health-score breakdown…"
            : "No live breakdown is available."}
        </p>
      )}
      {data &&
      Object.values(data.components).some((metric) => metric.status === "insufficient_data") ? (
        <p className="health-data-note">* Neutral score where no eligible data was recorded.</p>
      ) : null}
      {data?.sampling.truncatedCollections.length ? (
        <p className="health-data-note">
          Partial sample: {data.sampling.truncatedCollections.join(", ")} reached the 2,000-record
          cap.
        </p>
      ) : null}
    </article>
  );
}

function OverviewPage({
  orders,
  orderFeedStatus,
  ordersTruncated,
  canUpdateOrders,
  inventory,
  inventoryStatus,
  inventoryTruncated,
  recommendation,
  showAi,
  role,
  healthScore,
  healthScoreStatus,
  healthScoreError,
  onRefreshHealthScore,
  canManageInventory,
  onAdvance,
  onRestock,
  onOpen,
  onOrders,
  onReservations,
}: {
  orders: Order[];
  orderFeedStatus: OrderFeedStatus;
  ordersTruncated: boolean;
  canUpdateOrders: boolean;
  inventory: InventoryItem[];
  inventoryStatus: InventoryViewStatus;
  inventoryTruncated: boolean;
  recommendation: Recommendation;
  showAi: boolean;
  role: AuthUser["role"] | undefined;
  healthScore: HealthScoreData | null;
  healthScoreStatus: HealthScoreViewStatus;
  healthScoreError: string;
  onRefreshHealthScore: () => void;
  canManageInventory: boolean;
  onAdvance: (id: string) => void;
  onRestock: (item: InventoryItem, quantity: number) => Promise<boolean>;
  onOpen: () => void;
  onOrders: () => void;
  onReservations: () => void;
}) {
  return (
    <>
      <section className="metrics-grid" aria-label="Today's service metrics">
        {role === "Kitchen Staff" ? (
          <>
            <MetricCard
              icon="orders"
              label="Active tickets · sample"
              value={orders.filter((order) => order.status !== "Served").length}
              delta="Sample"
              detail="Preview queue only"
              tone="coral"
            />
            <MetricCard
              icon="check"
              label="Ready at pass · sample"
              value={orders.filter((order) => order.status === "Ready").length}
              delta="Sample"
              detail="Not connected to live orders"
              tone="green"
            />
            <MetricCard
              icon="clock"
              label="Avg. prep time · sample"
              value="16 min"
              delta="Preview"
              detail="Illustrative service metric"
              tone="blue"
            />
          </>
        ) : (
          <>
            {role !== "Reception" ? (
              <MetricCard
                icon="receipt"
                label="Gross revenue · sample"
                value="₹84,260"
                delta="Sample"
                detail="Not live financial data"
                tone="green"
              />
            ) : null}
            <MetricCard
              icon="orders"
              label="Orders today · sample"
              value="126"
              delta="Sample"
              detail="18 currently in sample service"
              tone="coral"
            />
            <MetricCard
              icon="clock"
              label="Avg. ticket time · sample"
              value="16 min"
              delta="Preview"
              detail="Illustrative service metric"
              tone="blue"
            />
            <MetricCard
              icon="spark"
              label={healthScoreStatus === "demo" ? "Service health · sample" : "Service health"}
              value={
                healthScoreStatus === "demo" ? (
                  <>
                    <span>88</span>
                    <span>/100</span>
                  </>
                ) : healthScore ? (
                  <>
                    <span>{healthScore.score}</span>
                    <span>/100</span>
                  </>
                ) : healthScoreStatus === "loading" ? (
                  "…"
                ) : (
                  "—"
                )
              }
              delta={
                healthScoreStatus === "live"
                  ? "Live"
                  : healthScoreStatus === "demo"
                    ? "Sample"
                    : healthScoreStatus === "loading"
                      ? "Loading"
                      : "Unavailable"
              }
              detail={
                healthScoreStatus === "live"
                  ? "Current API calculation"
                  : healthScoreStatus === "demo"
                    ? "Preview only · not operational data"
                    : healthScoreStatus === "loading"
                      ? "Connecting to the score API"
                      : "No live score available"
              }
              tone="gold"
            />
          </>
        )}
      </section>

      {role === "Kitchen Staff" ? null : (
        <section
          className={`overview-top-grid ${role === "Reception" ? "overview-top-grid-single" : ""}`}
        >
          {role !== "Reception" ? (
            <article className="card revenue-card">
              <div className="card-heading-row">
                <div>
                  <div className="card-overline">YOUR WEEK AT A GLANCE · SAMPLE</div>
                  <h2>Revenue overview · preview</h2>
                </div>
                <button
                  className="select-button"
                  type="button"
                  aria-label="Selected range, last 7 days"
                  onClick={() => {}}
                >
                  <span>Last 7 days</span>
                  <Icon name="chevron" size={15} />
                </button>
              </div>
              <div className="revenue-summary">
                <strong>₹4,28,590</strong>
                <span className="revenue-trend">
                  <Icon name="arrow-up" size={13} />
                  12.8%
                </span>
                <small>compared to previous week</small>
              </div>
              <RevenueChart />
            </article>
          ) : null}
          <HealthScoreCard
            data={healthScore}
            status={healthScoreStatus}
            error={healthScoreError}
            onRefresh={onRefreshHealthScore}
          />
        </section>
      )}

      <section className="overview-middle-grid">
        <article className="card order-overview-card">
          <div className="card-heading-row card-heading-bottom">
            <div>
              <div className="card-overline">
                {orderFeedStatus === "live" ? "LIVE STAFF FEED" : "SAMPLE SERVICE"}
              </div>
              <h2>
                Orders in motion{" "}
                <span className="heading-count">
                  {orderFeedStatus === "live" ? orders.length : 18}
                </span>
              </h2>
            </div>
            <button className="text-link" type="button" onClick={onOrders}>
              See all <Icon name="arrow-right" size={15} />
            </button>
          </div>
          <OrdersTable
            orders={orders.slice(0, 4)}
            onAdvance={onAdvance}
            canUpdate={canUpdateOrders}
            status={orderFeedStatus}
            compact
          />
          <div className="card-bottom-note">
            <span className="small-live-dot" />
            {orderFeedStatus === "live"
              ? `${orders.length} active order${orders.length === 1 ? "" : "s"} in the live feed`
              : "4 sample tickets shown"}
            {ordersTruncated ? " · first 200 only" : ""}
          </div>
        </article>
        {showAi ? (
          <article className="insight-teaser-card">
            <div className="insight-teaser-top">
              <span className="insight-teaser-icon">
                <Icon name="spark" size={18} />
              </span>
              <span>DINESMART ASSIST</span>
              <span className="open-incident-tag">1 to review</span>
            </div>
            <div className="insight-teaser-label">
              <span className="priority-dot" /> STOCK WATCH · HIGH PRIORITY
            </div>
            <h2>One thing to get ahead of.</h2>
            <p>{recommendation.summary}</p>
            <div className="insight-teaser-action">
              <span className="action-number">01</span>
              <span>Confirm a quick stock transfer before the dinner rush peaks.</span>
            </div>
            <div className="insight-teaser-footer">
              <span className={`insight-source-dot ${recommendation.source}`} />
              {recommendation.source === "gemini" ? "Gemini recommendation" : "Preview guidance"}
              <button type="button" onClick={onOpen}>
                Review insight <Icon name="arrow-right" size={14} />
              </button>
            </div>
          </article>
        ) : (
          <article className="card shift-note-card">
            <span className="shift-note-icon">
              <Icon name="kitchen" size={19} />
            </span>
            <div className="card-overline">SHIFT NOTE</div>
            <h2>One smooth handoff at a time.</h2>
            <p>
              Keep tickets moving and let the floor lead know when a table is ready for the next
              course.
            </p>
            <span className="shift-note-status">
              <i /> Service is steady
            </span>
          </article>
        )}
      </section>

      <section
        className={`overview-bottom-grid ${role === "Kitchen Staff" ? "overview-bottom-grid-single" : ""}`}
      >
        <article className="card inventory-overview-card">
          <div className="card-heading-row">
            <div>
              <div className="card-overline">
                {canManageInventory ? "KEEP THE PASS READY" : "STOCK AVAILABILITY"} ·{" "}
                {inventoryStatus === "live"
                  ? "LIVE"
                  : inventoryStatus === "loading"
                    ? "LOADING"
                    : inventoryStatus === "unavailable"
                      ? "PREVIEW · API OFFLINE"
                      : "PREVIEW"}
              </div>
              <h2>{canManageInventory ? "Stock to watch" : "Stock availability"}</h2>
            </div>
          </div>
          <InventoryRows
            inventory={inventory}
            onRestock={onRestock}
            compact
            canManage={canManageInventory}
          />
          {inventoryTruncated ? (
            <p className="health-data-note">Showing the first 2,000 inventory items.</p>
          ) : null}
        </article>
        {role === "Kitchen Staff" ? null : (
          <article className="card reservations-overview-card">
            <div className="card-heading-row">
              <div>
                <div className="card-overline">THE NEXT ARRIVALS</div>
                <h2>Tonight’s tables</h2>
              </div>
              <button className="text-link" type="button" onClick={onReservations}>
                View floor <Icon name="arrow-right" size={15} />
              </button>
            </div>
            <div className="reservation-preview">
              <div className="reservation-count">
                <strong>12</strong>
                <span>reservations</span>
              </div>
              <div className="reservation-timeline">
                <div className="timeline-time">
                  7:00<span>pm</span>
                </div>
                <div className="timeline-stem">
                  <i />
                  <b />
                  <i />
                </div>
                <div className="timeline-list">
                  <div>
                    <strong>Priya Shah</strong>
                    <span>4 guests · Table 02</span>
                  </div>
                  <div>
                    <strong>Nikhil Iyer</strong>
                    <span>2 guests · Table 06</span>
                  </div>
                  <div>
                    <strong>Ananya Rao</strong>
                    <span>6 guests · Table 09</span>
                  </div>
                </div>
              </div>
            </div>
          </article>
        )}
      </section>
      <div className="overview-footnote">
        <span>
          <Icon name="sun" size={15} /> All times in IST
        </span>
        <span>
          {orderFeedStatus === "live" && inventoryStatus === "live"
            ? role === "Manager" || role === "Administrator"
              ? "Orders and inventory are live; operational analytics are on the Analytics page"
              : "Orders and inventory are live; other dashboard metrics remain a preview"
            : orderFeedStatus === "live"
              ? "Staff orders are live; other operational metrics remain a preview"
              : inventoryStatus === "live"
                ? "Inventory is live; most other operational data is a preview"
                : healthScoreStatus === "live"
                  ? "Health score calculated on request; other data is a preview"
                  : "Operational metrics are sample-only"}
        </span>
      </div>
    </>
  );
}

function OrdersPage({
  orders,
  status,
  truncated,
  canUpdateOrders,
  onAdvance,
  search,
  onSearch,
  statusFilter,
  onFilter,
  onRefresh,
}: {
  orders: Order[];
  status: OrderFeedStatus;
  truncated: boolean;
  canUpdateOrders: boolean;
  onAdvance: (id: string) => void;
  onRefresh: () => void;
  search: string;
  onSearch: (value: string) => void;
  statusFilter: string;
  onFilter: (value: string) => void;
}) {
  const visible = orders.filter((order) => {
    const queryMatch = `${order.id} ${order.guest} ${order.items}`
      .toLowerCase()
      .includes(search.toLowerCase());
    return queryMatch && (statusFilter === "All orders" || order.status === statusFilter);
  });
  return (
    <>
      <section className="quick-stat-row">
        <div>
          <span>In progress</span>
          <strong>
            {
              orders.filter((order) => order.status === "Accepted" || order.status === "Preparing")
                .length
            }
          </strong>
          <i className="stat-dot stat-dot-gold" />
        </div>
        <div>
          <span>New tickets</span>
          <strong>{orders.filter((order) => order.status === "New").length}</strong>
          <i className="stat-dot stat-dot-blue" />
        </div>
        <div>
          <span>Ready to serve</span>
          <strong>{orders.filter((order) => order.status === "Ready").length}</strong>
          <i className="stat-dot stat-dot-green" />
        </div>
        <div>
          <span>Avg. ticket time</span>
          <strong>
            {orders.length
              ? `${Math.round(orders.reduce((total, order) => total + order.elapsed, 0) / orders.length)} min`
              : "—"}
          </strong>
          <i className="stat-dot stat-dot-coral" />
        </div>
      </section>
      <article className="card orders-page-card">
        <div className="orders-toolbar">
          <div>
            <div className="card-overline">
              {status === "live" ? "LIVE STAFF FEED" : "SAMPLE SERVICE"}
            </div>
            <h2>
              Active orders <span className="heading-count">{visible.length}</span>
            </h2>
          </div>
          <div className="orders-filters">
            <label className="search-field">
              <Icon name="search" size={17} />
              <span className="sr-only">Search orders</span>
              <input
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="Search orders"
              />
            </label>
            <label className="select-wrap">
              <span className="sr-only">Filter by order status</span>
              <select value={statusFilter} onChange={(event) => onFilter(event.target.value)}>
                <option>All orders</option>
                <option>New</option>
                <option>Accepted</option>
                <option>Preparing</option>
                <option>Ready</option>
                <option>Served</option>
              </select>
              <Icon name="chevron" size={14} />
            </label>
            <button type="button" className="button button-outline" onClick={onRefresh}>
              <Icon name="refresh" size={15} /> Refresh
            </button>
          </div>
        </div>
        {visible.length ? (
          <OrdersTable
            orders={visible}
            onAdvance={onAdvance}
            canUpdate={canUpdateOrders}
            status={status}
          />
        ) : (
          <div className="empty-state">
            <span>
              <Icon name="search" size={22} />
            </span>
            <strong>
              {status === "live" && orders.length === 0 ? "No active orders" : "No orders found"}
            </strong>
            <p>
              {status === "live" && orders.length === 0
                ? "New orders appear here when staff accept them."
                : "Try a different search or status filter."}
            </p>
          </div>
        )}
        <div className="table-pagination">
          <span>
            Showing <strong>{visible.length}</strong>{" "}
            {status === "live" ? "live orders" : "sample orders"}
          </span>
          <div>
            <button type="button" disabled>
              Previous
            </button>
            <button type="button" disabled>
              Next
            </button>
          </div>
        </div>
      </article>
      {truncated && status === "live" ? (
        <p className="preview-note">
          <Icon name="alert" size={15} /> This feed is capped at the oldest 200 active orders; newer
          active orders may be omitted.
        </p>
      ) : null}
      {status !== "live" ? (
        <p className="preview-note">
          <Icon name="alert" size={15} />
          {status === "loading"
            ? "Loading live orders; preview actions are not saved."
            : status === "unavailable"
              ? "The staff order feed is unavailable; sample actions are not saved."
              : "Actions update this sample view only; they are not saved."}
        </p>
      ) : null}
    </>
  );
}

function KitchenPage({
  orders,
  tickets,
  status,
  truncated,
  onRefresh,
  onAdvanceItem,
  onAdvanceOrder,
}: {
  orders: Order[];
  tickets: KitchenTicket[];
  status: OrderFeedStatus;
  truncated: boolean;
  onRefresh: () => void;
  onAdvanceItem: (orderId: string, itemId: string) => void;
  onAdvanceOrder: (id: string) => void;
}) {
  const live = status === "live";
  const liveColumns: Array<{
    title: KitchenTicket["status"];
    description: string;
    items: KitchenTicket[];
  }> = [
    {
      title: "Accepted",
      description: "Just came in",
      items: tickets.filter((ticket) => ticket.status === "Accepted"),
    },
    {
      title: "Preparing",
      description: "On the line",
      items: tickets.filter((ticket) => ticket.status === "Preparing"),
    },
    {
      title: "Ready",
      description: "At the pass",
      items: tickets.filter((ticket) => ticket.status === "Ready"),
    },
  ];
  const previewColumns: Array<{
    title: "New" | "Preparing" | "Ready";
    description: string;
    items: Order[];
  }> = [
    {
      title: "New",
      description: "Just came in",
      items: orders.filter((order) => order.status === "New" || order.status === "Accepted"),
    },
    {
      title: "Preparing",
      description: "On the line",
      items: orders.filter((order) => order.status === "Preparing"),
    },
    {
      title: "Ready",
      description: "At the pass",
      items: orders.filter((order) => order.status === "Ready"),
    },
  ];
  const oldestTicketAge = tickets.reduce((oldest, ticket) => Math.max(oldest, ticket.elapsed), 0);

  return (
    <>
      <div className="kitchen-toolbar">
        <span>
          <i className={live ? "small-live-dot" : ""} />
          {live
            ? "Live kitchen queue · oldest first"
            : status === "loading"
              ? "Loading live queue · sample board shown"
              : status === "unavailable"
                ? "Queue unavailable · sample board only"
                : "Dinner service · sample board"}
        </span>
        <span>
          {live ? (
            <>
              Oldest ticket <strong>{oldestTicketAge} min</strong>
            </>
          ) : (
            <>
              Average prep <strong>16 min · sample</strong>
            </>
          )}
          <button
            type="button"
            className="text-link"
            onClick={onRefresh}
            aria-label="Refresh kitchen queue"
          >
            <Icon name="refresh" size={15} /> Refresh
          </button>
        </span>
      </div>
      <section className="kitchen-board" aria-label="Kitchen order board">
        {live
          ? liveColumns.map((column) => (
              <div className="kitchen-column" key={column.title}>
                <div className={`kitchen-column-head kitchen-head-${column.title.toLowerCase()}`}>
                  <div>
                    <span className="kitchen-status-dot" />
                    <h2>{column.title}</h2>
                    <span className="kitchen-count">{column.items.length}</span>
                  </div>
                  <p>{column.description}</p>
                </div>
                <div className="kitchen-cards">
                  {column.items.length ? (
                    column.items.map((ticket) => (
                      <article className="kitchen-order-card" key={ticket.id}>
                        <div className="kitchen-order-top">
                          <strong>{displayOrderId(ticket.id)}</strong>
                          <span>{ticket.elapsed} min</span>
                        </div>
                        <p className="kitchen-private-note">
                          Customer and table details are not included in this kitchen feed.
                        </p>
                        <ul className="kitchen-item-list">
                          {ticket.items.map((item) => (
                            <li className="kitchen-item-row" key={item.id}>
                              <div className="kitchen-item-main">
                                <strong>
                                  {item.name} × {item.quantity}
                                </strong>
                                <span>{item.preparationStatus}</span>
                              </div>
                              {item.preparationStatus !== "Ready" ? (
                                <button
                                  type="button"
                                  className={`kitchen-card-action ${item.preparationStatus === "Preparing" ? "kitchen-action-ready" : ""}`}
                                  onClick={() => onAdvanceItem(ticket.id, item.id)}
                                >
                                  {item.preparationStatus === "Created"
                                    ? "Start preparing"
                                    : "Mark ready"}
                                  <Icon name="arrow-right" size={15} />
                                </button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))
                  ) : (
                    <div className="kitchen-empty">
                      <span>
                        <Icon name="check" size={18} />
                      </span>
                      <p>All clear for now.</p>
                    </div>
                  )}
                </div>
              </div>
            ))
          : previewColumns.map((column) => (
              <div className="kitchen-column" key={column.title}>
                <div className={`kitchen-column-head kitchen-head-${column.title.toLowerCase()}`}>
                  <div>
                    <span className="kitchen-status-dot" />
                    <h2>{column.title}</h2>
                    <span className="kitchen-count">{column.items.length}</span>
                  </div>
                  <p>{column.description}</p>
                </div>
                <div className="kitchen-cards">
                  {column.items.length ? (
                    column.items.map((order) => (
                      <article className="kitchen-order-card" key={order.id}>
                        <div className="kitchen-order-top">
                          <strong>{displayOrderId(order.id)}</strong>
                          <span>{order.elapsed} min</span>
                        </div>
                        <h3>{order.items.split(",")[0]}</h3>
                        <p>{order.items.split(",").slice(1).join(",") || "One item"}</p>
                        <div className="kitchen-order-meta">
                          <span>
                            <Icon name="table" size={14} /> {order.table}
                          </span>
                          <span>{order.guest}</span>
                        </div>
                        <button
                          type="button"
                          className={`kitchen-card-action ${column.title === "Ready" ? "kitchen-action-ready" : ""}`}
                          onClick={() => onAdvanceOrder(order.id)}
                        >
                          {column.title === "New"
                            ? "Start preparing"
                            : column.title === "Preparing"
                              ? "Mark as ready"
                              : "Hand to floor"}
                          <Icon name="arrow-right" size={15} />
                        </button>
                      </article>
                    ))
                  ) : (
                    <div className="kitchen-empty">
                      <span>
                        <Icon name="check" size={18} />
                      </span>
                      <p>All clear for now.</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
      </section>
      {truncated && live ? (
        <p className="preview-note">
          <Icon name="alert" size={15} /> Only the oldest 200 active kitchen tickets are shown.
        </p>
      ) : null}
      {!live ? (
        <p className="preview-note">
          <Icon name="alert" size={15} />
          {status === "loading"
            ? "Loading the live kitchen queue; sample actions are not saved."
            : status === "unavailable"
              ? "The kitchen queue is unavailable; sample actions are not saved."
              : "This kitchen board uses sample tickets; actions are not saved."}
        </p>
      ) : null}
    </>
  );
}

function ReservationsPage({
  reservations,
  status,
  truncated,
  savingId,
  onUpdate,
  onRefresh,
  onToast,
}: {
  reservations: Reservation[];
  status: ReservationViewStatus;
  truncated: boolean;
  savingId: string;
  onUpdate: (id: string) => void | Promise<void>;
  onRefresh: () => void;
  onToast: (message: string) => void;
}) {
  const reservationCount = status === "live" ? reservations.length : 12;
  const guestCount =
    status === "live"
      ? reservations.reduce((total, reservation) => total + reservation.party, 0)
      : 38;
  const assignedTables =
    status === "live"
      ? reservations.filter((reservation) => reservation.table !== "Unassigned").length
      : 9;
  const dataLabel =
    status === "live"
      ? "LIVE RESERVATIONS · CHENNAI TIME"
      : status === "loading"
        ? "LOADING RESERVATIONS"
        : status === "unavailable"
          ? "API UNAVAILABLE · SAMPLE DATA"
          : "SAMPLE DATA · PREVIEW ONLY";

  return (
    <>
      <section className="reservation-summary-grid">
        <article>
          <span className="summary-icon summary-icon-green">
            <Icon name="calendar" size={18} />
          </span>
          <div>
            <span>Reservations loaded</span>
            <strong>
              {reservationCount} <small>bookings</small>
            </strong>
          </div>
        </article>
        <article>
          <span className="summary-icon summary-icon-blue">
            <Icon name="user" size={18} />
          </span>
          <div>
            <span>Party seats</span>
            <strong>
              {guestCount} <small>people</small>
            </strong>
          </div>
        </article>
        <article>
          <span className="summary-icon summary-icon-gold">
            <Icon name="table" size={18} />
          </span>
          <div>
            <span>Tables assigned today</span>
            <strong>
              {assignedTables} <small>reservations</small>
            </strong>
          </div>
        </article>
      </section>
      <article className="card reservations-card">
        <div className="orders-toolbar">
          <div>
            <div className="card-overline">{dataLabel}</div>
            <h2>Reservation schedule</h2>
          </div>
          <button
            className="select-button"
            type="button"
            onClick={onRefresh}
            disabled={status === "loading"}
          >
            <Icon name="refresh" size={15} />
            <span>{status === "loading" ? "Loading…" : "Refresh"}</span>
          </button>
        </div>
        <div className="table-scroll">
          <table className="data-table reservation-table">
            <thead>
              <tr>
                <th>Arrival</th>
                <th>Guest</th>
                <th>Party</th>
                <th>Table</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {reservations.length ? (
                reservations.map((reservation) => {
                  const action =
                    reservation.status === "Awaiting"
                      ? "Confirm"
                      : reservation.status === "Confirmed"
                        ? "Seat guest"
                        : reservation.status === "Seated"
                          ? "Complete"
                          : null;
                  const statusLabel =
                    reservation.status === "NoShow" ? "No show" : reservation.status;
                  return (
                    <tr key={reservation.id}>
                      <td>
                        <span className="reservation-time">{reservation.time}</span>
                        <span className="cell-subline">
                          {reservation.startAt
                            ? new Intl.DateTimeFormat("en-IN", {
                                timeZone: "Asia/Kolkata",
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              }).format(new Date(reservation.startAt))
                            : reservation.id}
                        </span>
                      </td>
                      <td>
                        <span className="cell-strong">{reservation.guest}</span>
                        <span className="cell-subline">
                          Reservation · {reservation.restaurantName ?? "Saffron & Co."}
                        </span>
                      </td>
                      <td>{reservation.party} guests</td>
                      <td>{reservation.table}</td>
                      <td>
                        <StatusPill>{statusLabel}</StatusPill>
                      </td>
                      <td className="table-action-cell">
                        <button
                          aria-label={
                            action
                              ? `${action} ${reservation.guest}`
                              : `No action for ${reservation.guest}`
                          }
                          className="table-action"
                          disabled={!action || savingId === reservation.id || status === "loading"}
                          type="button"
                          onClick={() => void onUpdate(reservation.id)}
                        >
                          {savingId === reservation.id ? "Saving…" : (action ?? "—")}
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6}>
                    {status === "live"
                      ? "No reservations were returned for this restaurant."
                      : "No sample reservations are available."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="reservation-foot">
          <span>
            {status === "live" ? <i className="small-live-dot" /> : null}
            {status === "live"
              ? `${reservations.length}${truncated ? "+" : ""} reservations loaded from the API${truncated ? " (list capped at 500)" : ""}.`
              : status === "loading"
                ? "Loading saved reservations; sample data is shown until the API responds."
                : status === "unavailable"
                  ? "Showing sample reservations. Changes are not saved while the API is unavailable."
                  : "Showing sample reservations. Changes are not saved."}
          </span>
          <button
            className="text-link"
            type="button"
            onClick={() =>
              onToast("Floor planning will be available once table-management APIs are connected.")
            }
          >
            View floor plan <Icon name="arrow-right" size={15} />
          </button>
        </div>
      </article>
      <div className="reservation-note-card">
        <span>
          <Icon name="spark" size={18} />
        </span>
        <div>
          <strong>A smoother welcome starts before the door.</strong>
          <p>Keep guest notes, arrival timing, and table availability together in one calm view.</p>
        </div>
        <button
          type="button"
          onClick={() =>
            onToast("Floor planning will be available once the live workspace is connected.")
          }
        >
          Explore floor plan <Icon name="arrow-right" size={15} />
        </button>
      </div>
    </>
  );
}

function InventoryPage({
  inventory,
  onRestock,
  canManageInventory,
  inventoryStatus,
  inventoryTruncated,
  onRefresh,
}: {
  inventory: InventoryItem[];
  onRestock: (item: InventoryItem, quantity: number) => Promise<boolean>;
  canManageInventory: boolean;
  inventoryStatus: InventoryViewStatus;
  inventoryTruncated: boolean;
  onRefresh: () => void;
}) {
  const lowCount = inventory.filter((item) => item.onHand <= item.minimum).length;
  return (
    <>
      <section className="inventory-summary-row">
        <div className="inventory-summary-box">
          <span className="summary-icon summary-icon-coral">
            <Icon name="alert" size={18} />
          </span>
          <div>
            <span>Below reorder point</span>
            <strong>
              {lowCount} <small>items</small>
            </strong>
          </div>
        </div>
        <div className="inventory-summary-box">
          <span className="summary-icon summary-icon-green">
            <Icon name="box" size={18} />
          </span>
          <div>
            <span>Healthy stock</span>
            <strong>
              {inventory.length - lowCount} <small>items</small>
            </strong>
          </div>
        </div>
        <div className="inventory-summary-box inventory-supplier">
          <div>
            <span>Supplier connection</span>
            <strong>Preview only</strong>
            <small>No live supplier integration</small>
          </div>
          <span className="supplier-icon">
            <Icon name="arrow-right" size={16} />
          </span>
        </div>
      </section>
      <article className="card inventory-page-card">
        <div className="orders-toolbar">
          <div>
            <div className="card-overline">
              {canManageInventory ? "STOCK CONTROL" : "STOCK AVAILABILITY"} ·{" "}
              {inventoryStatus === "live"
                ? "LIVE"
                : inventoryStatus === "loading"
                  ? "LOADING"
                  : inventoryStatus === "unavailable"
                    ? "PREVIEW · API OFFLINE"
                    : "PREVIEW"}
            </div>
            <h2>Inventory snapshot</h2>
          </div>
          {inventoryStatus !== "preview" ? (
            <button
              className="icon-button"
              type="button"
              aria-label="Refresh inventory"
              title="Refresh inventory"
              onClick={onRefresh}
              disabled={inventoryStatus === "loading"}
            >
              <Icon name="refresh" size={16} />
            </button>
          ) : null}
        </div>
        {canManageInventory ? (
          <p className="health-data-note inventory-adjustment-hint">
            Set the exact on-hand count for each item. Stock is not deducted automatically.
          </p>
        ) : null}
        <InventoryRows inventory={inventory} onRestock={onRestock} canManage={canManageInventory} />
        {inventoryTruncated ? (
          <p className="health-data-note">Showing the first 2,000 inventory items.</p>
        ) : null}
      </article>
      {inventoryStatus !== "live" ? (
        <article className="stock-guidance">
          <span className="stock-guidance-icon">
            <Icon name="spark" size={18} />
          </span>
          <div>
            <strong>Preview guidance for the dinner rush</strong>
            <p>
              Sample paneer and spinach are below their reorder points. Live recommendations require
              connected incident data.
            </p>
          </div>
          <span className="guidance-pill">Sample only</span>
        </article>
      ) : null}
      <p className="preview-note" role={inventoryStatus === "unavailable" ? "alert" : "status"}>
        <Icon name="alert" size={15} />
        {inventoryStatus === "live"
          ? canManageInventory
            ? "Inventory counts are loaded from the API; manager stock adjustments save to the restaurant record."
            : "Inventory availability is live and read-only for this role."
          : inventoryStatus === "loading"
            ? "Loading live inventory. Sample rows are shown until it arrives; preview adjustments are not saved."
            : inventoryStatus === "unavailable"
              ? "Live inventory could not be loaded. Showing sample data; preview adjustments are not saved. Refresh to retry."
              : "Showing sample inventory. Adjustments in this preview are not persisted."}
      </p>
    </>
  );
}

function IncidentsPage({
  recommendation,
  onInsights,
}: {
  recommendation: Recommendation;
  onInsights: () => void;
}) {
  return (
    <>
      <section className="incident-summary-row">
        <article>
          <span className="incident-number incident-number-coral">01</span>
          <div>
            <span>Open now</span>
            <strong>1 incident</strong>
          </div>
        </article>
        <article>
          <span className="incident-number incident-number-gold">06</span>
          <div>
            <span>Resolved today</span>
            <strong>6 incidents</strong>
          </div>
        </article>
        <article>
          <span className="incident-number incident-number-green">
            <Icon name="check" size={17} />
          </span>
          <div>
            <span>Average resolution</span>
            <strong>11 min</strong>
          </div>
        </article>
      </section>
      <article className="card incident-card">
        <div className="incident-row-top">
          <div>
            <span className="incident-type-pill">
              <i /> INVENTORY · STOCK RISK
            </span>
            <StatusPill tone="status-pill status-critical">Critical</StatusPill>
          </div>
          <span className="incident-time">Opened at 6:31 pm · 9 min ago</span>
        </div>
        <h2>Fresh paneer has fallen below its reorder point.</h2>
        <p className="incident-description">
          On-hand quantity is 3 kg, below the 8 kg threshold. Current dinner service is using paneer
          faster than the usual Saturday rate.
        </p>
        <div className="incident-context-grid">
          <div>
            <span>On hand</span>
            <strong>3 kg</strong>
          </div>
          <div>
            <span>Reorder point</span>
            <strong>8 kg</strong>
          </div>
          <div>
            <span>Service status</span>
            <strong>Open · monitoring</strong>
          </div>
          <div>
            <span>Restaurant</span>
            <strong>Saffron &amp; Co.</strong>
          </div>
        </div>
        <div className="incident-actions-row">
          <span>
            <Icon name="spark" size={16} /> DineSmart Assist has a suggestion ready.
          </span>
          <button className="button button-dark" type="button" onClick={onInsights}>
            Review recommendation <Icon name="arrow-right" size={15} />
          </button>
        </div>
      </article>
      <div className="incident-history-head">
        <div>
          <div className="card-overline">RECENT ACTIVITY</div>
          <h2>Resolved incidents</h2>
        </div>
        <button className="text-link" type="button">
          View history <Icon name="arrow-right" size={15} />
        </button>
      </div>
      <div className="resolved-incident-row">
        <span className="resolved-check">
          <Icon name="check" size={15} />
        </span>
        <div>
          <strong>Kitchen ticket time briefly exceeded target</strong>
          <span>Resolved by kitchen lead · 5:12 pm</span>
        </div>
        <StatusPill>Resolved</StatusPill>
      </div>
      <div className="resolved-incident-row">
        <span className="resolved-check">
          <Icon name="check" size={15} />
        </span>
        <div>
          <strong>Table 7 reset delayed between parties</strong>
          <span>Resolved by floor manager · 3:48 pm</span>
        </div>
        <StatusPill>Resolved</StatusPill>
      </div>
      <div className="sr-only">Current demo recommendation: {recommendation.summary}</div>
    </>
  );
}

function InsightsPage({
  recommendation,
  reviewed,
  onReview,
  onGenerate,
  generating,
}: {
  recommendation: Recommendation;
  reviewed: boolean;
  onReview: () => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  return (
    <>
      <section className="insights-welcome">
        <div className="insights-welcome-copy">
          <span className="insights-sparkle">
            <Icon name="spark" size={21} />
          </span>
          <div>
            <strong>One clear next step is better than ten more alerts.</strong>
            <p>
              Recommendations are advisory, grounded in restaurant context, and never change your
              operations automatically.
            </p>
          </div>
        </div>
        <span className="insights-safety">
          <Icon name="check" size={14} /> HUMAN-IN-THE-LOOP
        </span>
      </section>
      <div className="insights-layout">
        <div className="insights-main-column">
          <div className="section-title-inline">
            <div>
              <div className="card-overline">CURRENT RECOMMENDATION</div>
              <h2>Fresh paneer · stock risk</h2>
            </div>
            <span className="incident-status-open">
              <i /> OPEN INCIDENT
            </span>
          </div>
          <RecommendationCard
            recommendation={recommendation}
            reviewed={reviewed}
            onReview={onReview}
            onGenerate={onGenerate}
            generating={generating}
          />
          <div className="insight-supporting-grid">
            <article className="card supporting-card">
              <span className="supporting-icon supporting-icon-coral">
                <Icon name="box" size={17} />
              </span>
              <div className="card-overline">SIGNAL</div>
              <h3>Below the reorder point</h3>
              <p>
                3 kg on hand · reorder point is 8 kg · Saturday dinner service is using stock faster
                than average.
              </p>
            </article>
            <article className="card supporting-card">
              <span className="supporting-icon supporting-icon-green">
                <Icon name="calendar" size={17} />
              </span>
              <div className="card-overline">WHAT THIS PROTECTS</div>
              <h3>Tonight’s menu, without a scramble</h3>
              <p>
                Protect the current menu and give the kitchen lead a short, practical plan before
                the rush.
              </p>
            </article>
          </div>
        </div>
        <aside className="insights-side-column">
          <article className="card insight-confidence-card">
            <div className="confidence-heading">
              <span className="confidence-icon">
                <Icon name="spark" size={17} />
              </span>
              <strong>How to read this</strong>
            </div>
            <div className="confidence-meter">
              <div className="confidence-meter-top">
                <span>Context confidence</span>
                <strong>{Math.round(recommendation.confidence * 100)}%</strong>
              </div>
              <i>
                <b style={{ width: `${Math.round(recommendation.confidence * 100)}%` }} />
              </i>
            </div>
            <p>
              Confidence reflects how much of the relevant service context was available. It is not
              a guarantee; use your team’s judgement.
            </p>
            <div className="confidence-divider" />
            <div className="confidence-source">
              <span className={`source-dot source-${recommendation.source}`} />
              <div>
                <strong>
                  {recommendation.source === "gemini"
                    ? "Generated with Gemini"
                    : recommendation.source === "fallback"
                      ? "Safe rule-based fallback"
                      : "Sample preview guidance"}
                </strong>
                <span>
                  No customer identity or contact details are used in this recommendation.
                </span>
              </div>
            </div>
          </article>
          <article className="card principle-card">
            <span className="principle-leaf">
              <Icon name="leaf" size={18} />
            </span>
            <div className="card-overline">OUR APPROACH</div>
            <h3>Helpful, never hands-off.</h3>
            <p>DineSmart Assist gives your team a starting point. People make every final call.</p>
            <div className="principle-note">
              <Icon name="check" size={14} /> No automatic menu or stock changes
            </div>
          </article>
        </aside>
      </div>
    </>
  );
}

function formatAnalyticsDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00.000Z`));
}

function formatAnalyticsHour(hour: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: true,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 0, 1, hour)));
}

function AnalyticsPage() {
  const { accessToken, user } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [state, setState] = useState<"loading" | "live" | "unavailable" | "restricted">("loading");
  const [error, setError] = useState("");
  const [range, setRange] = useState<AnalyticsRange>("7d");
  const [refreshKey, setRefreshKey] = useState(0);
  const canReadAnalytics = canViewAnalytics(user?.role);

  useEffect(() => {
    if (!accessToken || !canReadAnalytics) {
      setData(null);
      setState("restricted");
      setError("");
      return;
    }

    const controller = new AbortController();
    setData(null);
    setError("");
    setState("loading");
    void fetch(`${API_BASE}/analytics?range=${range}`, {
      cache: refreshKey > 0 ? "reload" : "no-store",
      credentials: "include",
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            response.status === 403
              ? "Only Managers and Administrators can view analytics."
              : "Live analytics are temporarily unavailable.",
          );
        }
        const payload: unknown = await response.json();
        const parsed = parseAnalyticsData(payload);
        if (!parsed) throw new Error("The analytics response was invalid.");
        if (controller.signal.aborted) return;
        setData(parsed);
        setState("live");
      })
      .catch((requestError: unknown) => {
        if (
          controller.signal.aborted ||
          (requestError instanceof Error && requestError.name === "AbortError")
        )
          return;
        setData(null);
        setState("unavailable");
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Live analytics are temporarily unavailable.",
        );
      });

    return () => controller.abort();
  }, [accessToken, canReadAnalytics, range, refreshKey]);

  if (state === "restricted") {
    return (
      <article className="card analytics-state-card" role="status">
        <span className="analytics-state-icon">
          <Icon name="analytics" size={20} />
        </span>
        <div>
          <strong>Sign in with an analytics-enabled role.</strong>
          <p>Live operational reports are available to restaurant Managers and Administrators.</p>
        </div>
        {!accessToken ? (
          <Link className="button button-dark" href="/login">
            Sign in
          </Link>
        ) : null}
      </article>
    );
  }

  if (state === "loading" || state === "unavailable" || !data) {
    return (
      <article
        className="card analytics-state-card"
        role={state === "loading" ? "status" : "alert"}
      >
        <span
          className={`analytics-state-icon ${state === "unavailable" ? "analytics-state-icon-error" : ""}`}
        >
          {state === "loading" ? (
            <Icon name="analytics" size={20} />
          ) : (
            <Icon name="alert" size={20} />
          )}
        </span>
        <div>
          <strong>
            {state === "loading" ? "Loading live analytics…" : "Analytics could not be loaded."}
          </strong>
          <p>{state === "loading" ? "Fetching tenant-scoped operational data." : error}</p>
        </div>
        {state === "unavailable" ? (
          <button
            className="button button-soft"
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
          >
            <Icon name="refresh" size={14} /> Retry
          </button>
        ) : null}
      </article>
    );
  }

  const { summary } = data;
  const maximumDailyOrders = Math.max(1, ...data.daily.map((point) => point.ordersPlaced));
  const totalOrders = summary.ordersPlaced;
  const fulfilledPercent = totalOrders ? (summary.ordersFulfilled / totalOrders) * 100 : 0;
  const cancelledPercent = totalOrders ? (summary.ordersCancelled / totalOrders) * 100 : 0;
  const fulfilledEnd = fulfilledPercent;
  const cancelledEnd = fulfilledPercent + cancelledPercent;
  const outcomeDonutBackground = totalOrders
    ? `conic-gradient(#809875 0 ${fulfilledEnd}%, #d7a272 ${fulfilledEnd}% ${cancelledEnd}%, #dfe7db ${cancelledEnd}% 100%)`
    : "#edf0eb";
  const maximumHourOrders = Math.max(1, ...data.hourly.map((point) => point.ordersPlaced));
  const busiestHour = data.hourly.reduce(
    (best, point) => (point.ordersPlaced > best.ordersPlaced ? point : best),
    data.hourly[0],
  );
  return (
    <div className="analytics-page">
      <section className="card analytics-toolbar">
        <div>
          <div className="card-overline">OPERATIONS REPORT · LIVE DATA</div>
          <h2>Patterns in service</h2>
          <p>Order and reservation activity · all times in {data.period.timeZone}</p>
        </div>
        <div className="analytics-toolbar-controls">
          <label>
            <span>Reporting window</span>
            <select
              value={range}
              onChange={(event) => setRange(event.target.value as AnalyticsRange)}
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </label>
          <button
            className="button button-soft"
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
          >
            <Icon name="refresh" size={14} /> Refresh
          </button>
        </div>
      </section>

      <section className="analytics-summary-grid" aria-label="Operational analytics summary">
        <article className="analytics-kpi card">
          <span>Orders placed</span>
          <strong>{summary.ordersPlaced.toLocaleString()}</strong>
          <small>Selected window</small>
        </article>
        <article className="analytics-kpi card">
          <span>Served or completed</span>
          <strong>{summary.ordersFulfilled.toLocaleString()}</strong>
          <small>{summary.ordersCancelled.toLocaleString()} cancelled</small>
        </article>
        <article className="analytics-kpi card">
          <span>Average prep time</span>
          <strong>
            {summary.averagePrepMinutes === null ? "—" : `${summary.averagePrepMinutes} min`}
          </strong>
          <small>
            {summary.averagePrepObservations
              ? `Based on ${summary.averagePrepObservations.toLocaleString()} timed orders`
              : "No completed prep timings"}
          </small>
        </article>
        <article className="analytics-kpi card">
          <span>Reservations scheduled</span>
          <strong>{summary.reservationsScheduled.toLocaleString()}</strong>
          <small>Selected window</small>
        </article>
      </section>

      <div className="analytics-grid">
        <article className="card analytics-chart-card">
          <div className="card-heading-row">
            <div>
              <div className="card-overline">
                {data.range === "7d" ? "LAST 7 DAYS" : "LAST 30 DAYS"}
              </div>
              <h2>Orders placed by day</h2>
            </div>
            <span className="chart-legend">
              <i /> Orders
            </span>
          </div>
          <div className="analytics-bars-viewport">
            <div
              className={`analytics-bars ${data.range === "30d" ? "analytics-bars-month" : ""}`}
              role="img"
              aria-label={`${totalOrders} orders placed over the selected ${data.range === "7d" ? "seven-day" : "thirty-day"} window`}
            >
              {data.daily.map((point) => {
                const height = point.ordersPlaced
                  ? Math.max(7, (point.ordersPlaced / maximumDailyOrders) * 100)
                  : 2;
                return (
                  <div className="analytics-bar-wrap" key={point.date}>
                    <span className="analytics-bar-value">{point.ordersPlaced || ""}</span>
                    <div
                      className={`analytics-bar ${point.ordersPlaced === maximumDailyOrders && point.ordersPlaced > 0 ? "analytics-bar-active" : ""}`}
                      style={{ height: `${height}%` }}
                    />
                    <span className="analytics-day">{formatAnalyticsDate(point.date)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </article>

        <article className="card analytics-mix-card">
          <div className="card-overline">ORDER OUTCOMES</div>
          <h2>How orders are progressing</h2>
          <div
            className="mix-donut"
            style={{ background: outcomeDonutBackground }}
            role="img"
            aria-label={`${summary.ordersFulfilled} fulfilled, ${summary.ordersCancelled} cancelled, ${summary.ordersInProgress} in progress`}
          >
            <div>
              <strong>{summary.ordersPlaced.toLocaleString()}</strong>
              <span>orders</span>
            </div>
          </div>
          <div className="mix-legend analytics-outcome-legend">
            <div>
              <i className="mix-dinein" />
              <span>Fulfilled</span>
              <strong>{summary.ordersFulfilled}</strong>
            </div>
            <div>
              <i className="mix-takeaway" />
              <span>Cancelled</span>
              <strong>{summary.ordersCancelled}</strong>
            </div>
            <div>
              <i className="mix-delivery" />
              <span>In progress</span>
              <strong>{summary.ordersInProgress}</strong>
            </div>
          </div>
        </article>
      </div>

      <div className="analytics-grid analytics-support-grid">
        <article className="card analytics-chart-card analytics-hour-card">
          <div className="card-heading-row">
            <div>
              <div className="card-overline">LOCAL RESTAURANT TIME</div>
              <h2>Order activity by hour</h2>
            </div>
            <span className="analytics-peak-note">
              {busiestHour.ordersPlaced
                ? `Peak · ${formatAnalyticsHour(busiestHour.hour)}`
                : "No orders in range"}
            </span>
          </div>
          <div
            className="analytics-hour-bars"
            role="img"
            aria-label={`Hourly order counts in ${data.period.timeZone}`}
          >
            {data.hourly.map((point) => {
              const height = point.ordersPlaced
                ? Math.max(6, (point.ordersPlaced / maximumHourOrders) * 100)
                : 2;
              return (
                <div
                  className="analytics-hour-wrap"
                  key={point.hour}
                  title={`${formatAnalyticsHour(point.hour)} · ${point.ordersPlaced} orders`}
                >
                  <div
                    className={`analytics-hour-bar ${point.hour === busiestHour.hour && point.ordersPlaced > 0 ? "analytics-bar-active" : ""}`}
                    style={{ height: `${height}%` }}
                  />
                  {point.hour % 3 === 0 ? <span>{formatAnalyticsHour(point.hour)}</span> : null}
                </div>
              );
            })}
          </div>
        </article>

        <article className="card analytics-operations-card">
          <div className="card-overline">SERVICE & STOCK</div>
          <h2>Operational snapshot</h2>
          <div className="analytics-operational-rows">
            <div>
              <span>Reservations confirmed</span>
              <strong>{summary.reservationsConfirmed}</strong>
            </div>
            <div>
              <span>Guests seated</span>
              <strong>{summary.reservationsSeated}</strong>
            </div>
            <div>
              <span>Reservations completed</span>
              <strong>{summary.reservationsCompleted}</strong>
            </div>
            <div>
              <span>No-shows</span>
              <strong>{summary.reservationsNoShow}</strong>
            </div>
            <div>
              <span>Low-stock items now</span>
              <strong>{summary.lowStockItems}</strong>
            </div>
            <div>
              <span>Out of stock now</span>
              <strong>{summary.outOfStockItems}</strong>
            </div>
          </div>
        </article>
      </div>

      {data.sampling.truncatedCollections.length ? (
        <p className="health-data-note">
          Partial sample: {data.sampling.truncatedCollections.join(", ")} reached the{" "}
          {data.sampling.perCollectionLimit.toLocaleString()}-record cap.
        </p>
      ) : null}
      <p className="analytics-footnote">
        Generated{" "}
        {new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: data.period.timeZone,
        }).format(new Date(data.generatedAt))}
        . Order totals are not shown as revenue; billing/payment data is not part of this report.
      </p>
    </div>
  );
}

function SettingsPage({
  userName,
  role,
  onToast,
}: {
  userName: string;
  role: string;
  onToast: (message: string) => void;
}) {
  const [apiState, setApiState] = useState<"idle" | "checking" | "online" | "offline">("idle");
  const checkConnection = async () => {
    setApiState("checking");
    try {
      const response = await fetch("/health", { cache: "no-store" });
      setApiState(response.ok ? "online" : "offline");
      onToast(
        response.ok ? "DineSmart API is reachable." : "The API did not return a healthy response.",
      );
    } catch {
      setApiState("offline");
      onToast("The API is not reachable from this preview yet.");
    }
  };
  return (
    <>
      <section className="settings-grid">
        <article className="card settings-card">
          <div className="settings-card-head">
            <span className="settings-card-icon">
              <Icon name="user" size={18} />
            </span>
            <span className="settings-state settings-state-ready">
              <i /> ACTIVE SESSION
            </span>
          </div>
          <div className="card-overline">ACCOUNT</div>
          <h2>{userName}</h2>
          <p>Your access is scoped to the role assigned to this account.</p>
          <div className="settings-detail-row">
            <span>Role</span>
            <strong>{role}</strong>
          </div>
          <div className="settings-detail-row">
            <span>Session handling</span>
            <strong>Memory token + secure cookie</strong>
          </div>
        </article>
        <article className="card settings-card">
          <div className="settings-card-head">
            <span className="settings-card-icon settings-card-icon-green">
              <Icon name="leaf" size={18} />
            </span>
            <span
              className={`settings-state ${apiState === "online" ? "settings-state-ready" : apiState === "offline" ? "settings-state-offline" : "settings-state-preview"}`}
            >
              <i />
              {apiState === "online" ? "CONNECTED" : apiState === "offline" ? "OFFLINE" : "PREVIEW"}
            </span>
          </div>
          <div className="card-overline">SERVICE CONNECTION</div>
          <h2>Restaurant API</h2>
          <p>
            Requests use the same-origin <code>/api/v1</code> route and are proxied server-side.
          </p>
          <div className="settings-detail-row">
            <span>Health check</span>
            <strong>
              {apiState === "checking"
                ? "Checking…"
                : apiState === "online"
                  ? "Reachable"
                  : apiState === "offline"
                    ? "Not reachable"
                    : "Not checked"}
            </strong>
          </div>
          <button
            className="button button-outline settings-check-button"
            type="button"
            onClick={() => void checkConnection()}
            disabled={apiState === "checking"}
          >
            <Icon name="refresh" size={15} />
            Check connection
          </button>
        </article>
        <article className="card settings-card">
          <div className="settings-card-head">
            <span className="settings-card-icon settings-card-icon-gold">
              <Icon name="spark" size={18} />
            </span>
            <span className="settings-state settings-state-preview">
              <i /> ADVISORY ONLY
            </span>
          </div>
          <div className="card-overline">AI ASSIST</div>
          <h2>Recommendations</h2>
          <p>
            Structured suggestions are validated before they appear. Fallback guidance remains
            available if the provider is unavailable.
          </p>
          <div className="settings-detail-row">
            <span>Provider key</span>
            <strong>Server-side only</strong>
          </div>
          <div className="settings-detail-row">
            <span>Operational changes</span>
            <strong>Always human-approved</strong>
          </div>
        </article>
        <article className="card settings-card">
          <div className="settings-card-head">
            <span className="settings-card-icon settings-card-icon-blue">
              <Icon name="receipt" size={18} />
            </span>
            <span className="settings-state settings-state-preview">
              <i /> WORKSPACE
            </span>
          </div>
          <div className="card-overline">RESTAURANT PROFILE</div>
          <h2>Saffron &amp; Co.</h2>
          <p>Adyar, Chennai · South Indian · Dinner service</p>
          <div className="settings-detail-row">
            <span>Time zone</span>
            <strong>Asia/Kolkata · IST</strong>
          </div>
          <div className="settings-detail-row">
            <span>Currency</span>
            <strong>Indian rupee · ₹</strong>
          </div>
        </article>
      </section>
      <div className="settings-help">
        <span>
          <Icon name="spark" size={18} />
        </span>
        <div>
          <strong>Building a more connected service.</strong>
          <p>
            Live integrations, restaurant setup, and team provisioning will be available when the
            workspace is configured.
          </p>
        </div>
        <button
          className="text-link"
          type="button"
          onClick={() => onToast("Setup guidance is coming with the live workspace.")}
        >
          Learn more <Icon name="arrow-right" size={14} />
        </button>
      </div>
    </>
  );
}

function formatCustomerOrderDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

interface CustomerOrderSummary {
  id: string;
  restaurantName: string;
  status: "Created" | "Accepted" | "Preparing" | "Ready" | "Served" | "Completed" | "Cancelled";
  createdAt: string;
  items: Array<{ name: string; quantity: number }>;
}

interface ParsedCustomerOrderHistory {
  orders: CustomerOrderSummary[];
  truncated: boolean;
}

function parseCustomerOrderHistory(value: unknown): ParsedCustomerOrderHistory | null {
  if (
    !isObjectRecord(value) ||
    !Array.isArray(value.orders) ||
    typeof value.truncated !== "boolean"
  )
    return null;
  const allowedStatuses = new Set([
    "Created",
    "Accepted",
    "Preparing",
    "Ready",
    "Served",
    "Completed",
    "Cancelled",
  ]);
  const orders: CustomerOrderSummary[] = [];
  for (const order of value.orders) {
    if (
      !isObjectRecord(order) ||
      typeof order.id !== "string" ||
      !/^[a-f\d]{24}$/i.test(order.id) ||
      typeof order.restaurantName !== "string" ||
      typeof order.status !== "string" ||
      !allowedStatuses.has(order.status) ||
      typeof order.createdAt !== "string" ||
      !Number.isFinite(Date.parse(order.createdAt)) ||
      !Array.isArray(order.items)
    ) {
      return null;
    }
    const items: Array<{ name: string; quantity: number }> = [];
    for (const item of order.items) {
      if (
        !isObjectRecord(item) ||
        typeof item.name !== "string" ||
        typeof item.quantity !== "number" ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1
      ) {
        return null;
      }
      items.push({ name: item.name, quantity: item.quantity });
    }
    orders.push({
      id: order.id,
      restaurantName: order.restaurantName,
      status: order.status as CustomerOrderSummary["status"],
      createdAt: order.createdAt,
      items,
    });
  }
  return { orders, truncated: value.truncated };
}

function CustomerPortal({
  userName,
  accessToken,
  onSignOut,
}: {
  userName: string;
  accessToken: string | null;
  onSignOut: () => Promise<void>;
}) {
  const [customerOrders, setCustomerOrders] = useState<CustomerOrderSummary[]>([]);
  const [orderHistoryTruncated, setOrderHistoryTruncated] = useState(false);
  const [orderHistoryState, setOrderHistoryState] = useState<"loading" | "live" | "unavailable">(
    "loading",
  );
  const [orderHistoryError, setOrderHistoryError] = useState("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationState, setReservationState] = useState<"loading" | "live" | "unavailable">(
    "loading",
  );
  const [reservationError, setReservationError] = useState("");
  const [savingReservationId, setSavingReservationId] = useState("");
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const refreshClock = () => setNowMs(Date.now());
    refreshClock();
    const timer = window.setInterval(refreshClock, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setCustomerOrders([]);
      setOrderHistoryTruncated(false);
      setOrderHistoryError("Sign in again to view your saved orders.");
      setOrderHistoryState("unavailable");
      return;
    }
    const controller = new AbortController();
    setCustomerOrders([]);
    setOrderHistoryTruncated(false);
    setOrderHistoryError("");
    setOrderHistoryState("loading");
    void fetch(`${API_BASE}/orders/history`, {
      cache: "no-store",
      credentials: "include",
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Your saved orders are unavailable.");
        const payload: unknown = await response.json();
        const parsed = parseCustomerOrderHistory(payload);
        if (!parsed) throw new Error("The order history response was invalid.");
        if (controller.signal.aborted) return;
        setCustomerOrders(parsed.orders);
        setOrderHistoryTruncated(parsed.truncated);
        setOrderHistoryState("live");
      })
      .catch((requestError: unknown) => {
        if (
          controller.signal.aborted ||
          (requestError instanceof Error && requestError.name === "AbortError")
        )
          return;
        setCustomerOrders([]);
        setOrderHistoryTruncated(false);
        setOrderHistoryError(
          requestError instanceof Error
            ? requestError.message
            : "Your saved orders are unavailable.",
        );
        setOrderHistoryState("unavailable");
      });
    return () => controller.abort();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setReservations([]);
      setReservationState("unavailable");
      return;
    }
    const controller = new AbortController();
    setReservations([]);
    setReservationState("loading");
    void fetch(`${API_BASE}/reservations`, {
      cache: "no-store",
      credentials: "include",
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Your reservations are unavailable.");
        const payload: unknown = await response.json();
        const parsed = parseReservationsResponse(payload);
        if (!parsed) throw new Error("The reservation response was invalid.");
        if (controller.signal.aborted) return;
        setReservations(parsed.reservations);
        setReservationState("live");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setReservations([]);
        setReservationState("unavailable");
      });
    return () => controller.abort();
  }, [accessToken]);

  const nextReservation = reservations
    .filter(
      (reservation) =>
        reservation.startAt &&
        nowMs !== null &&
        Date.parse(reservation.startAt) > nowMs &&
        reservation.status !== "Cancelled" &&
        reservation.status !== "Completed" &&
        reservation.status !== "NoShow",
    )
    .sort((first, second) => Date.parse(first.startAt ?? "") - Date.parse(second.startAt ?? ""))[0];

  const cancelReservation = async (reservationId: string) => {
    if (!accessToken) return;
    setReservationError("");
    setSavingReservationId(reservationId);
    try {
      const response = await fetch(`${API_BASE}/reservations/${reservationId}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "Cancelled" }),
      });
      if (!response.ok)
        throw new Error("We couldn't cancel this reservation. Please refresh and try again.");
      const updated = parseReservationResponse(await response.json());
      if (!updated) throw new Error("The reservation response was invalid.");
      setReservations((current) =>
        current.map((reservation) => (reservation.id === reservationId ? updated : reservation)),
      );
    } catch (error) {
      setReservationError(
        error instanceof Error ? error.message : "Your reservation could not be cancelled.",
      );
    } finally {
      setSavingReservationId("");
    }
  };

  const nextVisitDetails = nextReservation?.startAt
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(nextReservation.startAt))
    : "";
  const canCancel =
    nextReservation &&
    (nextReservation.status === "Awaiting" || nextReservation.status === "Confirmed");
  const latestOrder = customerOrders[0];
  const latestOrderStatus =
    latestOrder?.status === "Created" ? "Sent to restaurant" : latestOrder?.status;
  const latestOrderItems = latestOrder?.items.length
    ? `${latestOrder.items
        .slice(0, 2)
        .map((item) => `${item.name} × ${item.quantity}`)
        .join(", ")}${latestOrder.items.length > 2 ? ` +${latestOrder.items.length - 2} more` : ""}`
    : "Order item details are unavailable.";
  const latestOrderDate = latestOrder ? formatCustomerOrderDate(latestOrder.createdAt) : "";

  return (
    <main className="customer-portal" id="main-content">
      <header className="customer-topbar">
        <Link className="customer-brand" href="/">
          <BrandMark />
          <span>DineSmart</span>
        </Link>
        <div className="customer-account-actions">
          <div className="customer-account">
            <span className="profile-avatar">
              {userName
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </span>
            <span>
              <strong>{userName}</strong>
              <small>Customer account</small>
            </span>
          </div>
          <button className="customer-signout" type="button" onClick={() => void onSignOut()}>
            Sign out
          </button>
        </div>
      </header>
      <section className="customer-hero">
        <div className="customer-hero-copy">
          <div className="eyebrow">SAFFRON &amp; CO. · ADYAR</div>
          <h1>
            Good food.
            <br />
            <em>Good company.</em>
          </h1>
          <p>Welcome back, {userName.split(" ")[0]}. Make tonight a little more delicious.</p>
          <div className="customer-hero-actions">
            <Link className="button button-dark" href="/menu">
              Explore the menu <Icon name="arrow-right" size={16} />
            </Link>
            <Link className="button button-outline" href="/book">
              <Icon name="calendar" size={16} />
              Book a table
            </Link>
          </div>
        </div>
        <div className="customer-hero-art" aria-hidden="true">
          <div className="customer-sun" />
          <div className="customer-plate">
            <div className="customer-food customer-food-one" />
            <div className="customer-food customer-food-two" />
            <div className="customer-food customer-food-three" />
            <div className="customer-herb">✦</div>
          </div>
          <span className="customer-art-caption">
            A taste of home,
            <br />
            with a little more.
          </span>
        </div>
      </section>
      <section className="customer-quick-grid">
        <article>
          <span className="customer-quick-icon">
            <Icon name="receipt" size={19} />
          </span>
          <div>
            <span>YOUR ORDERS</span>
            <strong>
              {orderHistoryState === "loading"
                ? "Loading your saved orders…"
                : orderHistoryState === "unavailable"
                  ? "Order history unavailable"
                  : latestOrder
                    ? `${latestOrderStatus} · ${latestOrder.restaurantName}`
                    : "No saved orders yet."}
            </strong>
            <p>
              {orderHistoryState === "loading"
                ? "Checking your customer account."
                : orderHistoryState === "unavailable"
                  ? orderHistoryError || "No sample orders are shown; try your order history again."
                  : latestOrder
                    ? `${latestOrderItems} · ${latestOrderDate}`
                    : "Your restaurant orders will appear here after the API confirms them."}
            </p>
            {orderHistoryTruncated && orderHistoryState === "live" ? (
              <small className="customer-order-truncated">Showing the latest saved orders.</small>
            ) : null}
          </div>
          <Link href="/orders" aria-label="View your order history">
            <Icon name="arrow-right" size={17} />
          </Link>
        </article>
        <article>
          <span className="customer-quick-icon customer-quick-icon-coral">
            <Icon name="calendar" size={19} />
          </span>
          <div>
            <span>YOUR NEXT VISIT</span>
            <strong>
              {reservationState === "loading"
                ? "Checking your reservations…"
                : nextReservation
                  ? `${nextReservation.status} · ${nextVisitDetails}`
                  : reservationState === "unavailable"
                    ? "Reservation status unavailable"
                    : "No upcoming reservation yet."}
            </strong>
            <p>
              {nextReservation
                ? `${nextReservation.restaurantName ?? "Restaurant"} · ${nextReservation.party} ${nextReservation.party === 1 ? "guest" : "guests"} · ${nextReservation.table}`
                : reservationState === "unavailable"
                  ? "Your request was not changed; try again when the service is available."
                  : "Reserve a table at Saffron & Co."}
            </p>
            {canCancel ? (
              <button
                className="customer-reservation-cancel"
                disabled={savingReservationId === nextReservation.id}
                type="button"
                onClick={() => void cancelReservation(nextReservation.id)}
              >
                {savingReservationId === nextReservation.id ? "Cancelling…" : "Cancel reservation"}
              </button>
            ) : null}
            {reservationError ? (
              <p className="customer-reservation-error" role="alert">
                {reservationError}
              </p>
            ) : null}
          </div>
          <Link href="/book" aria-label="Book a table">
            <Icon name="arrow-right" size={17} />
          </Link>
        </article>
      </section>
      <footer className="customer-footer">
        <span>Made for meals worth remembering.</span>
        <span>© 2026 DineSmart</span>
      </footer>
    </main>
  );
}
