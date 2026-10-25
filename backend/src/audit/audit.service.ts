import type { ObjectId } from "mongodb";
import type {
  AuditAction,
  AuditActor,
  AuditEntry,
  AuditPage,
  AuditQuery,
  AuditRepository,
} from "./audit.types.js";

/** Field names that must never reach the audit log, whatever a caller passes. */
const SECRET_FIELD = /password|hash|token|secret|otp|code/i;

/**
 * Keeps only the fields whose value changed, drops secret-looking fields and
 * serialises ObjectIds and Dates so entries stay plain JSON.
 */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const plain = (value: unknown): unknown => {
    if (value instanceof Date) return value.toISOString();
    if (value && typeof value === "object" && "toHexString" in value) {
      return (value as ObjectId).toHexString();
    }
    return value;
  };
  const result = { before: {} as Record<string, unknown>, after: {} as Record<string, unknown> };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (SECRET_FIELD.test(key)) continue;
    const previous = plain(before[key]);
    const next = plain(after[key]);
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;
    result.before[key] = previous ?? null;
    result.after[key] = next ?? null;
  }
  return result;
}

export interface AuditChange {
  restaurantId: ObjectId;
  actor: AuditActor;
  action: AuditAction;
  target: { type: string; id: ObjectId; label?: string };
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

/** Records one sensitive change; a change with no differing field is skipped. */
export type AuditRecorder = (change: AuditChange) => Promise<void>;

export class AuditService {
  constructor(
    private readonly repository: AuditRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  readonly record: AuditRecorder = async (change) => {
    const diff = changedFields(change.before, change.after);
    if (Object.keys(diff.after).length === 0) return;
    await this.repository.insert({ ...change, ...diff }, this.clock());
  };

  list(restaurantId: ObjectId, query: AuditQuery): Promise<AuditPage> {
    return this.repository.listForRestaurant(restaurantId, query);
  }

  findById(restaurantId: ObjectId, id: ObjectId): Promise<AuditEntry | null> {
    return this.repository.findById(restaurantId, id);
  }
}
