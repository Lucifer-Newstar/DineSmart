import type { Db, ObjectId, WithId } from "mongodb";
import { COLLECTIONS, type MenuItemDocument, type RestaurantDocument } from "../database/schema.js";
import {
  MANAGED_MENU_LIMIT,
  type ManagedMenuItem,
  type MenuAdminRepository,
  type MenuItemInput,
  type MenuItemPatch,
  type MenuReader,
  type PublicMenu,
  type PublicMenuItem,
} from "./menu.types.js";

export const PUBLIC_MENU_LIMIT = 200;

/** Archived items are hidden everywhere; `null` also matches items created before archiving existed. */
const NOT_ARCHIVED = { archivedAt: null } as const;

function toManagedItem(document: WithId<MenuItemDocument>): ManagedMenuItem {
  return {
    id: document._id,
    name: document.name,
    ...(document.description === undefined ? {} : { description: document.description }),
    category: document.category,
    priceMinor: document.priceMinor,
    isAvailable: document.isAvailable,
    dietaryLabels: document.dietaryLabels ?? [],
    allergenLabels: document.allergenLabels ?? [],
    updatedAt: document.updatedAt,
  };
}

export class MongoMenuRepository implements MenuReader, MenuAdminRepository {
  private readonly menuItems;
  private readonly restaurants;

  constructor(db: Db) {
    this.menuItems = db.collection<MenuItemDocument>(COLLECTIONS.menuItems);
    this.restaurants = db.collection<RestaurantDocument>(COLLECTIONS.restaurants);
  }

  async getAvailableMenu(restaurantId: ObjectId): Promise<PublicMenu | null> {
    const restaurant = await this.restaurants.findOne(
      { _id: restaurantId, status: "active" },
      { projection: { _id: 1, name: 1, currency: 1 } },
    );
    if (!restaurant) return null;

    const documents = await this.menuItems
      .find({ restaurantId, isAvailable: true, ...NOT_ARCHIVED })
      .sort({ category: 1, name: 1, _id: 1 })
      .limit(PUBLIC_MENU_LIMIT + 1)
      .toArray();
    const truncated = documents.length > PUBLIC_MENU_LIMIT;
    const items: PublicMenuItem[] = documents.slice(0, PUBLIC_MENU_LIMIT).map((item) => ({
      id: item._id,
      name: item.name,
      ...(item.description === undefined ? {} : { description: item.description }),
      category: item.category,
      priceMinor: item.priceMinor,
      dietaryLabels: item.dietaryLabels ?? [],
      allergenLabels: item.allergenLabels ?? [],
    }));

    return {
      restaurant: { id: restaurant._id, name: restaurant.name, currency: restaurant.currency },
      items,
      truncated,
    };
  }

  async listManagedItems(
    restaurantId: ObjectId,
  ): Promise<{ items: ManagedMenuItem[]; truncated: boolean }> {
    const documents = await this.menuItems
      .find({ restaurantId, ...NOT_ARCHIVED })
      .sort({ category: 1, name: 1, _id: 1 })
      .limit(MANAGED_MENU_LIMIT + 1)
      .toArray();
    return {
      items: documents.slice(0, MANAGED_MENU_LIMIT).map(toManagedItem),
      truncated: documents.length > MANAGED_MENU_LIMIT,
    };
  }

  async findManagedItem(restaurantId: ObjectId, itemId: ObjectId): Promise<ManagedMenuItem | null> {
    const document = await this.menuItems.findOne({ _id: itemId, restaurantId, ...NOT_ARCHIVED });
    return document ? toManagedItem(document) : null;
  }

  async createItem(
    restaurantId: ObjectId,
    input: MenuItemInput,
    now: Date,
  ): Promise<ManagedMenuItem> {
    const document: MenuItemDocument = {
      restaurantId,
      category: input.category,
      name: input.name,
      ...(input.description === undefined ? {} : { description: input.description }),
      priceMinor: input.priceMinor,
      isAvailable: input.isAvailable,
      dietaryLabels: input.dietaryLabels,
      allergenLabels: input.allergenLabels,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.menuItems.insertOne(document);
    return toManagedItem({ ...document, _id: result.insertedId });
  }

  async updateItem(
    restaurantId: ObjectId,
    itemId: ObjectId,
    patch: MenuItemPatch,
    now: Date,
  ): Promise<ManagedMenuItem | null> {
    const set: Partial<MenuItemDocument> = { updatedAt: now };
    const unset: Record<string, ""> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.category !== undefined) set.category = patch.category;
    if (patch.priceMinor !== undefined) set.priceMinor = patch.priceMinor;
    if (patch.dietaryLabels !== undefined) set.dietaryLabels = patch.dietaryLabels;
    if (patch.allergenLabels !== undefined) set.allergenLabels = patch.allergenLabels;
    if (patch.description === null) unset.description = "";
    else if (patch.description !== undefined) set.description = patch.description;

    const updated = await this.menuItems.findOneAndUpdate(
      { _id: itemId, restaurantId, ...NOT_ARCHIVED },
      Object.keys(unset).length > 0 ? { $set: set, $unset: unset } : { $set: set },
      { returnDocument: "after" },
    );
    return updated ? toManagedItem(updated) : null;
  }

  async archiveItem(
    restaurantId: ObjectId,
    itemId: ObjectId,
    now: Date,
  ): Promise<ManagedMenuItem | null> {
    // Archived items also stop being orderable: ordering only reads available items.
    const previous = await this.menuItems.findOneAndUpdate(
      { _id: itemId, restaurantId, ...NOT_ARCHIVED },
      { $set: { archivedAt: now, isAvailable: false, updatedAt: now } },
      { returnDocument: "before" },
    );
    return previous ? toManagedItem(previous) : null;
  }
}
