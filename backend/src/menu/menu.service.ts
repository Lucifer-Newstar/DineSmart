import type { ObjectId } from "mongodb";
import type { AuditRecorder } from "../audit/audit.service.js";
import type { AuditAction, AuditActor } from "../audit/audit.types.js";
import type {
  ManagedMenuItem,
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
  };
}

/** Manager-side menu changes (S4-05). Every write is tenant scoped and audited. */
export class MenuAdminService {
  constructor(
    private readonly repository: MenuAdminRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly audit?: AuditRecorder,
  ) {}

  list(restaurantId: ObjectId): Promise<{ items: ManagedMenuItem[]; truncated: boolean }> {
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

  async archive(restaurantId: ObjectId, itemId: ObjectId, actor?: AuditActor): Promise<void> {
    const previous = await this.repository.archiveItem(restaurantId, itemId, this.clock());
    if (!previous) throw notFound();
    await this.record(restaurantId, actor, "menu.item_archived", previous, previous, null);
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
