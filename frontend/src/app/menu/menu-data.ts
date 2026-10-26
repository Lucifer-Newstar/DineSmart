export type Category = string;

export interface MenuOptionChoice {
  id: string;
  label: string;
  priceDeltaMinor: number;
}

/** A single-choice group such as size or spice level (S4-05). */
export interface MenuOptionGroup {
  id: string;
  name: string;
  required: boolean;
  choices: MenuOptionChoice[];
}

/** Chosen choice id per group id, e.g. `{ spice: "hot" }`. */
export type OptionSelection = Record<string, string>;

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  priceMinor: number;
  category: Category;
  vegetarian: boolean;
  /** Lowercased dietary labels from the restaurant, e.g. "vegan", "gluten-free". */
  dietaryLabels: string[];
  allergenLabels: string[];
  /** False while the restaurant has 86'd the dish: shown greyed out, cannot be added. */
  isAvailable: boolean;
  optionGroups: MenuOptionGroup[];
  art: string;
}

export interface RestaurantMenu {
  id: string;
  name: string;
  currency: string;
  items: MenuItem[];
  truncated: boolean;
}

export interface CartLine {
  item: MenuItem;
  quantity: number;
  /** Present only for dishes with options; the same dish with other options is another line. */
  options?: OptionSelection;
  /** The guest's special request for this line, up to MAX_LINE_NOTE_LENGTH (S5-03). */
  notes?: string;
}

export const MAX_LINE_NOTE_LENGTH = 140;

/** Trims a request and drops it when empty; null when it is too long to send. */
export function cleanLineNote(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const note = value.replace(/\s+/g, " ").trim();
  if (note.length > MAX_LINE_NOTE_LENGTH) return null;
  return note || undefined;
}

export const ALL_DISHES = "All dishes";
/** A bag waiting in this tab: saved before sign-in, or built by "Order again" (S5-03). */
export const PENDING_CART_STORAGE_KEY = "dinesmart.pending-order-cart.v1";
/** Shown in the bag after a reorder left some dishes out. */
export const REORDER_NOTICE_STORAGE_KEY = "dinesmart.reorder-notice.v1";
export const MAX_ORDER_LINES = 20;
export const MAX_ITEM_QUANTITY = 20;
export const MAX_ORDER_UNITS = 50;
export const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

/** Vegan and Jain dishes are vegetarian too, so they satisfy the vegetarian filter. */
const VEGETARIAN_LABELS = new Set(["vegetarian", "vegan", "jain"]);

/** Dietary filters the customer menu offers, in display order. */
export const DIETARY_FILTERS = ["vegetarian", "vegan", "jain", "gluten-free"] as const;
export type DietaryFilter = (typeof DIETARY_FILTERS)[number];

export interface MenuFilters {
  category: string;
  search: string;
  dietary: readonly DietaryFilter[];
  /** Allergens to leave out, lowercased. */
  withoutAllergens: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function artForItem(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized.includes("dosa")) return normalized.includes("masala") ? "masala" : "dosa";
  if (normalized.includes("paneer") || normalized.includes("tikka")) return "tikka";
  if (normalized.includes("coffee")) return "coffee";
  if (normalized.includes("mango") || normalized.includes("lassi")) return "mango";
  if (normalized.includes("okra")) return "okra";
  if (normalized.includes("rasam")) return "rasam";
  return "rice";
}

const OPTION_ID = /^[a-z0-9][a-z0-9-]{0,23}$/;

function parseOptionGroups(value: unknown): MenuOptionGroup[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 4) return null;
  const groups: MenuOptionGroup[] = [];
  for (const group of value) {
    if (
      !isRecord(group) ||
      typeof group.id !== "string" ||
      !OPTION_ID.test(group.id) ||
      typeof group.name !== "string" ||
      !group.name.trim() ||
      typeof group.required !== "boolean" ||
      !Array.isArray(group.choices) ||
      group.choices.length === 0
    ) {
      return null;
    }
    const choices: MenuOptionChoice[] = [];
    for (const choice of group.choices) {
      if (
        !isRecord(choice) ||
        typeof choice.id !== "string" ||
        !OPTION_ID.test(choice.id) ||
        typeof choice.label !== "string" ||
        !choice.label.trim() ||
        typeof choice.priceDeltaMinor !== "number" ||
        !Number.isSafeInteger(choice.priceDeltaMinor) ||
        choice.priceDeltaMinor < 0
      ) {
        return null;
      }
      choices.push({ id: choice.id, label: choice.label, priceDeltaMinor: choice.priceDeltaMinor });
    }
    groups.push({ id: group.id, name: group.name, required: group.required, choices });
  }
  return groups;
}

