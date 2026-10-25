import { type NextFunction, type Request, type Response, Router } from "express";
import { ObjectId } from "mongodb";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthPrincipal } from "../auth/auth.service.js";
import { requirePermissions, requireRestaurantScope } from "../auth/authorization.middleware.js";
import { requireObjectIdParam } from "../http/object-id-param.js";
import { type MenuAdminService, MenuError } from "./menu.service.js";
import {
  type ManagedMenuItem,
  MENU_ALLERGEN_LABEL_MAX,
  MENU_ALLERGEN_MAX,
  MENU_CATEGORY_MAX,
  MENU_DESCRIPTION_MAX,
  MENU_DIETARY_LABELS,
  MENU_NAME_MAX,
  MENU_PRICE_MAX_MINOR,
  type MenuItemInput,
  type MenuItemPatch,
} from "./menu.types.js";

export interface MenuAdminRuntime {
  service: Pick<MenuAdminService, "list" | "create" | "update" | "setAvailability" | "archive">;
  verifyAccessToken: (token: string) => Promise<AuthPrincipal>;
}

export interface MenuAdminRouterOptions {
  createRuntime: () => Promise<MenuAdminRuntime>;
}

const ITEM_FIELDS = new Set([
  "name",
  "description",
  "category",
  "priceMinor",
  "isAvailable",
  "dietaryLabels",
  "allergenLabels",
]);
const PATCH_FIELDS = new Set([...ITEM_FIELDS].filter((field) => field !== "isAvailable"));
const DIETARY = new Set<string>(MENU_DIETARY_LABELS);

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length >= 1 && trimmed.length <= max ? trimmed : null;
}

function parseDietary(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > DIETARY.size) return null;
  const labels = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || !DIETARY.has(entry)) return null;
    labels.add(entry);
  }
  return [...labels];
}

function parseAllergens(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MENU_ALLERGEN_MAX) return null;
  const labels = new Set<string>();
  for (const entry of value) {
    const label = boundedText(entry, MENU_ALLERGEN_LABEL_MAX)?.toLowerCase();
    if (!label) return null;
    labels.add(label);
  }
  return [...labels];
}

function isPrice(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MENU_PRICE_MAX_MINOR
  );
}

/** Validates a create (`partial` false) or an edit (`partial` true) body. */
export function parseMenuItemBody(value: unknown, partial: false): Parsed<MenuItemInput>;
export function parseMenuItemBody(value: unknown, partial: true): Parsed<MenuItemPatch>;
export function parseMenuItemBody(
  value: unknown,
  partial: boolean,
): Parsed<MenuItemInput | MenuItemPatch> {
  if (!isRecord(value)) return { ok: false, message: "Send the menu item as a JSON object." };
  const allowed = partial ? PATCH_FIELDS : ITEM_FIELDS;
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) return { ok: false, message: `The field "${unknown}" cannot be set here.` };
  if (partial && Object.keys(value).length === 0) {
    return { ok: false, message: "Send at least one field to change." };
  }

  const result: MenuItemPatch & { isAvailable?: boolean } = {};
  if (value.name !== undefined || !partial) {
    const name = boundedText(value.name, MENU_NAME_MAX);
    if (!name) return { ok: false, message: `Name must be 1 to ${MENU_NAME_MAX} characters.` };
    result.name = name;
  }
  if (value.category !== undefined || !partial) {
    const category = boundedText(value.category, MENU_CATEGORY_MAX);
    if (!category) {
      return { ok: false, message: `Category must be 1 to ${MENU_CATEGORY_MAX} characters.` };
    }
    result.category = category;
  }
  if (value.priceMinor !== undefined || !partial) {
    if (!isPrice(value.priceMinor)) {
      return {
        ok: false,
        message: "Price must be a whole number of paise above zero and at most 1,00,000 rupees.",
      };
    }
    result.priceMinor = value.priceMinor;
  }
  if (value.description !== undefined) {
    if (value.description === null || value.description === "") {
      if (partial) result.description = null;
    } else {
      const description = boundedText(value.description, MENU_DESCRIPTION_MAX);
      if (!description) {
        return {
          ok: false,
          message: `Description must be at most ${MENU_DESCRIPTION_MAX} characters.`,
        };
      }
      result.description = description;
    }
  }
  if (value.dietaryLabels !== undefined || !partial) {
    const labels = parseDietary(value.dietaryLabels ?? []);
    if (!labels) {
      return {
        ok: false,
        message: `Dietary labels must be from: ${MENU_DIETARY_LABELS.join(", ")}.`,
      };
    }
    result.dietaryLabels = labels;
  }
  if (value.allergenLabels !== undefined || !partial) {
    const labels = parseAllergens(value.allergenLabels ?? []);
    if (!labels) {
      return {
        ok: false,
        message: `List at most ${MENU_ALLERGEN_MAX} allergens of up to ${MENU_ALLERGEN_LABEL_MAX} characters.`,
      };
    }
    result.allergenLabels = labels;
  }
  if (!partial) {
    if (value.isAvailable !== undefined && typeof value.isAvailable !== "boolean") {
      return { ok: false, message: "isAvailable must be true or false." };
    }
    result.isAvailable = value.isAvailable ?? true;
  }
  return { ok: true, value: result as MenuItemInput | MenuItemPatch };
}

