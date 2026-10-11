import type { Db, ObjectId } from "mongodb";
import { COLLECTIONS, type MenuItemDocument, type RestaurantDocument } from "../database/schema.js";
import type { MenuReader, PublicMenu, PublicMenuItem } from "./menu.types.js";

export const PUBLIC_MENU_LIMIT = 200;

export class MongoMenuRepository implements MenuReader {
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
      .find({ restaurantId, isAvailable: true })
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
}
