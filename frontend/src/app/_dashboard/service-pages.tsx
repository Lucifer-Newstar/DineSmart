"use client";

import { useMemo } from "react";
import { summarizeOrders } from "../dashboard-metrics";
import { displayOrderId } from "./parsers";
import type { KitchenTicket, Order, OrderFeedStatus } from "./types";
import { Icon } from "./ui";
import { OrdersTable } from "./widgets";

export function OrdersPage({
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
  const { visible, inProgress, newTickets, readyToServe, averageTicketMinutes } = useMemo(
    () => summarizeOrders(orders, search, statusFilter),
    [orders, search, statusFilter],
  );
  return (
    <>
      <section className="quick-stat-row">
        <div>
          <span>In progress</span>
          <strong>{inProgress}</strong>
          <i className="stat-dot stat-dot-gold" />
        </div>
        <div>
          <span>New tickets</span>
          <strong>{newTickets}</strong>
          <i className="stat-dot stat-dot-blue" />
        </div>
        <div>
          <span>Ready to serve</span>
          <strong>{readyToServe}</strong>
          <i className="stat-dot stat-dot-green" />
        </div>
        <div>
          <span>Avg. ticket time</span>
          <strong>{averageTicketMinutes === null ? "—" : `${averageTicketMinutes} min`}</strong>
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

export function KitchenPage({
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
                        {ticket.tableNumber ? (
                          <p className="kitchen-table-tag">Dine-in · Table {ticket.tableNumber}</p>
                        ) : (
                          <p className="kitchen-private-note">
                            Customer and table details are not included in this kitchen feed.
                          </p>
                        )}
                        <ul className="kitchen-item-list">
                          {ticket.items.map((item) => (
                            <li className="kitchen-item-row" key={item.id}>
                              <div className="kitchen-item-main">
                                <strong>
                                  {item.name} × {item.quantity}
                                </strong>
                                <span>{item.preparationStatus}</span>
                                {item.notes ? (
                                  <span className="kitchen-item-note">Request: {item.notes}</span>
                                ) : null}
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
