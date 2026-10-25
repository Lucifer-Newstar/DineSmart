"use client";
import type { ReactNode } from "react";
import type {
  IconName,
  InventoryViewStatus,
  OrderFeedStatus,
  ReservationViewStatus,
} from "./types";

export function Icon({
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
      focusable="false"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
    >
      {content}
    </svg>
  );
}

export function statusClass(status: string): string {
  return `status-pill status-${status.toLowerCase().replaceAll(" ", "-")}`;
}

export function StatusPill({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={tone ?? statusClass(String(children))}>{children}</span>;
}

export function MetricCard({
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

export function PageHeading({
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

export function DemoBanner({
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