export function serializeManagedItem(item: ManagedMenuItem) {
  return {
    id: item.id.toHexString(),
    name: item.name,
    ...(item.description === undefined ? {} : { description: item.description }),
    category: item.category,
    priceMinor: item.priceMinor,
    isAvailable: item.isAvailable,
    dietaryLabels: item.dietaryLabels,
    allergenLabels: item.allergenLabels,
    updatedAt: item.updatedAt.toISOString(),
  };
}

function sendUnavailable(response: Response): void {
  response.status(503).json({
    error: { code: "menu_unavailable", message: "Menu management is temporarily unavailable." },
  });
}

function sendMenuError(error: unknown, response: Response): void {
  if (error instanceof MenuError) {
    response.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
    return;
  }
  sendUnavailable(response);
}

function sendInvalid(response: Response, message: string): void {
  response.status(400).json({ error: { code: "invalid_menu_item", message } });
}

interface Scope {
  runtime: MenuAdminRuntime;
  restaurantId: ObjectId;
  actor: { userId: ObjectId; role: AuthPrincipal["role"] };
}

/**
 * Manager menu routes (S4-05), mounted at /api/v1/menu/items. Reading the full
 * list and every write need `menu:write`, which only Managers and
 * Administrators hold, and are always scoped to the caller's restaurant.
 */
export function createMenuAdminRouter(options: MenuAdminRouterOptions): Router {
  const router = Router();
  const runtimes = new WeakMap<Request, MenuAdminRuntime>();

  router.use(async (request: Request, response: Response, next: NextFunction) => {
    try {
      const runtime = await options.createRuntime();
      runtimes.set(request, runtime);
      authenticateAccessToken(runtime.verifyAccessToken)(request, response, next);
    } catch {
      sendUnavailable(response);
    }
  });
  router.use(requirePermissions("menu:write"), requireRestaurantScope());

  function scope(request: Request, response: Response): Scope | null {
    const runtime = runtimes.get(request);
    const auth = request.auth;
    if (!runtime || !auth?.restaurantId) {
      response.status(401).json({
        error: { code: "missing_access_token", message: "Authentication is required." },
      });
      return null;
    }
    return {
      runtime,
      restaurantId: new ObjectId(auth.restaurantId),
      actor: { userId: new ObjectId(auth.userId), role: auth.role },
    };
  }

  function itemId(request: Request): ObjectId {
    const raw = request.params.id;
    return new ObjectId(Array.isArray(raw) ? raw[0] : raw);
  }

  const requireItemId = requireObjectIdParam(
    "id",
    "invalid_menu_item_id",
    "A valid menu item ID is required.",
  );

  router.get("/", async (request: Request, response: Response) => {
    const context = scope(request, response);
    if (!context) return;
    try {
      const result = await context.runtime.service.list(context.restaurantId);
      response.status(200).json({
        items: result.items.map(serializeManagedItem),
        truncated: result.truncated,
      });
    } catch (error) {
      sendMenuError(error, response);
    }
  });

  router.post("/", async (request: Request, response: Response) => {
    const context = scope(request, response);
    if (!context) return;
    const parsed = parseMenuItemBody(request.body, false);
    if (!parsed.ok) {
      sendInvalid(response, parsed.message);
      return;
    }
    try {
      const item = await context.runtime.service.create(
        context.restaurantId,
        parsed.value,
        context.actor,
      );
      response.status(201).json({ item: serializeManagedItem(item) });
    } catch (error) {
      sendMenuError(error, response);
    }
  });

  router.patch("/:id", requireItemId, async (request: Request, response: Response) => {
    const context = scope(request, response);
    if (!context) return;
    const parsed = parseMenuItemBody(request.body, true);
    if (!parsed.ok) {
      sendInvalid(response, parsed.message);
      return;
    }
    try {
      const item = await context.runtime.service.update(
        context.restaurantId,
        itemId(request),
        parsed.value,
        context.actor,
      );
      response.status(200).json({ item: serializeManagedItem(item) });
    } catch (error) {
      sendMenuError(error, response);
    }
  });

  router.patch("/:id/availability", requireItemId, async (request: Request, response: Response) => {
    const context = scope(request, response);
    if (!context) return;
    const body: unknown = request.body;
    if (
      !isRecord(body) ||
      Object.keys(body).length !== 1 ||
      typeof body.isAvailable !== "boolean"
    ) {
      response.status(400).json({
        error: {
          code: "invalid_menu_availability",
          message: "Send only isAvailable as true or false.",
        },
      });
      return;
    }
    try {
      const item = await context.runtime.service.setAvailability(
        context.restaurantId,
        itemId(request),
        body.isAvailable,
        context.actor,
      );
      response.status(200).json({ item: serializeManagedItem(item) });
    } catch (error) {
      sendMenuError(error, response);
    }
  });

  router.delete("/:id", requireItemId, async (request: Request, response: Response) => {
    const context = scope(request, response);
    if (!context) return;
    try {
      await context.runtime.service.archive(context.restaurantId, itemId(request), context.actor);
      response.status(204).end();
    } catch (error) {
      sendMenuError(error, response);
    }
  });

  return router;
}
