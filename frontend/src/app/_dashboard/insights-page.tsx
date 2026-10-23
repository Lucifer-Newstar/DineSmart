"use client";

import type { IncidentRecord } from "../incident-data";
import type { Recommendation } from "../recommendation-data";
import { incidentTriggerLabel, incidentTriggerValue, incidentTypeLabel } from "./incidents-page";
import type { IncidentViewStatus, RecommendationViewStatus } from "./types";
import { Icon } from "./ui";
import { RecommendationCard } from "./widgets";

export function InsightsPage({
  recommendation,
  recommendationStatus,
  incident,
  incidentStatus,
  reviewed,
  onReview,
  onGenerate,
  generating,
}: {
  recommendation: Recommendation;
  recommendationStatus: RecommendationViewStatus;
  incident: IncidentRecord | null;
  incidentStatus: IncidentViewStatus;
  reviewed: boolean;
  onReview: () => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  const statusMessage =
    recommendationStatus === "loading"
      ? "Loading the saved recommendation from the API."
      : recommendationStatus === "empty"
        ? "No saved recommendation was found for this incident; sample preview guidance is shown below."
        : recommendationStatus === "unavailable"
          ? "The recommendation API is unavailable or returned invalid data; the card below is sample preview guidance."
          : recommendationStatus === "restricted"
            ? "The current account is not authorized to load recommendations; sample preview guidance is shown."
            : "This is sample preview guidance. Connect the API and sign in as a Manager or Administrator to load live recommendations.";
  const incidentContextMessage =
    incident !== null
      ? ""
      : incidentStatus === "loading"
        ? "Loading incident context."
        : incidentStatus === "unavailable"
          ? "Incident context is unavailable; no sample trigger facts are shown beside this advisory."
          : incidentStatus === "restricted"
            ? "This account cannot view incident context."
            : incidentStatus === "empty"
              ? "No matching incident record was returned for this advisory."
              : "Sample incident context is not available for this advisory.";
  const incidentBadgeLabel = incident
    ? incidentStatus === "preview"
      ? `SAMPLE · ${incident.status === "resolved" ? "RESOLVED" : "OPEN"}`
      : incident.status === "resolved"
        ? "RESOLVED"
        : "OPEN INCIDENT"
    : incidentStatus === "loading"
      ? "LOADING INCIDENT"
      : incidentStatus === "restricted"
        ? "RESTRICTED"
        : "CONTEXT UNAVAILABLE";
  const incidentBadgeClass =
    incident?.status === "resolved"
      ? "incident-status-resolved"
      : incident
        ? "incident-status-open"
        : "incident-status-unavailable";

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
      {recommendationStatus !== "live" ? (
        <p className="preview-note" role="status">
          {statusMessage}
        </p>
      ) : null}
      {incidentContextMessage ? (
        <p className="preview-note" role="status">
          {incidentContextMessage}
        </p>
      ) : null}
      <div className="insights-layout">
        <div className="insights-main-column">
          <div className="section-title-inline">
            <div>
              <div className="card-overline">CURRENT RECOMMENDATION</div>
              <h2>
                {incident
                  ? `${incidentTypeLabel(incident.type)} · ${incident.severity}`
                  : "Incident context unavailable"}
              </h2>
            </div>
            <span className={incidentBadgeClass}>
              <i /> {incidentBadgeLabel}
            </span>
          </div>
          <RecommendationCard
            recommendation={recommendation}
            reviewed={reviewed}
            onReview={onReview}
            onGenerate={onGenerate}
            generating={generating}
            loading={recommendationStatus === "loading"}
          />
          <div className="insight-supporting-grid">
            <article className="card supporting-card">
              <span className="supporting-icon supporting-icon-coral">
                <Icon name="box" size={17} />
              </span>
              <div className="card-overline">INCIDENT EVIDENCE</div>
              <h3>{incident ? incidentTypeLabel(incident.type) : "No incident loaded"}</h3>
              <p>
                {incident?.rootCause ||
                  "No incident details are available. Sample trigger facts are not shown as live data."}
              </p>
              {incident ? (
                <div className="insight-trigger-snapshot">
                  {Object.entries(incident.triggerSnapshot)
                    .filter(([key]) => key !== "unit")
                    .slice(0, 3)
                    .map(([key, value]) => (
                      <span key={key}>
                        <small>{incidentTriggerLabel(key)}</small>
                        <strong>
                          {incidentTriggerValue(key, value, incident.triggerSnapshot)}
                        </strong>
                      </span>
                    ))}
                </div>
              ) : null}
            </article>
            <article className="card supporting-card">
              <span className="supporting-icon supporting-icon-green">
                <Icon name="check" size={17} />
              </span>
              <div className="card-overline">HUMAN REVIEW</div>
              <h3>Operational decisions stay with your team.</h3>
              <p>
                Check the source record before acting. This advisory does not change stock, menu,
                reservations, or orders.
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