/** Required groups start on their first choice; optional groups start unanswered. */
export function defaultSelection(item: MenuItem): OptionSelection {
  const selection: OptionSelection = {};
  for (const group of item.optionGroups) {
    const first = group.choices[0];
    if (group.required && first) selection[group.id] = first.id;
  }
  return selection;
}

/** True when every chosen choice exists and every required group is answered. */
export function isCompleteSelection(item: MenuItem, selection: OptionSelection): boolean {
  if (Object.keys(selection).some((groupId) => !item.optionGroups.some((g) => g.id === groupId))) {
    return false;
  }
  return item.optionGroups.every((group) => {
    const choiceId = selection[group.id];
    if (choiceId === undefined) return !group.required;
    return group.choices.some((choice) => choice.id === choiceId);
  });
}

/** One key per dish and choice set, so "rice, large" and "rice, regular" are separate lines. */
export function cartLineKey(itemId: string, selection: OptionSelection = {}): string {
  const parts = Object.entries(selection)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([group, choice]) => `${group}=${choice}`);
  return parts.length ? `${itemId}|${parts.join("&")}` : itemId;
}

/** Base price plus the chosen options' deltas; null for an unknown choice or an unsafe sum. */
export function unitPriceMinor(item: MenuItem, selection: OptionSelection = {}): number | null {
  let total = item.priceMinor;
  for (const [groupId, choiceId] of Object.entries(selection)) {
    const choice = item.optionGroups
      .find((group) => group.id === groupId)
      ?.choices.find((candidate) => candidate.id === choiceId);
    if (!choice) return null;
    total += choice.priceDeltaMinor;
  }
  return Number.isSafeInteger(total) && total > 0 ? total : null;
}

/** "Large · Roasted papad", in the order the restaurant lists the groups. */
export function optionSummary(item: MenuItem, selection: OptionSelection = {}): string {
  return item.optionGroups
    .map((group) => group.choices.find((choice) => choice.id === selection[group.id])?.label)
    .filter((label): label is string => Boolean(label))
    .join(" · ");
}

export function parseMenu(value: unknown): RestaurantMenu | null {
  if (!isRecord(value) || !isRecord(value.restaurant) || !Array.isArray(value.items)) return null;
  const restaurant = value.restaurant;
  if (
    typeof restaurant.id !== "string" ||
    !OBJECT_ID_PATTERN.test(restaurant.id) ||
    typeof restaurant.name !== "string" ||
    !restaurant.name.trim() ||
    typeof restaurant.currency !== "string" ||
    !/^[A-Z]{3}$/.test(restaurant.currency) ||
    typeof value.truncated !== "boolean"
  ) {
    return null;
  }

  const items: MenuItem[] = [];
  for (const entry of value.items) {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      !OBJECT_ID_PATTERN.test(entry.id) ||
      typeof entry.name !== "string" ||
      !entry.name.trim() ||
      typeof entry.category !== "string" ||
      !entry.category.trim() ||
      typeof entry.priceMinor !== "number" ||
      !Number.isSafeInteger(entry.priceMinor) ||
      entry.priceMinor <= 0 ||
      (entry.description !== undefined && typeof entry.description !== "string") ||
      !Array.isArray(entry.dietaryLabels) ||
      !entry.dietaryLabels.every((label) => typeof label === "string") ||
      !Array.isArray(entry.allergenLabels) ||
      !entry.allergenLabels.every((label) => typeof label === "string") ||
      (entry.isAvailable !== undefined && typeof entry.isAvailable !== "boolean")
    ) {
      return null;
    }
    const optionGroups = parseOptionGroups(entry.optionGroups);
    if (!optionGroups) return null;
    items.push({
      id: entry.id,
      name: entry.name,
      description:
        typeof entry.description === "string" && entry.description.trim()
          ? entry.description
          : "Prepared fresh by the kitchen.",
      priceMinor: entry.priceMinor,
      category: entry.category,
      vegetarian: entry.dietaryLabels.some((label) => VEGETARIAN_LABELS.has(label.toLowerCase())),
      dietaryLabels: [...new Set(entry.dietaryLabels.map((label) => label.toLowerCase()))],
      allergenLabels: entry.allergenLabels,
      // Older API builds only sent available items, so a missing flag means available.
      isAvailable: entry.isAvailable !== false,
      optionGroups,
      art: artForItem(entry.name),
    });
  }

  return {
    id: restaurant.id,
    name: restaurant.name,
    currency: restaurant.currency,
    items,
    truncated: value.truncated,
  };
}

