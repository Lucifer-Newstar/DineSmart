"use client";

import type { CSSProperties } from "react";
import type { AuthUser } from "../auth-provider";
import type { Recommendation } from "../recommendation-data";
import type {
  HealthScoreData,
  HealthScoreViewStatus,
  IncidentViewStatus,
  InventoryItem,
  InventoryViewStatus,
  Order,
  OrderFeedStatus,
  RecommendationViewStatus,
} from "./types";
import { Icon, MetricCard } from "./ui";
import { InventoryRows, OrdersTable, RevenueChart } from "./widgets";

export function HealthScoreCard({
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

export function OverviewPage({
  orders,
  orderFeedStatus,
  ordersTruncated,
  canUpdateOrders,
  inventory,
  inventoryStatus,
  inventoryTruncated,
  recommendation,
  recommendationStatus,
  openIncidentCount,
  incidentStatus,
  incidentTruncated,
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
  recommendationStatus: RecommendationViewStatus;
  openIncidentCount: number | null;
  incidentStatus: IncidentViewStatus;
  incidentTruncated: boolean;
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
                <span className="sample-period-label">Last 7 days · sample</span>
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
              <span className="open-incident-tag">
                {incidentStatus === "preview"
                  ? "Sample preview"
                  : incidentStatus === "loading"
                    ? "Checking incidents…"
                    : incidentStatus === "unavailable"
                      ? "Incident feed unavailable"
                      : incidentStatus === "restricted"
                        ? "Access restricted"
                        : openIncidentCount === 0
                          ? incidentTruncated
                            ? "Partial incident list"
                            : "No open incidents"
                          : `${openIncidentCount ?? 0}${incidentTruncated ? "+" : ""} to review`}
              </span>
            </div>
            <div className="insight-teaser-label">
              <span className={`priority-dot priority-dot-${recommendation.priority}`} />
              {recommendation.priority.toUpperCase()} PRIORITY ·{" "}
              {recommendationStatus === "live" && recommendation.source !== "demo"
                ? "LIVE ADVISORY"
                : recommendationStatus === "loading"
                  ? "LOADING"
                  : "SAMPLE PREVIEW"}
            </div>
            <h2>One thing to get ahead of.</h2>
            <p>{recommendation.summary}</p>
            <div className="insight-teaser-action">
              <span className="action-number">01</span>
              <span>{recommendation.actions[0]?.description ?? "No action is available."}</span>
            </div>
            <div className="insight-teaser-footer">
              <span className={`insight-source-dot ${recommendation.source}`} />
              {recommendation.source === "gemini"
                ? "Gemini recommendation"
                : recommendation.source === "fallback"
                  ? "Rule-based fallback"
                  : "Preview guidance"}
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
