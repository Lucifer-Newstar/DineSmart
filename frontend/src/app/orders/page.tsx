"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchWithTimeout } from "../api-client";
import { useAuth } from "../auth-provider";
import { BrandMark } from "../brand-mark";
import { formatMinorCurrency } from "../currency";

const API_BASE = "/api/v1";
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  unitPriceMinor: number;
  quantity: number;
  /** "Large · Roasted papad" for dishes ordered with options. */
  options: string;
}

interface CustomerOrder {
  id: string;
  restaurantId: string;
  restaurantName: string;
  status: string;
  totalMinor: number;
  currency: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

interface OrderHistoryResponse {
  orders: CustomerOrder[];
  truncated: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOrder(value: unknown): CustomerOrder | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !OBJECT_ID_PATTERN.test(value.id) ||
    typeof value.restaurantId !== "string" ||
    !OBJECT_ID_PATTERN.test(value.restaurantId) ||
    typeof value.restaurantName !== "string" ||
    typeof value.status !== "string" ||
    typeof value.totalMinor !== "number" ||
    !Number.isSafeInteger(value.totalMinor) ||
    value.totalMinor < 0 ||
    typeof value.currency !== "string" ||
    !/^[A-Z]{3}$/.test(value.currency) ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    typeof value.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.updatedAt)) ||
    !Array.isArray(value.items)
  ) {
    return null;
  }

  const items: OrderItem[] = [];
  for (const entry of value.items) {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      !OBJECT_ID_PATTERN.test(entry.id) ||
      typeof entry.menuItemId !== "string" ||
      !OBJECT_ID_PATTERN.test(entry.menuItemId) ||
      typeof entry.name !== "string" ||
      typeof entry.unitPriceMinor !== "number" ||
      !Number.isSafeInteger(entry.unitPriceMinor) ||
      entry.unitPriceMinor < 0 ||
      typeof entry.quantity !== "number" ||
      !Number.isInteger(entry.quantity) ||
      entry.quantity < 1
    ) {
      return null;
    }
    items.push({
      id: entry.id,
      menuItemId: entry.menuItemId,
      name: entry.name,
      unitPriceMinor: entry.unitPriceMinor,
      quantity: entry.quantity,
      options: Array.isArray(entry.options)
        ? entry.options
            .map((option) =>
              isRecord(option) && typeof option.choice === "string" ? option.choice : "",
            )
            .filter(Boolean)
            .join(" · ")
        : "",
    });
  }

  return {
    id: value.id,
    restaurantId: value.restaurantId,
    restaurantName: value.restaurantName,
    status: value.status,
    totalMinor: value.totalMinor,
    currency: value.currency,
    items,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function parseHistory(value: unknown): OrderHistoryResponse | null {
  if (!isRecord(value) || !Array.isArray(value.orders) || typeof value.truncated !== "boolean") {
    return null;
  }
  const orders = value.orders.map(parseOrder);
  if (orders.some((order) => order === null)) return null;
  return { orders: orders as CustomerOrder[], truncated: value.truncated };
}

async function responseError(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
      return payload.error.message;
    }
  } catch {
    // Fall back to a stable message for non-JSON proxy/service errors.
  }
  return "We couldn't complete that request. Please try again.";
}

