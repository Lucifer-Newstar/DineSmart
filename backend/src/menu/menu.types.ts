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
