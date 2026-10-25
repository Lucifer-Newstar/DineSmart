import type { ObjectId } from "mongodb";
import type { AuditRecorder } from "../audit/audit.service.js";
import type { AuditAction, AuditActor } from "../audit/audit.types.js";
import type { RestaurantRealtimePublisher } from "../realtime/realtime.types.js";
import type {
  ManagedMenuItem,
  ManagedMenuList,
  MenuAdminRepository,
  MenuItemInput,
  MenuItemPatch,
} from "./menu.types.js";

export class MenuError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MenuError";
  }
}

function notFound(): MenuError {
  return new MenuError(404, "menu_item_not_found", "The menu item was not found.");
}

/** The fields worth keeping in the audit log for a menu item. */
function auditView(item: ManagedMenuItem | null): Record<string, unknown> {
  if (!item) return {};
  return {
    name: item.name,
    category: item.category,
    priceMinor: item.priceMinor,
    isAvailable: item.isAvailable,
    description: item.description ?? null,
    dietaryLabels: item.dietaryLabels,
    allergenLabels: item.allergenLabels,
    optionGroups: item.optionGroups,
    prepStation: item.prepStation ?? null,
    prepMinutes: item.prepMinutes ?? null,
  };
}

/** Manager-side menu changes (S4-05). Every write is tenant scoped and audited. */
export class MenuAdminService {
  constructor(
    private readonly repository: MenuAdminRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly audit?: AuditRecorder,
    private readonly publish?: RestaurantRealtimePublisher,
  ) {}

  list(restaurantId: ObjectId): Promise<ManagedMenuList> {
    return this.repository.listManagedItems(restaurantId);
  }

  /**
   * Saves a new order for the whole menu. The request must name every live
   * item and category exactly once, so a manager working from a stale list
   * (another device added or archived an item) gets a 409 instead of a menu
   * with half-applied positions.
   */
  async arrange(
    restaurantId: ObjectId,
    categories: string[],
    itemIds: ObjectId[],
  ): Promise<ManagedMenuList> {
    const current = await this.repository.listManagedItems(restaurantId);
    const liveIds = new Set(current.items.map((item) => item.id.toHexString()));
    const requestedIds = new Set(itemIds.map((itemId) => itemId.toHexString()));
    const sameItems =
      !current.truncated &&
      requestedIds.size === itemIds.length &&
      requestedIds.size === liveIds.size &&
      [...requestedIds].every((itemId) => liveIds.has(itemId));
    const sameCategories =
      new Set(categories).size === categories.length &&
      categories.length === current.categories.length &&
      categories.every((category) => current.categories.includes(category));
    if (!sameItems || !sameCategories) {
      throw new MenuError(
        409,
        "menu_arrangement_stale",
        "The menu changed while you were arranging it. Reload it and try again.",
      );
    }
    await this.repository.arrange(restaurantId, categories, itemIds, this.clock());
    return this.repository.listManagedItems(restaurantId);
  }

  async create(
    restaurantId: ObjectId,
    input: MenuItemInput,
    actor?: AuditActor,
  ): Promise<ManagedMenuItem> {
    const item = await this.repository.createItem(restaurantId, input, this.clock());
    await this.record(restaurantId, actor, "menu.item_created", item, null, item);
    return item;
  }

  async update(
    restaurantId: ObjectId,
    itemId: ObjectId,
    patch: MenuItemPatch,
    actor?: AuditActor,
  ): Promise<ManagedMenuItem> {
    const before =
      this.audit && actor ? await this.repository.findManagedItem(restaurantId, itemId) : null;
    const item = await this.repository.updateItem(restaurantId, itemId, patch, this.clock());
    if (!item) throw notFound();
    await this.record(restaurantId, actor, "menu.item_updated", item, before, item);
    return item;
  }

  /**
   * Marks an item sold out (86) or back on. A real change is audited and
   * broadcast as `menu.availability` so open menus update without a reload;
   * repeating the current state is a no-op that sends nothing.
   */
  async setAvailability(
    restaurantId: ObjectId,
    itemId: ObjectId,
    isAvailable: boolean,
    actor?: AuditActor,
  ): Promise<ManagedMenuItem> {
    const now = this.clock();
    const previous = await this.repository.setAvailability(restaurantId, itemId, isAvailable, now);
    if (!previous) throw notFound();
    const item = { ...previous, isAvailable, updatedAt: now };
    if (previous.isAvailable === isAvailable) return item;

    await this.record(restaurantId, actor, "menu.availability_changed", item, previous, item);
    this.broadcastAvailability(restaurantId, item);
    return item;
  }

  async archive(restaurantId: ObjectId, itemId: ObjectId, actor?: AuditActor): Promise<void> {
    const previous = await this.repository.archiveItem(restaurantId, itemId, this.clock());
    if (!previous) throw notFound();
    await this.record(restaurantId, actor, "menu.item_archived", previous, previous, null);
    // An archived item can no longer be ordered, so open menus drop it like a sold-out one.
    if (previous.isAvailable)
      this.broadcastAvailability(restaurantId, { ...previous, isAvailable: false });
  }

  private broadcastAvailability(restaurantId: ObjectId, item: ManagedMenuItem): void {
    try {
      this.publish?.({
        event: "menu.availability",
        restaurantId,
        data: { menuItemId: item.id.toHexString(), isAvailable: item.isAvailable },
      });
    } catch {
      // Live updates are best effort; the next menu load shows the saved state.
    }
  }

  private async record(
    restaurantId: ObjectId,
    actor: AuditActor | undefined,
    action: AuditAction,
    target: ManagedMenuItem,
    before: ManagedMenuItem | null,
    after: ManagedMenuItem | null,
  ): Promise<void> {
    if (!this.audit || !actor) return;
    try {
      await this.audit({
        restaurantId,
        actor,
        action,
        target: { type: "menu_item", id: target.id, label: target.name },
        before: auditView(before),
        after: after ? auditView(after) : { archived: true },
      });
    } catch {
      // The change itself succeeded; a missing audit entry must not undo it.
      console.error("An audit log entry could not be written.");
    }
  }
}
