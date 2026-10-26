/** Live order tracking and one-tap reorder helpers (S5-03). */

export const TRACK_STEPS = [
  { status: "Created", label: "Order placed" },
  { status: "Accepted", label: "Accepted by the restaurant" },
  { status: "Preparing", label: "Being prepared" },
  { status: "Ready", label: "Ready" },
  { status: "Served", label: "Served" },
] as const;

export type StepState = "done" | "current" | "upcoming";

export interface TrackedItem {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  options?: Array<{ group: string; choice: string }>;
  notes?: string;
}

export interface TrackedOrder {
  id: string;
  status: string;
  restaurantName: string;
  tableNumber?: string;
  totalMinor: number;
  currency: string;
  createdAt: string;
  items: TrackedItem[];
}

export interface TrackedEta {
  readyAt: string;
  minutesLeft: number;
  late: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseItem(value: unknown): TrackedItem | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.menuItemId !== "string" ||
    typeof value.name !== "string" ||
    typeof value.quantity !== "number" ||
    !Number.isInteger(value.quantity) ||
    value.quantity < 1
  ) {
    return null;
  }
  const options = Array.isArray(value.options)
    ? value.options.flatMap((option) =>
        isRecord(option) && typeof option.group === "string" && typeof option.choice === "string"
          ? [{ group: option.group, choice: option.choice }]
          : [],
      )
    : [];
  return {
    id: value.id,
    menuItemId: value.menuItemId,
    name: value.name,
    quantity: value.quantity,
    ...(options.length ? { options } : {}),
    ...(typeof value.notes === "string" && value.notes ? { notes: value.notes } : {}),
  };
}

export function parseTrackedOrder(value: unknown): TrackedOrder | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.status !== "string" ||
    typeof value.totalMinor !== "number" ||
    typeof value.currency !== "string" ||
    typeof value.createdAt !== "string" ||
    !Array.isArray(value.items)
  ) {
    return null;
  }
  const items = value.items.map(parseItem);
  if (items.some((item) => item === null)) return null;
  return {
    id: value.id,
    status: value.status,
    restaurantName: typeof value.restaurantName === "string" ? value.restaurantName : "Restaurant",
    ...(typeof value.tableNumber === "string" && value.tableNumber
      ? { tableNumber: value.tableNumber }
      : {}),
    totalMinor: value.totalMinor,
    currency: value.currency,
    createdAt: value.createdAt,
    items: items as TrackedItem[],
  };
}

export function parseEta(value: unknown): TrackedEta | null {
  if (
    !isRecord(value) ||
    typeof value.readyAt !== "string" ||
    !Number.isFinite(Date.parse(value.readyAt)) ||
    typeof value.minutesLeft !== "number" ||
    typeof value.late !== "boolean"
  ) {
    return null;
  }
  return {
    readyAt: value.readyAt,
    minutesLeft: Math.max(1, Math.round(value.minutesLeft)),
    late: value.late,
  };
}

/** Reads GET /orders/:id and the order part of POST /orders. */
export function parseTrackingResponse(
  payload: unknown,
): { order: TrackedOrder; eta: TrackedEta | null } | null {
  if (!isRecord(payload)) return null;
  const order = parseTrackedOrder(payload.order);
  if (!order) return null;
  return { order, eta: parseEta(payload.eta) };
}

/** Completed counts as served; cancelled orders show no progress. */
export function stepState(orderStatus: string, step: string): StepState {
  const status = orderStatus === "Completed" ? "Served" : orderStatus;
  const current = TRACK_STEPS.findIndex((candidate) => candidate.status === status);
  const index = TRACK_STEPS.findIndex((candidate) => candidate.status === step);
  if (current < 0 || index < 0) return "upcoming";
  if (index < current) return "done";
  if (index === current) return status === "Served" ? "done" : "current";
  return "upcoming";
}

/** The `order.status` socket event for this order, or null. */
export function orderStatusFromEvent(
  event: { event: string; data: Record<string, unknown> },
  orderId: string,
): string | null {
  if (event.event !== "order.status" || event.data.orderId !== orderId) return null;
  return typeof event.data.status === "string" ? event.data.status : null;
}

/** "Ready in about 12 min (by 7:42 pm)", or a late or finished message. */
export function etaLine(
  status: string,
  eta: TrackedEta | null,
  timeZone = "Asia/Kolkata",
): string | null {
  if (status === "Ready") return "Your order is ready.";
  if (status === "Served" || status === "Completed") return "Enjoy your meal.";
  if (status === "Cancelled") return "This order was cancelled.";
  if (!eta) return null;
  if (eta.late) return "Taking a little longer than expected. It should be ready very soon.";
  const by = new Intl.DateTimeFormat("en-IN", { timeZone, hour: "numeric", minute: "2-digit" })
    .format(new Date(eta.readyAt))
    .toLowerCase();
  return `Ready in about ${eta.minutesLeft} min (by ${by})`;
}

export interface ReorderMenuItem {
  id: string;
  name: string;
  isAvailable: boolean;
  optionGroups?: Array<{
    id: string;
    name: string;
    required: boolean;
    choices: Array<{ id: string; label: string }>;
  }>;
}

export interface ReorderPlan {
  lines: Array<{
    menuItemId: string;
    quantity: number;
    options?: Record<string, string>;
    notes?: string;
  }>;
  /** Dish names that are sold out, removed, or whose options changed. */
  unavailable: string[];
}

/**
 * Rebuilds a past order against today's menu. Orders store the option group
 * name and choice label, so they are matched by name. Sold-out or removed
 * dishes, and dishes whose options no longer match, are left out and named.
 */
export function planReorder(
  items: readonly TrackedItem[],
  menu: readonly ReorderMenuItem[],
): ReorderPlan {
  const lines: ReorderPlan["lines"] = [];
  const unavailable: string[] = [];
  for (const item of items) {
    const current = menu.find((candidate) => candidate.id === item.menuItemId);
    if (!current?.isAvailable) {
      unavailable.push(item.name);
      continue;
    }
    const groups = current.optionGroups ?? [];
    const options: Record<string, string> = {};
    let matches = true;
    for (const chosen of item.options ?? []) {
      const group = groups.find((candidate) => candidate.name === chosen.group);
      const choice = group?.choices.find((candidate) => candidate.label === chosen.choice);
      if (!group || !choice) {
        matches = false;
        break;
      }
      options[group.id] = choice.id;
    }
    // A group the restaurant has since made required has no remembered answer.
    if (matches && groups.some((group) => group.required && !(group.id in options))) {
      matches = false;
    }
    if (!matches) {
      unavailable.push(item.name);
      continue;
    }
    lines.push({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      ...(Object.keys(options).length ? { options } : {}),
      ...(item.notes ? { notes: item.notes } : {}),
    });
  }
  return { lines, unavailable };
}

/** "Masala dosa is not available today, so it was left out." */
export function reorderNotice(unavailable: readonly string[]): string | null {
  if (unavailable.length === 0) return null;
  const names =
    unavailable.length === 1
      ? unavailable[0]
      : `${unavailable.slice(0, -1).join(", ")} and ${unavailable[unavailable.length - 1]}`;
  return `${names} ${unavailable.length === 1 ? "is" : "are"} not available today, so ${unavailable.length === 1 ? "it was" : "they were"} left out.`;
}
