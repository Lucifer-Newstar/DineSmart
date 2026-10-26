"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "../../api-client";
import { useAuth } from "../../auth-provider";
import { BrandMark } from "../../brand-mark";
import { formatMinorCurrency } from "../../currency";
import { connectRealtime, resolveRealtimeBase } from "../../realtime-client";
import {
  etaLine,
  liveEta,
  orderStatusFromEvent,
  parseTrackingResponse,
  stepState,
  TRACK_STEPS,
  type TrackedEta,
  type TrackedOrder,
} from "../order-tracking";

const API_BASE = "/api/v1";
const POLL_MS = 30_000;
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

/** S5-03: live order tracking. Status changes arrive over the socket; a slow poll covers gaps. */
export function OrderTrackingView() {
  const params = useParams<{ id: string }>();
  const orderId =
    typeof params?.id === "string" && OBJECT_ID_PATTERN.test(params.id) ? params.id : "";
  const { user, accessToken, isLoading: authLoading } = useAuth();
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [eta, setEta] = useState<TrackedEta | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [live, setLive] = useState(false);
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  const load = useCallback(async () => {
    const token = tokenRef.current;
    if (!token || !orderId) return;
    try {
      const response = await fetchWithTimeout(`${API_BASE}/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (response.status === 404) {
        setState("missing");
        return;
      }
      const parsed = response.ok ? parseTrackingResponse(await response.json()) : null;
      if (!parsed) throw new Error("unavailable");
      setOrder(parsed.order);
      setEta(parsed.eta);
      setState("ready");
    } catch {
      setState((current) => (current === "ready" ? current : "error"));
    }
  }, [orderId]);

  useEffect(() => {
    if (!accessToken || user?.role !== "Customer") return;
    void load();
  }, [accessToken, load, user?.role]);

  // Socket first; while it is down, poll every 30 seconds when the tab is visible.
  useEffect(() => {
    if (!accessToken || user?.role !== "Customer" || !orderId) return;
    let socketLive = false;
    const timer = window.setInterval(() => {
      if (!socketLive && document.visibilityState === "visible") void load();
    }, POLL_MS);
    const base = resolveRealtimeBase(process.env.NEXT_PUBLIC_REALTIME_URL, window.location);
    const disconnect =
      base && typeof WebSocket !== "undefined"
        ? connectRealtime({
            base,
            requestTicket: async () => {
              const token = tokenRef.current;
              if (!token) return null;
              const response = await fetchWithTimeout(`${API_BASE}/notifications/socket-ticket`, {
                method: "POST",
                credentials: "include",
                headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
                body: "{}",
              });
              return response.status === 201 ? await response.json() : null;
            },
            onOpen: () => void load(),
            onStatus: (status) => {
              socketLive = status === "live";
              setLive(socketLive);
            },
            onEvent: (envelope) => {
              const status = orderStatusFromEvent(envelope, orderId);
              if (!status) return;
              setOrder((current) => (current ? { ...current, status } : current));
              // The ETA and line states come with the full order.
              void load();
            },
          })
        : null;
    return () => {
      window.clearInterval(timer);
      disconnect?.();
    };
  }, [accessToken, load, orderId, user?.role]);

  // Recount the minutes left once a minute between server updates.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const message = order ? etaLine(order.status, now ? liveEta(eta, now) : eta) : null;

  return (
    <main className="orders-page" id="main-content">
      <header className="menu-header orders-header">
        <Link className="menu-brand" href="/">
          <BrandMark />
          <span>DineSmart</span>
        </Link>
        <div className="orders-header-actions">
          <Link className="menu-back-link" href="/orders">
            Your orders
          </Link>
          <Link className="menu-back-link" href="/menu">
            Menu
          </Link>
        </div>
      </header>
      <section className="orders-content tracking-content">
        <div className="orders-intro">
          <div>
            <div className="orders-eyebrow">LIVE ORDER</div>
            <h1>Track your order</h1>
            <p>
              {live
                ? "Updates appear here as the kitchen works."
                : "This page checks for updates every 30 seconds."}
            </p>
          </div>
        </div>
        {authLoading || (accessToken && state === "loading" && orderId) ? (
          <div className="orders-state" role="status">
            <span className="orders-state-mark">···</span>
            <h2>Loading your order</h2>
          </div>
        ) : !user || !accessToken ? (
          <div className="orders-state">
            <span className="orders-state-mark">✦</span>
            <h2>Sign in to track your order</h2>
            <Link
              className="orders-primary-button"
              href={`/login?next=${encodeURIComponent(`/orders/${orderId}`)}`}
            >
              Sign in securely
            </Link>
          </div>
        ) : !orderId || state === "missing" ? (
          <div className="orders-state">
            <span className="orders-state-mark">!</span>
            <h2>We couldn&apos;t find that order</h2>
            <Link className="orders-primary-button" href="/orders">
              See your orders
            </Link>
          </div>
        ) : state === "error" || !order ? (
          <div className="orders-state orders-state-error" role="alert">
            <span className="orders-state-mark">!</span>
            <h2>Order status is unavailable right now.</h2>
            <button className="orders-primary-button" type="button" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : (
          <article className="tracking-card" aria-labelledby="tracking-title">
            <div className="tracking-head">
              <h2 id="tracking-title">
                {order.restaurantName}
                {order.tableNumber ? ` · Table ${order.tableNumber}` : ""}
              </h2>
              <p className="tracking-eta" aria-live="polite" role="status">
                {message ?? `Status: ${order.status}`}
              </p>
            </div>
            {order.status === "Cancelled" ? null : (
              <ol className="tracking-steps" aria-label="Order progress">
                {TRACK_STEPS.map((step) => {
                  const stepStatus = stepState(order.status, step.status);
                  return (
                    <li
                      aria-current={stepStatus === "current" ? "step" : undefined}
                      className={`tracking-step tracking-step-${stepStatus}`}
                      key={step.status}
                    >
                      <span className="tracking-dot" aria-hidden="true" />
                      <span>
                        {step.label}
                        <span className="sr-only">
                          {stepStatus === "done"
                            ? " (done)"
                            : stepStatus === "current"
                              ? " (in progress)"
                              : ""}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            <ul className="tracking-items">
              {order.items.map((item) => (
                <li key={item.id}>
                  <span>
                    {item.quantity} × {item.name}
                    {item.options?.length
                      ? ` (${item.options.map((option) => option.choice).join(", ")})`
                      : ""}
                  </span>
                  {item.notes ? <small>Request: {item.notes}</small> : null}
                </li>
              ))}
            </ul>
            <p className="tracking-total">
              Total {formatMinorCurrency(order.totalMinor, order.currency)}
            </p>
          </article>
        )}
      </section>
    </main>
  );
}
