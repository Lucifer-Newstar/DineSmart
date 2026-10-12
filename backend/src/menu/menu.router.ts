import { type Request, type Response, Router } from "express";
import { ObjectId } from "mongodb";
import { createPublicJsonCompression } from "../http/response-compression.js";
import type { MenuReader } from "./menu.types.js";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export interface MenuRouterOptions {
  createReader: () => Promise<MenuReader>;
}

function sendUnavailable(response: Response): void {
  response.status(503).json({
    error: {
      code: "menu_unavailable",
      message: "The restaurant menu is temporarily unavailable.",
    },
  });
}

export function createMenuRouter(options: MenuRouterOptions) {
  const router = Router();

  // The public catalog is identical for every visitor and carries no tenant
  // secrets, so it is the one response that is safe to compress and cache.
  router.use(createPublicJsonCompression());

  router.get("/", async (request: Request, response: Response) => {
    const value = request.query.restaurantId;
    if (typeof value !== "string" || !OBJECT_ID_PATTERN.test(value)) {
      response.status(400).json({
        error: {
          code: "invalid_restaurant_id",
          message: "Provide one valid restaurant ID to browse its menu.",
        },
      });
      return;
    }

    try {
      const menu = await (await options.createReader()).getAvailableMenu(new ObjectId(value));
      if (!menu) {
        response.status(404).json({
          error: { code: "restaurant_not_found", message: "The restaurant was not found." },
        });
        return;
      }
      response.status(200).json({
        restaurant: {
          id: menu.restaurant.id.toHexString(),
          name: menu.restaurant.name,
          currency: menu.restaurant.currency,
        },
        items: menu.items.map((item) => ({
          id: item.id.toHexString(),
          name: item.name,
          ...(item.description === undefined ? {} : { description: item.description }),
          category: item.category,
          priceMinor: item.priceMinor,
          dietaryLabels: item.dietaryLabels,
          allergenLabels: item.allergenLabels,
        })),
        truncated: menu.truncated,
      });
    } catch {
      sendUnavailable(response);
    }
  });

  return router;
}
