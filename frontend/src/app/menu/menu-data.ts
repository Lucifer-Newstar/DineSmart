export type Category = string;

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  priceMinor: number;
  category: Category;
  vegetarian: boolean;
  allergenLabels: string[];
  /** False while the restaurant has 86'd the dish: shown greyed out, cannot be added. */
  isAvailable: boolean;
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
}

export const ALL_DISHES = "All dishes";
export const MAX_ORDER_LINES = 20;
export const MAX_ITEM_QUANTITY = 20;
export const MAX_ORDER_UNITS = 50;
export const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

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
    items.push({
      id: entry.id,
      name: entry.name,
      description:
        typeof entry.description === "string" && entry.description.trim()
          ? entry.description
          : "Prepared fresh by the kitchen.",
      priceMinor: entry.priceMinor,
      category: entry.category,
      vegetarian: entry.dietaryLabels.some((label) => label.toLowerCase() === "vegetarian"),
      allergenLabels: entry.allergenLabels,
      // Older API builds only sent available items, so a missing flag means available.
      isAvailable: entry.isAvailable !== false,
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
  let totalUnits = 0;
  for (const entry of value.items) {
    if (
      !isRecord(entry) ||
      typeof entry.menuItemId !== "string" ||
      !Number.isInteger(entry.quantity) ||
      (entry.quantity as number) < 1 ||
      (entry.quantity as number) > MAX_ITEM_QUANTITY
    ) {
      return [];
    }
    const item = menu.items.find((candidate) => candidate.id === entry.menuItemId);
    if (!item?.isAvailable || lines.some((line) => line.item.id === item.id)) return [];
    totalUnits += entry.quantity as number;
    if (totalUnits > MAX_ORDER_UNITS) return [];
    lines.push({ item, quantity: entry.quantity as number });
  }
  return lines;
}

export function calculateCartTotalMinor(lines: CartLine[]): number | null {
  let total = 0;
  for (const line of lines) {
    if (
      !Number.isSafeInteger(line.item.priceMinor) ||
      line.item.priceMinor <= 0 ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1
    ) {
      return null;
    }
    const lineTotal = line.item.priceMinor * line.quantity;
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
