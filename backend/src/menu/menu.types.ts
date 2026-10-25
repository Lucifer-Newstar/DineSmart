import type { ObjectId } from "mongodb";

export interface PublicMenuRestaurant {
  id: ObjectId;
  name: string;
  currency: string;
}

export interface PublicMenuItem {
  id: ObjectId;
  name: string;
  description?: string;
  category: string;
  priceMinor: number;
  /** False while the item is 86'd: shown greyed out, never orderable. */
  isAvailable: boolean;
  dietaryLabels: string[];
  allergenLabels: string[];
}

export interface PublicMenu {
  restaurant: PublicMenuRestaurant;
  /** Category names in display order. */
  categories: string[];
  items: PublicMenuItem[];
  truncated: boolean;
}

export interface MenuReader {
  /** The live (not archived) menu of an active restaurant, sold-out items included and flagged. */
  getAvailableMenu(restaurantId: ObjectId): Promise<PublicMenu | null>;
}

/** Labels a manager may attach to an item; the customer menu filters on them. */
export const MENU_DIETARY_LABELS = [
  "vegetarian",
  "vegan",
  "jain",
  "gluten-free",
  "contains-egg",
  "non-vegetarian",
] as const;

export type MenuDietaryLabel = (typeof MENU_DIETARY_LABELS)[number];

export const MENU_NAME_MAX = 80;
export const MENU_CATEGORY_MAX = 40;
export const MENU_DESCRIPTION_MAX = 280;
export const MENU_ALLERGEN_MAX = 10;
export const MENU_ALLERGEN_LABEL_MAX = 30;
/** ₹1,00,000 in paise: far above any dish, low enough to catch a typo in minor units. */
export const MENU_PRICE_MAX_MINOR = 10_000_000;
export const MANAGED_MENU_LIMIT = 300;

/** The manager's view of an item: unlike the public menu it includes sold-out items. */
export interface ManagedMenuItem {
  id: ObjectId;
  name: string;
  description?: string;
  category: string;
  priceMinor: number;
  isAvailable: boolean;
  dietaryLabels: string[];
  allergenLabels: string[];
  updatedAt: Date;
}

export interface ManagedMenuList {
  /** Category names in display order. */
  categories: string[];
  items: ManagedMenuItem[];
  truncated: boolean;
}

export interface MenuItemInput {
  name: string;
  description?: string;
  category: string;
  priceMinor: number;
  isAvailable: boolean;
  dietaryLabels: string[];
  allergenLabels: string[];
}

/** A partial edit; `description: null` clears the description. */
export interface MenuItemPatch {
  name?: string;
  description?: string | null;
  category?: string;
  priceMinor?: number;
  dietaryLabels?: string[];
  allergenLabels?: string[];
}

export interface MenuAdminRepository {
  listManagedItems(restaurantId: ObjectId): Promise<ManagedMenuList>;
  findManagedItem(restaurantId: ObjectId, itemId: ObjectId): Promise<ManagedMenuItem | null>;
  createItem(restaurantId: ObjectId, input: MenuItemInput, now: Date): Promise<ManagedMenuItem>;
  /** Returns the updated item, or null when it does not exist, is archived or is another tenant's. */
  updateItem(
    restaurantId: ObjectId,
    itemId: ObjectId,
    patch: MenuItemPatch,
    now: Date,
  ): Promise<ManagedMenuItem | null>;
  /** Sets the 86 flag; returns the item as it was before, or null when it is not a live item. */
  setAvailability(
    restaurantId: ObjectId,
    itemId: ObjectId,
    isAvailable: boolean,
    now: Date,
  ): Promise<ManagedMenuItem | null>;
  /** Saves the category order and gives the listed live items positions in list order. */
  arrange(
    restaurantId: ObjectId,
    categories: string[],
    itemIds: ObjectId[],
    now: Date,
  ): Promise<void>;
  /** Archives a live item and returns it as it was, or null when there is nothing to archive. */
  archiveItem(restaurantId: ObjectId, itemId: ObjectId, now: Date): Promise<ManagedMenuItem | null>;
}

/**
 * Orders items for display: categories follow the saved order (unknown ones
 * after it, in the order they first appear), and items keep their incoming
 * order, which the database already sorted by position, inside each category.
 */
export function arrangeMenu<T extends { category: string }>(
  items: T[],
  savedCategoryOrder: readonly string[] = [],
): { categories: string[]; items: T[] } {
  const present: string[] = [];
  for (const item of items) if (!present.includes(item.category)) present.push(item.category);
  const categories = [
    ...savedCategoryOrder.filter((category) => present.includes(category)),
    ...present.filter((category) => !savedCategoryOrder.includes(category)),
  ];
  const rank = new Map(categories.map((category, index) => [category, index]));
  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        (rank.get(left.item.category) ?? 0) - (rank.get(right.item.category) ?? 0) ||
        left.index - right.index,
    )
    .map(({ item }) => item);
  return { categories, items: ordered };
}
