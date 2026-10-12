/**
 * Pure dashboard derivations. These helpers exist so the Orders view computes
 * its filter, counters, and average once per meaningful change instead of on
 * every unrelated parent render.
 */

export interface MetricOrder {
  id: string;
  guest: string;
  items: string;
  status: string;
  elapsed: number;
}

export interface OrderMetrics<T extends MetricOrder> {
  visible: T[];
  inProgress: number;
  newTickets: number;
  readyToServe: number;
  averageTicketMinutes: number | null;
}

export const ALL_ORDERS_FILTER = "All orders";

const ACTIVE_PROGRESS_STATUSES = new Set(["Accepted", "Preparing"]);

/**
 * One pass produces the filtered list and every counter the toolbar shows.
 * The search text is normalized once instead of per row.
 */
export function summarizeOrders<T extends MetricOrder>(
  orders: readonly T[],
  search: string,
  statusFilter: string,
): OrderMetrics<T> {
  const query = search.trim().toLowerCase();
  const matchesAllStatuses = statusFilter === ALL_ORDERS_FILTER;
  const visible: T[] = [];
  let inProgress = 0;
  let newTickets = 0;
  let readyToServe = 0;
  let elapsedTotal = 0;

  for (const order of orders) {
    if (ACTIVE_PROGRESS_STATUSES.has(order.status)) inProgress += 1;
    if (order.status === "New") newTickets += 1;
    if (order.status === "Ready") readyToServe += 1;
    elapsedTotal += order.elapsed;

    const matchesQuery =
      query.length === 0 ||
      `${order.id} ${order.guest} ${order.items}`.toLowerCase().includes(query);
    if (matchesQuery && (matchesAllStatuses || order.status === statusFilter)) {
      visible.push(order);
    }
  }

  return {
    visible,
    inProgress,
    newTickets,
    readyToServe,
    averageTicketMinutes: orders.length ? Math.round(elapsedTotal / orders.length) : null,
  };
}

export const INCIDENT_FEED_CAP = 200;

export type IncidentFeedStatus =
  | "preview"
  | "loading"
  | "live"
  | "empty"
  | "unavailable"
  | "restricted";

export interface IncidentSummary<T> {
  visible: T[];
  open: T[];
  resolved: T[];
}

const LIVE_INCIDENT_FEED_STATUSES = new Set<IncidentFeedStatus>(["live", "preview"]);

/**
 * Splits the bounded incident feed once per load. Sample and live lists are the
 * only states that render records, and every counter derives from that split.
 */
export function summarizeIncidents<T extends { status: string }>(
  incidents: readonly T[],
  status: IncidentFeedStatus,
): IncidentSummary<T> {
  if (!LIVE_INCIDENT_FEED_STATUSES.has(status)) return { visible: [], open: [], resolved: [] };

  const open: T[] = [];
  const resolved: T[] = [];
  for (const incident of incidents) {
    if (incident.status === "resolved") resolved.push(incident);
    else open.push(incident);
  }

  return { visible: [...incidents], open, resolved };
}

/**
 * A feed that reached the server cap cannot be counted exactly, so the UI shows
 * an explicit lower bound instead of implying a complete total.
 */
export function formatLoadedCount(value: number, truncated: boolean): string | number {
  return truncated && value >= INCIDENT_FEED_CAP ? `${INCIDENT_FEED_CAP}+` : value;
}

export interface AnalyticsBar<T> {
  point: T;
  value: number;
  heightPercent: number;
  isPeak: boolean;
}

export interface AnalyticsBarOptions<T> {
  value: (point: T) => number;
  minimumPercent?: number;
}

const EMPTY_BAR_PERCENT = 2;

/**
 * Bar geometry is derived once per dataset so the chart does not rescale every
 * bar while React reconciles unrelated state. Empty buckets still render a
 * visible stub, and the peak bucket is flagged for highlighting.
 */
export function buildAnalyticsBars<T>(
  points: readonly T[],
  options: AnalyticsBarOptions<T>,
): Array<AnalyticsBar<T>> {
  const minimumPercent = options.minimumPercent ?? 7;
  const maximum = points.reduce((peak, point) => Math.max(peak, options.value(point)), 0);
  const scale = Math.max(1, maximum);

  return points.map((point) => {
    const value = options.value(point);
    return {
      point,
      value,
      heightPercent: value ? Math.max(minimumPercent, (value / scale) * 100) : EMPTY_BAR_PERCENT,
      isPeak: value > 0 && value === maximum,
    };
  });
}
