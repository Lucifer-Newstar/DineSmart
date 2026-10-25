import type { Db, ObjectId, WithId } from "mongodb";
import { COLLECTIONS, type MenuItemDocument, type RestaurantDocument } from "../database/schema.js";
import {
  arrangeMenu,
  MANAGED_MENU_LIMIT,
  type ManagedMenuItem,
  type ManagedMenuList,
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
/** Saved position first; items never arranged fall back to name order. */
const MENU_SORT = { sortPosition: 1, name: 1, _id: 1 } as const;

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
      { projection: { _id: 1, name: 1, currency: 1, menuCategoryOrder: 1 } },
    );
    if (!restaurant) return null;

    const documents = await this.menuItems
      .find({ restaurantId, ...NOT_ARCHIVED })
      .sort(MENU_SORT)
      .limit(PUBLIC_MENU_LIMIT + 1)
      .toArray();
    const truncated = documents.length > PUBLIC_MENU_LIMIT;
    const items: PublicMenuItem[] = documents.slice(0, PUBLIC_MENU_LIMIT).map((item) => ({
      id: item._id,
      name: item.name,
      ...(item.description === undefined ? {} : { description: item.description }),
      category: item.category,
      priceMinor: item.priceMinor,
      isAvailable: item.isAvailable,
      dietaryLabels: item.dietaryLabels ?? [],
      allergenLabels: item.allergenLabels ?? [],
    }));

    const arranged = arrangeMenu(items, restaurant.menuCategoryOrder);
    return {
      restaurant: { id: restaurant._id, name: restaurant.name, currency: restaurant.currency },
      categories: arranged.categories,
      items: arranged.items,
      truncated,
    };
  }

  async listManagedItems(restaurantId: ObjectId): Promise<ManagedMenuList> {
    const [restaurant, documents] = await Promise.all([
      this.restaurants.findOne({ _id: restaurantId }, { projection: { menuCategoryOrder: 1 } }),
      this.menuItems
        .find({ restaurantId, ...NOT_ARCHIVED })
        .sort(MENU_SORT)
        .limit(MANAGED_MENU_LIMIT + 1)
        .toArray(),
    ]);
    const arranged = arrangeMenu(
      documents.slice(0, MANAGED_MENU_LIMIT).map(toManagedItem),
      restaurant?.menuCategoryOrder,
    );
    return { ...arranged, truncated: documents.length > MANAGED_MENU_LIMIT };
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
    // New items go to the end of the menu until a manager moves them.
    const [last] = await this.menuItems
      .find({ restaurantId }, { projection: { sortPosition: 1 } })
      .sort({ sortPosition: -1 })
      .limit(1)
      .toArray();
    document.sortPosition = (last?.sortPosition ?? -1) + 1;
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

  async setAvailability(
    restaurantId: ObjectId,
    itemId: ObjectId,
    isAvailable: boolean,
    now: Date,
  ): Promise<ManagedMenuItem | null> {
    const previous = await this.menuItems.findOneAndUpdate(
      { _id: itemId, restaurantId, ...NOT_ARCHIVED },
      { $set: { isAvailable, updatedAt: now } },
      { returnDocument: "before" },
    );
    return previous ? toManagedItem(previous) : null;
  }

  async arrange(
    restaurantId: ObjectId,
    categories: string[],
    itemIds: ObjectId[],
    now: Date,
  ): Promise<void> {
    if (itemIds.length > 0) {
      await this.menuItems.bulkWrite(
        itemIds.map((itemId, index) => ({
          updateOne: {
            filter: { _id: itemId, restaurantId, ...NOT_ARCHIVED },
            update: { $set: { sortPosition: index, updatedAt: now } },
          },
        })),
        { ordered: false },
      );
    }
    await this.restaurants.updateOne(
      { _id: restaurantId },
      { $set: { menuCategoryOrder: categories, updatedAt: now } },
    );
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