function currency(amountMinor: number, currencyCode: string): string {
  return formatMinorCurrency(amountMinor, currencyCode);
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function statusLabel(status: string): string {
  return status === "Created" ? "Sent to restaurant" : status;
}

export default function OrdersPage() {
  const { user, accessToken, isLoading: authLoading } = useAuth();
  const [history, setHistory] = useState<OrderHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [cancelingOrderId, setCancelingOrderId] = useState("");
  const [reload, setReload] = useState(0);

  const loadHistory = useCallback(
    async (signal: AbortSignal, refreshKey: number) => {
      if (!accessToken || user?.role !== "Customer") return;
      setLoading(true);
      setError("");
      try {
        const response = await fetchWithTimeout(
          `${API_BASE}/orders/history?refresh=${refreshKey}`,
          {
            headers: { authorization: `Bearer ${accessToken}` },
            credentials: "include",
            signal,
          },
        );
        if (!response.ok) throw new Error(await responseError(response));
        const parsed = parseHistory(await response.json());
        if (!parsed) throw new Error("The order history response was invalid.");
        setHistory(parsed);
      } catch (requestError) {
        if (signal.aborted) return;
        setHistory(null);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Order history is temporarily unavailable.",
        );
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [accessToken, user?.role],
  );

  useEffect(() => {
    if (authLoading) return;
    if (user?.role !== "Customer" || !accessToken) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    void loadHistory(controller.signal, reload);
    return () => controller.abort();
  }, [accessToken, authLoading, loadHistory, reload, user?.role]);

  const cancelOrder = async (orderId: string) => {
    if (!accessToken || user?.role !== "Customer") return;
    setCancelError("");
    setCancelingOrderId(orderId);
    try {
      const response = await fetchWithTimeout(`${API_BASE}/orders/${orderId}/cancel`, {
        method: "PUT",
        credentials: "include",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const payload: unknown = await response.json();
      const updated = isRecord(payload) ? parseOrder(payload.order) : null;
      if (!updated) throw new Error("The cancellation response was invalid.");
      setHistory((current) =>
        current
          ? {
              ...current,
              orders: current.orders.map((order) => (order.id === updated.id ? updated : order)),
            }
          : current,
      );
    } catch (requestError) {
      setCancelError(
        requestError instanceof Error
          ? requestError.message
          : "The order could not be cancelled. Refresh and try again.",
      );
    } finally {
      setCancelingOrderId("");
    }
  };

  return (
    <main className="orders-page" id="main-content">
      <header className="menu-header orders-header">
        <Link className="menu-brand" href="/">
          <BrandMark />
          <span>DineSmart</span>
        </Link>
        <div className="orders-header-actions">
          <Link className="menu-back-link" href="/menu">
            Browse menu
          </Link>
          <Link className="menu-back-link" href="/">
            Home
          </Link>
        </div>
      </header>

      <section className="orders-content">
        <div className="orders-intro">
          <div>
            <div className="orders-eyebrow">CUSTOMER ACCOUNT</div>
            <h1>Your orders, in one place.</h1>
            <p>
              Review your restaurant requests and cancel an order while it is still waiting for
              acceptance.
            </p>
          </div>
          <Link className="orders-browse-button" href="/menu">
            Browse the live menu <span aria-hidden="true">→</span>
          </Link>
        </div>

        {authLoading || loading ? (
          <div className="orders-state" role="status">
            <span className="orders-state-mark">···</span>
            <h2>Loading your order history</h2>
            <p>We’re checking the orders linked to your account.</p>
          </div>
        ) : !user || !accessToken ? (
          <div className="orders-state">
            <span className="orders-state-mark">✦</span>
            <h2>Sign in to see your orders</h2>
            <p>Order history is private to your Customer account.</p>
            <Link
              className="orders-primary-button"
              href={`/login?next=${encodeURIComponent("/orders")}`}
            >
              Sign in securely
            </Link>
            <Link
              className="orders-secondary-link"
              href={`/register?next=${encodeURIComponent("/orders")}`}
            >
              Create a Customer account
            </Link>
          </div>
        ) : user.role !== "Customer" ? (
          <div className="orders-state">
            <span className="orders-state-mark">!</span>
            <h2>Customer account required</h2>
            <p>Restaurant staff accounts cannot view customer order history.</p>
            <Link className="orders-primary-button" href="/">
              Return to workspace
            </Link>
          </div>
        ) : error ? (
          <div className="orders-state orders-state-error" role="alert">
            <span className="orders-state-mark">!</span>
            <h2>Your orders didn’t load</h2>
            <p>{error}</p>
            <button
              className="orders-primary-button"
              type="button"
              onClick={() => setReload((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : history?.orders.length ? (
          <>
            {history.truncated ? (
              <p className="orders-truncated" role="status">
                Showing your 100 most recent orders. Older orders are not displayed here.
              </p>
            ) : null}
            {cancelError ? (
              <p className="orders-inline-error" role="alert">
                {cancelError}
              </p>
            ) : null}
            <div className="orders-list">
              {history.orders.map((order) => (
                <article className="customer-order-card" key={order.id}>
                  <div className="customer-order-heading">
                    <div>
                      <span className="customer-order-kicker">{order.restaurantName}</span>
                      <h2>
                        Order <span>#{order.id.slice(-6).toUpperCase()}</span>
                      </h2>
                      <time dateTime={order.createdAt}>{dateTime(order.createdAt)}</time>
                    </div>
                    <span className={`order-status order-status-${order.status.toLowerCase()}`}>
                      {statusLabel(order.status)}
                    </span>
                  </div>
                  <div className="customer-order-lines">
                    {order.items.map((item) => (
                      <div className="customer-order-line" key={item.id}>
                        <div>
                          <strong>{item.name}</strong>
                          {item.options ? (
                            <span className="customer-order-detail">{item.options}</span>
                          ) : null}
                          <span className="customer-order-detail">
                            {item.quantity} × {currency(item.unitPriceMinor, order.currency)}
                          </span>
                        </div>
                        <strong>
                          {currency(item.unitPriceMinor * item.quantity, order.currency)}
                        </strong>
                      </div>
                    ))}
                  </div>
                  <div className="customer-order-total">
                    <span>Pre-bill subtotal</span>
                    <strong>{currency(order.totalMinor, order.currency)}</strong>
                  </div>
                  <div className="customer-order-footer">
                    <p>
                      {order.status === "Created"
                        ? "The restaurant has received your request; it has not yet been accepted."
                        : order.status === "Cancelled"
                          ? "This order was cancelled."
                          : `Latest status: ${order.status}.`}
                    </p>
                    {["Created", "Accepted", "Preparing", "Ready"].includes(order.status) ? (
                      <Link
                        aria-label={`Track order ${order.id.slice(-6).toUpperCase()}`}
                        className="orders-secondary-link"
                        href={`/orders/${order.id}`}
                      >
                        Track order
                      </Link>
                    ) : null}
                    {order.status === "Created" ? (
                      <button
                        className="orders-cancel-button"
                        type="button"
                        disabled={cancelingOrderId === order.id}
                        onClick={() => void cancelOrder(order.id)}
                      >
                        {cancelingOrderId === order.id ? "Cancelling…" : "Cancel order"}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="orders-state">
            <span className="orders-state-mark">✦</span>
            <h2>No orders yet</h2>
            <p>When you place an order from a live menu, it will appear here.</p>
            <Link className="orders-primary-button" href="/menu">
              Explore the menu
            </Link>
          </div>
        )}
        <div className="orders-privacy-note">
          Your history shows only orders linked to your account, across restaurants. Amounts are
          pre-bill subtotals; payment is not processed here.
        </div>
      </section>
    </main>
  );
}
