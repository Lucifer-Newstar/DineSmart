import type { Db, ObjectId } from "mongodb";
import { COLLECTIONS, type RestaurantDocument, type TableDocument } from "../database/schema.js";
import { signTableToken, type TableTokenClaims, verifyTableToken } from "./table-token.js";

/** Issues, resolves and rotates the signed table links behind QR cards (S5-03). */

export interface QrTable {
  id: ObjectId;
  tableNumber: string;
  qrVersion: number;
}

export interface ResolvedTable {
  restaurantId: ObjectId;
  restaurantName: string;
  tableId: ObjectId;
  tableNumber: string;
}

export interface TableQrRepository {
  listTables(restaurantId: ObjectId): Promise<QrTable[]>;
  /** The table and its active restaurant, or null. */
  findTable(
    restaurantId: ObjectId,
    tableId: ObjectId,
  ): Promise<(QrTable & { restaurantName: string }) | null>;
  /** Increments the table's QR version; null when the table is not in this restaurant. */
  rotate(restaurantId: ObjectId, tableId: ObjectId, now: Date): Promise<QrTable | null>;
}

export class TableQrError extends Error {
  constructor(
    readonly statusCode: 400 | 404,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TableQrError";
  }
}

export const INVALID_TABLE_TOKEN = () =>
  new TableQrError(
    400,
    "invalid_table_token",
    "This table link is not valid. Ask a server for help.",
  );

export class TableQrService {
  constructor(
    private readonly repository: TableQrRepository,
    private readonly key: Buffer,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async issueAll(
    restaurantId: ObjectId,
  ): Promise<Array<{ tableId: ObjectId; tableNumber: string; token: string }>> {
    const issuedAt = this.clock();
    const tables = await this.repository.listTables(restaurantId);
    return tables.map((table) => ({
      tableId: table.id,
      tableNumber: table.tableNumber,
      token: signTableToken(
        { restaurantId, tableId: table.id, qrVersion: table.qrVersion, issuedAt },
        this.key,
      ),
    }));
  }

  /** Checks signature, age, table existence and QR version; throws a 400 when any fails. */
  async resolve(token: unknown): Promise<ResolvedTable> {
    const claims: TableTokenClaims | null = verifyTableToken(token, this.key, this.clock());
    if (!claims) throw INVALID_TABLE_TOKEN();
    const table = await this.repository.findTable(claims.restaurantId, claims.tableId);
    if (!table || table.qrVersion !== claims.qrVersion) throw INVALID_TABLE_TOKEN();
    return {
      restaurantId: claims.restaurantId,
      restaurantName: table.restaurantName,
      tableId: table.id,
      tableNumber: table.tableNumber,
    };
  }

  async rotate(
    restaurantId: ObjectId,
    tableId: ObjectId,
  ): Promise<{ tableId: ObjectId; tableNumber: string; token: string }> {
    const now = this.clock();
    const table = await this.repository.rotate(restaurantId, tableId, now);
    if (!table) throw new TableQrError(404, "table_not_found", "The table was not found.");
    return {
      tableId: table.id,
      tableNumber: table.tableNumber,
      token: signTableToken(
        { restaurantId, tableId: table.id, qrVersion: table.qrVersion, issuedAt: now },
        this.key,
      ),
    };
  }
}

export class MongoTableQrRepository implements TableQrRepository {
  private readonly tables;
  private readonly restaurants;

  constructor(db: Db) {
    this.tables = db.collection<TableDocument>(COLLECTIONS.tables);
    this.restaurants = db.collection<RestaurantDocument>(COLLECTIONS.restaurants);
  }

  async listTables(restaurantId: ObjectId): Promise<QrTable[]> {
    const documents = await this.tables
      .find({ restaurantId }, { projection: { tableNumber: 1, qrVersion: 1 } })
      .sort({ tableNumber: 1 })
      .limit(200)
      .toArray();
    return documents.map((table) => ({
      id: table._id,
      tableNumber: table.tableNumber,
      qrVersion: table.qrVersion ?? 0,
    }));
  }

  async findTable(restaurantId: ObjectId, tableId: ObjectId) {
    const [table, restaurant] = await Promise.all([
      this.tables.findOne(
        { _id: tableId, restaurantId },
        { projection: { tableNumber: 1, qrVersion: 1 } },
      ),
      this.restaurants.findOne(
        { _id: restaurantId, status: "active" },
        { projection: { name: 1 } },
      ),
    ]);
    if (!table || !restaurant) return null;
    return {
      id: table._id,
      tableNumber: table.tableNumber,
      qrVersion: table.qrVersion ?? 0,
      restaurantName: restaurant.name,
    };
  }

  async rotate(restaurantId: ObjectId, tableId: ObjectId, now: Date): Promise<QrTable | null> {
    const updated = await this.tables.findOneAndUpdate(
      { _id: tableId, restaurantId },
      { $inc: { qrVersion: 1 }, $set: { updatedAt: now } },
      { returnDocument: "after", includeResultMetadata: false },
    );
    if (!updated) return null;
    return { id: updated._id, tableNumber: updated.tableNumber, qrVersion: updated.qrVersion ?? 0 };
  }
}
