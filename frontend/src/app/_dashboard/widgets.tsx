"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { type Arrival, type ArrivalNoun, describeArrivals } from "../live-announcements";
import type { Recommendation } from "../recommendation-data";
import { displayOrderId } from "./parsers";
import type { InventoryItem, Order, OrderFeedStatus } from "./types";
import { Icon, StatusPill } from "./ui";

/**
 * Announces items that arrive after the first load, once each, through a
 * polite live region. `ready` is false while a list is loading or showing
 * sample data, so placeholders are never read out.
 */
export function useArrivalAnnouncement(
  items: readonly Arrival[],
  noun: ArrivalNoun,
  ready: boolean,
): string {
  const seen = useRef<Set<string> | null>(null);
  const [message, setMessage] = useState("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: noun is a constant per caller
  useEffect(() => {
    if (!ready) return;
    const text = describeArrivals(seen.current, items, noun);
    seen.current = new Set([...(seen.current ?? []), ...items.map((item) => item.id)]);
    if (text) setMessage(text);
  }, [items, ready]);
  return message;
}

/** A visually hidden polite live region; screen readers read each new message once. */
export function LiveAnnouncer({ message }: { message: string }) {
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}

export function OrdersTable({
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

export function RevenueChart() {
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

export function InventoryRows({
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

export function RecommendationCard({
  recommendation,
  reviewed,
  onReview,
  onGenerate,
  generating,
  loading,
}: {
  recommendation: Recommendation;
  reviewed: boolean;
  onReview: () => void;
  onGenerate?: () => void;
  generating?: boolean;
  loading?: boolean;
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
              disabled={generating || loading}
            >
              <Icon name="refresh" size={15} />
              {generating ? "Generating…" : loading ? "Loading…" : "Generate again"}
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
