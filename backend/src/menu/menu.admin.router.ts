import { type NextFunction, type Request, type Response, Router } from "express";
import { ObjectId } from "mongodb";
import { authenticateAccessToken } from "../auth/auth.middleware.js";
import type { AuthPrincipal } from "../auth/auth.service.js";
import { requirePermissions, requireRestaurantScope } from "../auth/authorization.middleware.js";
import { isObjectIdString, requireObjectIdParam } from "../http/object-id-param.js";
import { type MenuAdminService, MenuError } from "./menu.service.js";
import {
  MANAGED_MENU_LIMIT,
  type ManagedMenuItem,
  type ManagedMenuList,
  MENU_ALLERGEN_LABEL_MAX,
  MENU_ALLERGEN_MAX,
  MENU_CATEGORY_MAX,
  MENU_DESCRIPTION_MAX,
  MENU_DIETARY_LABELS,
  MENU_NAME_MAX,
  MENU_OPTION_CHOICES_MAX,
  MENU_OPTION_GROUPS_MAX,
  MENU_OPTION_ID_PATTERN,
  MENU_OPTION_LABEL_MAX,
  MENU_PREP_MINUTES_MAX,
  MENU_PREP_STATIONS,
  MENU_PRICE_MAX_MINOR,
  type MenuItemInput,
  type MenuItemPatch,
  type MenuOptionGroup,
  type MenuPrepStation,
} from "./menu.types.js";

export interface MenuAdminRuntime {
  service: Pick<
    MenuAdminService,
    "list" | "arrange" | "create" | "update" | "setAvailability" | "archive"
  >;
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
  "optionGroups",
  "prepStation",
  "prepMinutes",
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

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

/** Validates single-choice option groups such as size or spice level. */
export function parseOptionGroups(value: unknown): MenuOptionGroup[] | null {
  if (!Array.isArray(value) || value.length > MENU_OPTION_GROUPS_MAX) return null;
  const groups: MenuOptionGroup[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !hasOnlyKeys(entry, ["id", "name", "required", "choices"])) return null;
    const name = boundedText(entry.name, MENU_OPTION_LABEL_MAX);
    if (
      typeof entry.id !== "string" ||
      !MENU_OPTION_ID_PATTERN.test(entry.id) ||
      groups.some((group) => group.id === entry.id) ||
      !name ||
      typeof entry.required !== "boolean" ||
      !Array.isArray(entry.choices) ||
      entry.choices.length < 1 ||
      entry.choices.length > MENU_OPTION_CHOICES_MAX
    ) {
      return null;
    }
    const choices: MenuOptionGroup["choices"] = [];
    for (const choice of entry.choices) {
      if (!isRecord(choice) || !hasOnlyKeys(choice, ["id", "label", "priceDeltaMinor"]))
        return null;
      const label = boundedText(choice.label, MENU_OPTION_LABEL_MAX);
      const delta = choice.priceDeltaMinor ?? 0;
      if (
        typeof choice.id !== "string" ||
        !MENU_OPTION_ID_PATTERN.test(choice.id) ||
        choices.some((existing) => existing.id === choice.id) ||
        !label ||
        typeof delta !== "number" ||
        !Number.isSafeInteger(delta) ||
        delta < 0 ||
        delta > MENU_PRICE_MAX_MINOR
      ) {
        return null;
      }
      choices.push({ id: choice.id, label, priceDeltaMinor: delta });
    }
    groups.push({ id: entry.id, name, required: entry.required, choices });
  }
  return groups;
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
  if (value.optionGroups !== undefined || !partial) {
    const groups = parseOptionGroups(value.optionGroups ?? []);
    if (!groups) {
      return {
        ok: false,
        message: `Options: at most ${MENU_OPTION_GROUPS_MAX} groups of 1 to ${MENU_OPTION_CHOICES_MAX} choices, each with a lowercase id, a name and a price delta of zero or more.`,
      };
    }
    result.optionGroups = groups;
  }
  if (value.prepStation !== undefined) {
    if (value.prepStation === null) {
      if (partial) result.prepStation = null;
    } else if (
      typeof value.prepStation !== "string" ||
      !(MENU_PREP_STATIONS as readonly string[]).includes(value.prepStation)
    ) {
      return {
        ok: false,
        message: `Prep station must be one of: ${MENU_PREP_STATIONS.join(", ")}.`,
      };
    } else {
      result.prepStation = value.prepStation as MenuPrepStation;
    }
  }
  if (value.prepMinutes !== undefined) {
    if (value.prepMinutes === null) {
      if (partial) result.prepMinutes = null;
    } else if (
      typeof value.prepMinutes !== "number" ||
      !Number.isInteger(value.prepMinutes) ||
      value.prepMinutes < 1 ||
      value.prepMinutes > MENU_PREP_MINUTES_MAX
    ) {
      return {
        ok: false,
        message: `Prep minutes must be a whole number from 1 to ${MENU_PREP_MINUTES_MAX}.`,
      };
    } else {
      result.prepMinutes = value.prepMinutes;
    }
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
    optionGroups: item.optionGroups,
    ...(item.prepStation === undefined ? {} : { prepStation: item.prepStation }),
    ...(item.prepMinutes === undefined ? {} : { prepMinutes: item.prepMinutes }),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeManagedList(list: ManagedMenuList) {
  return {
    categories: list.categories,
    items: list.items.map(serializeManagedItem),
    truncated: list.truncated,
  };
}

function parseArrangement(value: unknown): { categories: string[]; itemIds: ObjectId[] } | null {
  if (!isRecord(value) || Object.keys(value).length !== 2) return null;
  const { categories, itemIds } = value;
  if (
    !Array.isArray(categories) ||
    categories.length > MANAGED_MENU_LIMIT ||
    !categories.every(
      (category) => typeof category === "string" && category.length <= MENU_CATEGORY_MAX,
    ) ||
    !Array.isArray(itemIds) ||
    itemIds.length > MANAGED_MENU_LIMIT ||
    !itemIds.every(isObjectIdString)
  ) {
    return null;
  }
  return { categories, itemIds: itemIds.map((itemId) => new ObjectId(itemId)) };
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
      response.status(200).json(serializeManagedList(result));
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

  router.put("/arrangement", async (request: Request, response: Response) => {
    const context = scope(request, response);
    if (!context) return;
    const arrangement = parseArrangement(request.body);
    if (!arrangement) {
      response.status(400).json({
        error: {
          code: "invalid_menu_arrangement",
          message: "Send categories and itemIds, each listed once in the new order.",
        },
      });
      return;
    }
    try {
      const result = await context.runtime.service.arrange(
        context.restaurantId,
        arrangement.categories,
        arrangement.itemIds,
      );
      response.status(200).json(serializeManagedList(result));
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
