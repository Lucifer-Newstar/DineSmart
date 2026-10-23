"use client";
import { useMemo } from "react";
import { formatLoadedCount, summarizeIncidents } from "../dashboard-metrics";
import type { IncidentRecord } from "../incident-data";
import type { Recommendation } from "../recommendation-data";
import type { IncidentViewStatus } from "./types";
import { Icon } from "./ui";

export function incidentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    kitchen_delay: "Kitchen delay",
    order_delay: "Order delay",
    kitchen_congestion: "Kitchen congestion",
    inventory_shortage: "Inventory shortage",
    reservation_conflict: "Reservation conflict",
    queue_congestion: "Queue congestion",
    table_congestion: "Table congestion",
  };
  return labels[type] ?? type.replaceAll("_", " ");
}

export function incidentTriggerLabel(key: string): string {
  const labels: Record<string, string> = {
    elapsedMinutes: "Elapsed",
    thresholdMinutes: "Threshold",
    queueLength: "Queue length",
    activeOrderCount: "Active orders",
    oldestActiveOrderMinutes: "Oldest active order",
    available: "Available stock",
    lowStockThreshold: "Low-stock threshold",
    partySize: "Party size",
    conflictCount: "Conflicts",
    capacity: "Table capacity",
    tableStatus: "Table status",
  };
  return labels[key] ?? key;
}

export function incidentTriggerValue(
  key: string,
  value: string | number | boolean,
  snapshot: Record<string, string | number | boolean>,
): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value.replaceAll("_", " ");
  const amount = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
  if (key.endsWith("Minutes")) return `${amount} min`;
  if ((key === "available" || key === "lowStockThreshold") && typeof snapshot.unit === "string") {
    return `${amount} ${snapshot.unit}`;
  }
  return amount;
}

