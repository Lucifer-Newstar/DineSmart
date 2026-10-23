"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchWithTimeout } from "../api-client";
import { BrandMark } from "../brand-mark";
import { API_BASE } from "./demo-data";
import { isObjectRecord, parseReservationResponse, parseReservationsResponse } from "./parsers";
import type { Reservation } from "./types";
import { Icon } from "./ui";

export function formatCustomerOrderDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export interface CustomerOrderSummary {
  id: string;
  restaurantName: string;
  status: "Created" | "Accepted" | "Preparing" | "Ready" | "Served" | "Completed" | "Cancelled";
  createdAt: string;
  items: Array<{ name: string; quantity: number }>;
}

export interface ParsedCustomerOrderHistory {
  orders: CustomerOrderSummary[];
  truncated: boolean;
}

export function parseCustomerOrderHistory(value: unknown): ParsedCustomerOrderHistory | null {
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

export function CustomerPortal({
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
    void fetchWithTimeout(`${API_BASE}/orders/history`, {
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
    void fetchWithTimeout(`${API_BASE}/reservations`, {
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
      const response = await fetchWithTimeout(`${API_BASE}/reservations/${reservationId}`, {
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