export function parsePendingCart(value: unknown, menu: RestaurantMenu): CartLine[] {
  if (
    !isRecord(value) ||
    value.restaurantId !== menu.id ||
    !Array.isArray(value.items) ||
    value.items.length > MAX_ORDER_LINES
  ) {
    return [];
  }
  const lines: CartLine[] = [];
  const keys = new Set<string>();
  let totalUnits = 0;
  for (const entry of value.items) {
    if (
      !isRecord(entry) ||
      typeof entry.menuItemId !== "string" ||
      !Number.isInteger(entry.quantity) ||
      (entry.quantity as number) < 1 ||
      (entry.quantity as number) > MAX_ITEM_QUANTITY ||
      (entry.options !== undefined && !isRecord(entry.options)) ||
      cleanLineNote(entry.notes) === null
    ) {
      return [];
    }
    const notes = cleanLineNote(entry.notes);
    const item = menu.items.find((candidate) => candidate.id === entry.menuItemId);
    if (!item?.isAvailable) return [];
    const options = (entry.options ?? {}) as Record<string, unknown>;
    if (!Object.values(options).every((choice) => typeof choice === "string")) return [];
    const selection = options as OptionSelection;
    if (!isCompleteSelection(item, selection)) return [];
    const key = cartLineKey(item.id, selection);
    if (keys.has(key)) return [];
    keys.add(key);
    totalUnits += entry.quantity as number;
    if (totalUnits > MAX_ORDER_UNITS) return [];
    lines.push({
      item,
      quantity: entry.quantity as number,
      ...(Object.keys(selection).length ? { options: selection } : {}),
      ...(notes ? { notes } : {}),
    });
  }
  return lines;
}

export function calculateCartTotalMinor(lines: CartLine[]): number | null {
  let total = 0;
  for (const line of lines) {
    const unit = unitPriceMinor(line.item, line.options);
    if (unit === null || !Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      return null;
    }
    const lineTotal = unit * line.quantity;
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(total + lineTotal)) return null;
    total += lineTotal;
  }
  return total;
}

/** A `menu.availability` realtime payload, or null when it is malformed. */
export function parseAvailabilityEvent(
  data: unknown,
): { menuItemId: string; isAvailable: boolean } | null {
  if (
    !isRecord(data) ||
    typeof data.menuItemId !== "string" ||
    !OBJECT_ID_PATTERN.test(data.menuItemId) ||
    typeof data.isAvailable !== "boolean"
  ) {
    return null;
  }
  return { menuItemId: data.menuItemId, isAvailable: data.isAvailable };
}

/** The menu with one item's availability changed; the same object when nothing changes. */
export function applyAvailability(
  menu: RestaurantMenu,
  menuItemId: string,
  isAvailable: boolean,
): RestaurantMenu {
  const item = menu.items.find((candidate) => candidate.id === menuItemId);
  if (!item || item.isAvailable === isAvailable) return menu;
  return {
    ...menu,
    items: menu.items.map((candidate) =>
      candidate.id === menuItemId ? { ...candidate, isAvailable } : candidate,
    ),
  };
}

/** Cart lines whose dish is still on the menu and available; the rest are named so the bag can say so. */
export function reconcileCart(
  lines: CartLine[],
  menu: RestaurantMenu,
): { lines: CartLine[]; removed: string[] } {
  const kept: CartLine[] = [];
  const removed: string[] = [];
  for (const line of lines) {
    const current = menu.items.find((item) => item.id === line.item.id);
    if (current?.isAvailable) kept.push({ ...line, item: current });
    else removed.push(line.item.name);
  }
  return { lines: kept, removed };
}

function matchesDietary(item: MenuItem, filter: DietaryFilter): boolean {
  return filter === "vegetarian" ? item.vegetarian : item.dietaryLabels.includes(filter);
}

/**
 * The customer menu's filters (S4-05): category, a search over name,
 * description and category where every word must match, dietary labels that
 * must all apply, and allergens to leave out.
 */
export function filterMenuItems(items: readonly MenuItem[], filters: MenuFilters): MenuItem[] {
  const terms = filters.search.toLowerCase().split(/\s+/).filter(Boolean);
  const excluded = new Set(filters.withoutAllergens.map((label) => label.toLowerCase()));
  return items.filter((item) => {
    if (filters.category !== ALL_DISHES && item.category !== filters.category) return false;
    const text = `${item.name} ${item.description} ${item.category}`.toLowerCase();
    if (!terms.every((term) => text.includes(term))) return false;
    if (!filters.dietary.every((filter) => matchesDietary(item, filter))) return false;
    return !item.allergenLabels.some((label) => excluded.has(label.toLowerCase()));
  });
}

/** Dietary filters worth offering: those at least one dish on this menu satisfies. */
export function availableDietaryFilters(items: readonly MenuItem[]): DietaryFilter[] {
  return DIETARY_FILTERS.filter((filter) => items.some((item) => matchesDietary(item, filter)));
}

/** Every allergen named on the menu, lowercased and sorted, for the "leave out" chips. */
export function menuAllergens(items: readonly MenuItem[]): string[] {
  return [
    ...new Set(items.flatMap((item) => item.allergenLabels.map((label) => label.toLowerCase()))),
  ].sort();
}
