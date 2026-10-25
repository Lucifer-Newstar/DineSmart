/**
 * Parsing and pure helpers for the S4-05 menu manager. Kept apart from the page
 * so the rules (rupees ↔ paise, labels, reordering) are unit-testable.
 */

export const DIETARY_LABELS = [
  "vegetarian",
  "vegan",
  "jain",
  "gluten-free",
  "contains-egg",
  "non-vegetarian",
] as const;

export const PREP_STATIONS = [
  "tawa",
  "tandoor",
  "curry",
  "rice",
  "fryer",
  "beverages",
  "desserts",
] as const;

export interface ManagedOptionChoice {
  id: string;
  label: string;
  priceDeltaMinor: number;
}

export interface ManagedOptionGroup {
  id: string;
  name: string;
  required: boolean;
  choices: ManagedOptionChoice[];
}

export interface ManagedMenuItem {
  id: string;
  name: string;
  description: string;
  category: string;
  priceMinor: number;
  isAvailable: boolean;
  dietaryLabels: string[];
  allergenLabels: string[];
  optionGroups: ManagedOptionGroup[];
  prepStation: string;
  prepMinutes: number | null;
}

export interface ManagedMenu {
  categories: string[];
  items: ManagedMenuItem[];
  truncated: boolean;
}

/** What the add/edit form holds, as typed by the manager. */
export interface MenuItemDraft {
  name: string;
  category: string;
  price: string;
  description: string;
  dietaryLabels: string[];
  allergens: string;
  prepStation: string;
  prepMinutes: string;
}

export const EMPTY_DRAFT: MenuItemDraft = {
  name: "",
  category: "",
  price: "",
  description: "",
  dietaryLabels: [],
  allergens: "",
  prepStation: "",
  prepMinutes: "",
};

const OBJECT_ID = /^[a-f\d]{24}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

export function parseOptionGroups(value: unknown): ManagedOptionGroup[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const groups: ManagedOptionGroup[] = [];
  for (const group of value) {
    if (
      !isRecord(group) ||
      typeof group.id !== "string" ||
      typeof group.name !== "string" ||
      typeof group.required !== "boolean" ||
      !Array.isArray(group.choices)
    ) {
      return null;
    }
    const choices: ManagedOptionChoice[] = [];
    for (const choice of group.choices) {
      if (
        !isRecord(choice) ||
        typeof choice.id !== "string" ||
        typeof choice.label !== "string" ||
        typeof choice.priceDeltaMinor !== "number" ||
        !Number.isSafeInteger(choice.priceDeltaMinor) ||
        choice.priceDeltaMinor < 0
      ) {
        return null;
      }
      choices.push({ id: choice.id, label: choice.label, priceDeltaMinor: choice.priceDeltaMinor });
    }
    if (choices.length === 0) return null;
    groups.push({ id: group.id, name: group.name, required: group.required, choices });
  }
  return groups;
}

export function parseManagedItem(value: unknown): ManagedMenuItem | null {
  if (!isRecord(value)) return null;
  const optionGroups = parseOptionGroups(value.optionGroups);
  if (
    typeof value.id !== "string" ||
    !OBJECT_ID.test(value.id) ||
    typeof value.name !== "string" ||
    typeof value.category !== "string" ||
    typeof value.priceMinor !== "number" ||
    !Number.isSafeInteger(value.priceMinor) ||
    value.priceMinor <= 0 ||
    typeof value.isAvailable !== "boolean" ||
    !isStringArray(value.dietaryLabels) ||
    !isStringArray(value.allergenLabels) ||
    (value.description !== undefined && typeof value.description !== "string") ||
    (value.prepStation !== undefined && typeof value.prepStation !== "string") ||
    (value.prepMinutes !== undefined &&
      (typeof value.prepMinutes !== "number" || !Number.isInteger(value.prepMinutes))) ||
    !optionGroups
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    description: typeof value.description === "string" ? value.description : "",
    category: value.category,
    priceMinor: value.priceMinor,
    isAvailable: value.isAvailable,
    dietaryLabels: value.dietaryLabels,
    allergenLabels: value.allergenLabels,
    optionGroups,
    prepStation: typeof value.prepStation === "string" ? value.prepStation : "",
    prepMinutes: typeof value.prepMinutes === "number" ? value.prepMinutes : null,
  };
}

