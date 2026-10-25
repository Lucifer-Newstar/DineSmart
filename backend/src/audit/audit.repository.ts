import type { Db, Filter, ObjectId } from "mongodb";
import { type AuditLogDocument, COLLECTIONS } from "../database/schema.js";
import type {
  AuditAction,
  AuditEntry,
  AuditEntryInput,
  AuditPage,
  AuditQuery,
  AuditRepository,
} from "./audit.types.js";

function toEntry(document: AuditLogDocument & { _id: ObjectId }): AuditEntry {
  return {
    id: document._id,
    restaurantId: document.restaurantId,
    actor: { userId: document.actorUserId, role: document.actorRole },
    action: document.action as AuditAction,
    target: document.target,
    before: document.before,
    after: document.after,
    createdAt: document.createdAt,
  };
}

/** Append-only store; every read is filtered by restaurantId first. */
export class MongoAuditRepository implements AuditRepository {
  constructor(private readonly db: Db) {}

  private get collection() {
    return this.db.collection<AuditLogDocument>(COLLECTIONS.auditLogs);
  }

  async insert(entry: AuditEntryInput, createdAt: Date): Promise<AuditEntry> {
    const document: AuditLogDocument = {
      restaurantId: entry.restaurantId,
      actorUserId: entry.actor.userId,
      actorRole: entry.actor.role,
      action: entry.action,
      target: entry.target,
      before: entry.before,
      after: entry.after,
      createdAt,
    };
    const result = await this.collection.insertOne(document);
    return toEntry({ ...document, _id: result.insertedId });
  }

  async findById(restaurantId: ObjectId, id: ObjectId): Promise<AuditEntry | null> {
    const document = await this.collection.findOne({ _id: id, restaurantId });
    return document ? toEntry(document as AuditLogDocument & { _id: ObjectId }) : null;
  }

  async listForRestaurant(restaurantId: ObjectId, query: AuditQuery): Promise<AuditPage> {
    const filter: Filter<AuditLogDocument> = { restaurantId };
    if (query.action) filter.action = query.action;
    if (query.before) {
      filter.$or = [
        { createdAt: { $lt: query.before.createdAt } },
        { createdAt: query.before.createdAt, _id: { $lt: query.before.id } },
      ];
    }
    const documents = await this.collection
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(query.limit + 1)
      .toArray();
    return {
      entries: documents
        .slice(0, query.limit)
        .map((document) => toEntry(document as AuditLogDocument & { _id: ObjectId })),
      hasMore: documents.length > query.limit,
    };
  }
}
