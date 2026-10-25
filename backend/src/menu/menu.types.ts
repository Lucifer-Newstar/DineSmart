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
  dietaryLabels: string[];
  allergenLabels: string[];
}

export interface PublicMenu {
  restaurant: PublicMenuRestaurant;
  items: PublicMenuItem[];
  truncated: boolean;
}

export interface MenuReader {
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
  listManagedItems(
    restaurantId: ObjectId,
  ): Promise<{ items: ManagedMenuItem[]; truncated: boolean }>;
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
  /** Archives a live item and returns it as it was, or null when there is nothing to archive. */
  archiveItem(restaurantId: ObjectId, itemId: ObjectId, now: Date): Promise<ManagedMenuItem | null>;
}