export function parseManagedMenu(value: unknown): ManagedMenu | null {
  if (
    !isRecord(value) ||
    !isStringArray(value.categories) ||
    !Array.isArray(value.items) ||
    typeof value.truncated !== "boolean"
  ) {
    return null;
  }
  const items: ManagedMenuItem[] = [];
  for (const raw of value.items) {
    const item = parseManagedItem(raw);
    if (!item) return null;
    items.push(item);
  }
  return { categories: value.categories, items, truncated: value.truncated };
}

/** "285", "285.5" or "₹ 285.50" → 28550 paise; anything else (or zero) → null. */
export function rupeesToPaise(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]/g, "");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole = "0", fraction = ""] = cleaned.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return paise > 0 ? paise : null;
}

export function paiseToRupees(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

export function draftFromItem(item: ManagedMenuItem): MenuItemDraft {
  return {
    name: item.name,
    category: item.category,
    price: paiseToRupees(item.priceMinor),
    description: item.description,
    dietaryLabels: item.dietaryLabels,
    allergens: item.allergenLabels.join(", "),
    prepStation: item.prepStation,
    prepMinutes: item.prepMinutes === null ? "" : String(item.prepMinutes),
  };
}

export type DraftField = "name" | "category" | "price" | "prepMinutes";

/**
 * Turns the form into an API body, or names the fields that need fixing so the
 * page can tie each error to its input. `editing` sends nulls to clear fields.
 */
export function bodyFromDraft(
  draft: MenuItemDraft,
  editing: boolean,
): { body: Record<string, unknown> } | { errors: Partial<Record<DraftField, string>> } {
  const errors: Partial<Record<DraftField, string>> = {};
  const name = draft.name.trim();
  const category = draft.category.trim();
  const priceMinor = rupeesToPaise(draft.price);
  if (!name) errors.name = "Enter the dish name.";
  else if (name.length > 80) errors.name = "Keep the name to 80 characters.";
  if (!category) errors.category = "Enter a category, such as Mains.";
  else if (category.length > 40) errors.category = "Keep the category to 40 characters.";
  if (priceMinor === null)
    errors.price = "Enter a price in rupees above zero, such as 285 or 285.50.";
  let prepMinutes: number | null = null;
  if (draft.prepMinutes.trim()) {
    prepMinutes = Number(draft.prepMinutes);
    if (!Number.isInteger(prepMinutes) || prepMinutes < 1 || prepMinutes > 120) {
      errors.prepMinutes = "Prep time is whole minutes from 1 to 120.";
    }
  }
  if (Object.keys(errors).length > 0) return { errors };

  const description = draft.description.trim();
  const allergenLabels = [
    ...new Set(
      draft.allergens
        .split(",")
        .map((label) => label.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const body: Record<string, unknown> = {
    name,
    category,
    priceMinor,
    dietaryLabels: draft.dietaryLabels,
    allergenLabels,
  };
  if (description) body.description = description;
  else if (editing) body.description = null;
  if (draft.prepStation) body.prepStation = draft.prepStation;
  else if (editing) body.prepStation = null;
  if (prepMinutes !== null) body.prepMinutes = prepMinutes;
  else if (editing) body.prepMinutes = null;
  return { body };
}

/** Items of one category, in menu order. */
export function itemsInCategory(menu: ManagedMenu, category: string): ManagedMenuItem[] {
  return menu.items.filter((item) => item.category === category);
}

function swap<T>(list: T[], index: number, offset: -1 | 1): T[] | null {
  const target = index + offset;
  if (index < 0 || target < 0 || target >= list.length) return null;
  const next = [...list];
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
}

/** The arrangement body after moving one category up or down, or null at an edge. */
export function moveCategory(
  menu: ManagedMenu,
  category: string,
  offset: -1 | 1,
): { categories: string[]; itemIds: string[] } | null {
  const categories = swap(menu.categories, menu.categories.indexOf(category), offset);
  if (!categories) return null;
  return {
    categories,
    itemIds: categories.flatMap((name) => itemsInCategory(menu, name).map((item) => item.id)),
  };
}

/** The arrangement body after moving one item within its category, or null at an edge. */
export function moveItem(
  menu: ManagedMenu,
  itemId: string,
  offset: -1 | 1,
): { categories: string[]; itemIds: string[] } | null {
  const item = menu.items.find((candidate) => candidate.id === itemId);
  if (!item) return null;
  const siblings = itemsInCategory(menu, item.category);
  const moved = swap(siblings, siblings.indexOf(item), offset);
  if (!moved) return null;
  return {
    categories: menu.categories,
    itemIds: menu.categories.flatMap((name) =>
      (name === item.category ? moved : itemsInCategory(menu, name)).map((entry) => entry.id),
    ),
  };
}