export function incidentTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function IncidentCard({
  incident,
  recommendation,
  onInsights,
}: {
  incident: IncidentRecord;
  recommendation: Recommendation;
  onInsights: () => void;
}) {
  const isResolved = incident.status === "resolved";
  const triggerEntries = Object.entries(incident.triggerSnapshot)
    .filter(([key]) => key !== "unit")
    .slice(0, 4);
  const canReview = incident.id.toLowerCase() === recommendation.incidentId.toLowerCase();
  const isConditionResolved = incident.resolutionReason === "condition_cleared";

  return (
    <article className="card incident-card">
      <div className="incident-row-top">
        <div className="incident-card-labels">
          <span className="incident-type-pill">
            <i /> {incidentTypeLabel(incident.type)}
          </span>
          <span className={`incident-severity incident-severity-${incident.severity}`}>
            {incident.severity}
          </span>
          <span
            className={`incident-record-status incident-record-status-${isResolved ? "resolved" : "open"}`}
          >
            {isResolved ? "Resolved" : "Open"}
          </span>
        </div>
        <time className="incident-time" dateTime={incident.createdAt}>
          Reported {incidentTimestamp(incident.createdAt)}
        </time>
      </div>
      <h2>{incident.rootCause || `${incidentTypeLabel(incident.type)} detected.`}</h2>
      <p className="incident-description">
        Affected {incident.affectedEntity.type.replaceAll("_", " ")} · ID{" "}
        {incident.affectedEntity.id.slice(0, 6)}…{incident.affectedEntity.id.slice(-4)}
      </p>
      {triggerEntries.length > 0 ? (
        <dl className="incident-context-grid">
          {triggerEntries.map(([key, value]) => (
            <div key={key}>
              <dt>{incidentTriggerLabel(key)}</dt>
              <dd>{incidentTriggerValue(key, value, incident.triggerSnapshot)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="incident-actions-row">
        <span>
          <Icon name={isResolved ? "check" : "alert"} size={15} />
          {isResolved
            ? isConditionResolved
              ? "Resolved after the trigger cleared."
              : "This incident is resolved."
            : "Rule-managed incidents resolve automatically when the trigger clears."}
        </span>
        {canReview ? (
          <button className="button button-dark" type="button" onClick={onInsights}>
            Review recommendation <Icon name="arrow-right" size={15} />
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function IncidentsPage({
  incidents,
  status,
  truncated,
  recommendation,
  onInsights,
}: {
  incidents: IncidentRecord[];
  status: IncidentViewStatus;
  truncated: boolean;
  recommendation: Recommendation;
  onInsights: () => void;
}) {
  const {
    visible: visibleIncidents,
    open: openIncidents,
    resolved: resolvedIncidents,
  } = useMemo(() => summarizeIncidents(incidents, status), [incidents, status]);
  const showRecords = status === "live" || status === "preview";
  const stateText =
    status === "preview"
      ? "Sample preview only — these incidents are illustrative, not a live restaurant feed."
      : status === "loading"
        ? "Loading incidents from the signed-in restaurant workspace."
        : status === "unavailable"
          ? "The incident service is unavailable or returned invalid data. No sample records are shown as live."
          : status === "restricted"
            ? "This account cannot view incident records. Sign in as a Manager or Administrator."
            : status === "empty"
              ? "No incident records were returned for this restaurant."
              : "Live incidents for the signed-in restaurant. Rule-managed records update and resolve from operational data.";

  return (
    <>
      <section className="incident-summary-row" aria-label="Incident record summary">
        <article>
          <span className="incident-number incident-number-coral">
            <Icon name="alert" size={16} />
          </span>
          <div>
            <span>Open in loaded list</span>
            <strong>
              {showRecords ? formatLoadedCount(openIncidents.length, truncated) : "—"}
            </strong>
          </div>
        </article>
        <article>
          <span className="incident-number incident-number-gold">
            <Icon name="check" size={16} />
          </span>
          <div>
            <span>Resolved in loaded list</span>
            <strong>
              {showRecords ? formatLoadedCount(resolvedIncidents.length, truncated) : "—"}
            </strong>
          </div>
        </article>
        <article>
          <span className="incident-number incident-number-green">
            <Icon name="receipt" size={16} />
          </span>
          <div>
            <span>Records loaded</span>
            <strong>
              {showRecords
                ? formatLoadedCount(visibleIncidents.length, truncated)
                : status === "empty"
                  ? 0
                  : "—"}
            </strong>
          </div>
        </article>
      </section>
      <p
        className={`incident-feed-state incident-feed-state-${status}`}
        role={status === "unavailable" || status === "restricted" ? "alert" : "status"}
      >
        {stateText}
      </p>
      {truncated && status === "live" ? (
        <p className="incident-truncation-note">
          Showing the newest 200 records; older history may be omitted.
        </p>
      ) : null}
      {showRecords ? (
        <>
          <div className="incident-history-head">
            <div>
              <div className="card-overline">CURRENT OPERATIONS</div>
              <h2>Open incidents</h2>
            </div>
          </div>
          {openIncidents.length > 0 ? (
            <div className="incident-list">
              {openIncidents.map((incident) => (
                <IncidentCard
                  key={incident.id}
                  incident={incident}
                  recommendation={recommendation}
                  onInsights={onInsights}
                />
              ))}
            </div>
          ) : (
            <article className="card incident-empty-state">
              <strong>No open incidents in this list.</strong>
              <span>Rule-managed incidents reopen when their supported condition recurs.</span>
            </article>
          )}
          <div className="incident-history-head">
            <div>
              <div className="card-overline">RECENT ACTIVITY</div>
              <h2>Resolved incidents</h2>
            </div>
          </div>
          {resolvedIncidents.length > 0 ? (
            <div className="incident-list">
              {resolvedIncidents.map((incident) => (
                <IncidentCard
                  key={incident.id}
                  incident={incident}
                  recommendation={recommendation}
                  onInsights={onInsights}
                />
              ))}
            </div>
          ) : (
            <article className="card incident-empty-state">
              <strong>No resolved records in this list.</strong>
              <span>Resolution history appears after the source condition clears.</span>
            </article>
          )}
        </>
      ) : null}
      <p className="incident-lifecycle-note">
        <Icon name="alert" size={15} />
        Incident detection and resolution are rule-managed. This view does not offer a manual close
        action.
      </p>
    </>
  );
}
