"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  type AnalyticsDailyPoint,
  type AnalyticsData,
  type AnalyticsHourlyPoint,
  type AnalyticsRange,
  parseAnalyticsData,
} from "../analytics-data";
import { fetchWithTimeout } from "../api-client";
import { useAuth } from "../auth-provider";
import { canViewAnalytics } from "../dashboard-access";
import { buildAnalyticsBars } from "../dashboard-metrics";
import { API_BASE } from "./demo-data";
import { Icon } from "./ui";

export function formatAnalyticsDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00.000Z`));
}

export function formatAnalyticsHour(hour: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: true,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 0, 1, hour)));
}

export function AnalyticsPage() {
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
    void fetchWithTimeout(`${API_BASE}/analytics?range=${range}`, {
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

  // Charts are derived before the state early-returns so hook order is stable.
  const dailyBars = useMemo(
    () =>
      buildAnalyticsBars<AnalyticsDailyPoint>(data?.daily ?? [], {
        value: (point) => point.ordersPlaced,
      }),
    [data],
  );
  const hourlyBars = useMemo(
    () =>
      buildAnalyticsBars<AnalyticsHourlyPoint>(data?.hourly ?? [], {
        value: (point) => point.ordersPlaced,
        minimumPercent: 6,
      }),
    [data],
  );

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
  const totalOrders = summary.ordersPlaced;
  const fulfilledPercent = totalOrders ? (summary.ordersFulfilled / totalOrders) * 100 : 0;
  const cancelledPercent = totalOrders ? (summary.ordersCancelled / totalOrders) * 100 : 0;
  const fulfilledEnd = fulfilledPercent;
  const cancelledEnd = fulfilledPercent + cancelledPercent;
  const outcomeDonutBackground = totalOrders
    ? `conic-gradient(#809875 0 ${fulfilledEnd}%, #d7a272 ${fulfilledEnd}% ${cancelledEnd}%, #dfe7db ${cancelledEnd}% 100%)`
    : "#edf0eb";
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
              {dailyBars.map(({ point, value, heightPercent, isPeak }) => (
                <div className="analytics-bar-wrap" key={point.date}>
                  <span className="analytics-bar-value">{value || ""}</span>
                  <div
                    className={`analytics-bar ${isPeak ? "analytics-bar-active" : ""}`}
                    style={{ height: `${heightPercent}%` }}
                  />
                  <span className="analytics-day">{formatAnalyticsDate(point.date)}</span>
                </div>
              ))}
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
            {hourlyBars.map(({ point, value, heightPercent }) => (
              <div
                className="analytics-hour-wrap"
                key={point.hour}
                title={`${formatAnalyticsHour(point.hour)} · ${value} orders`}
              >
                <div
                  className={`analytics-hour-bar ${point.hour === busiestHour.hour && value > 0 ? "analytics-bar-active" : ""}`}
                  style={{ height: `${heightPercent}%` }}
                />
                {point.hour % 3 === 0 ? <span>{formatAnalyticsHour(point.hour)}</span> : null}
              </div>
            ))}
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
