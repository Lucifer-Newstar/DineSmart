import { createHmac, timingSafeEqual } from "node:crypto";
import { ObjectId } from "mongodb";

/**
 * Signed table tokens for QR dine-in ordering (S5-03).
 *
 * A token names one restaurant and one table, the table's QR version and when
 * it was issued, followed by a truncated HMAC-SHA256 signature:
 *
 *   t1.<restaurantId>.<tableId>.<qrVersion>.<issuedAt base36 seconds>.<signature>
 *
 * Changing the signing secret invalidates every printed card; bumping one
 * table's QR version invalidates only that table's card.
 */

export const TABLE_TOKEN_PREFIX = "t1";
/** Printed cards stay valid for a year unless rotated sooner. */
export const TABLE_TOKEN_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1_000;
const SIGNATURE_BYTES = 16;
const TOKEN_PATTERN =
  /^t1\.([a-f\d]{24})\.([a-f\d]{24})\.(\d{1,6})\.([a-z\d]{1,10})\.([A-Za-z0-9_-]{22})$/;
const KEY_LABEL = "dinesmart:table-qr:v1";

export interface TableTokenClaims {
  restaurantId: ObjectId;
  tableId: ObjectId;
  qrVersion: number;
  issuedAt: Date;
}

/**
 * Derives the signing key. TABLE_QR_SECRET wins when set; otherwise the key is
 * derived from the JWT secret under its own label, so the two never coincide.
 */
export function tableTokenKey(secret: string): Buffer {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("The table QR secret must contain at least 32 bytes.");
  }
  return createHmac("sha256", secret).update(KEY_LABEL).digest();
}

function signature(key: Buffer, payload: string): string {
  return createHmac("sha256", key)
    .update(payload)
    .digest()
    .subarray(0, SIGNATURE_BYTES)
    .toString("base64url");
}

export function signTableToken(claims: TableTokenClaims, key: Buffer): string {
  if (
    !Number.isSafeInteger(claims.qrVersion) ||
    claims.qrVersion < 0 ||
    claims.qrVersion > 999_999
  ) {
    throw new Error("A table QR version must be a whole number from 0 to 999999.");
  }
  const payload = [
    TABLE_TOKEN_PREFIX,
    claims.restaurantId.toHexString(),
    claims.tableId.toHexString(),
    String(claims.qrVersion),
    Math.floor(claims.issuedAt.getTime() / 1_000).toString(36),
  ].join(".");
  return `${payload}.${signature(key, payload)}`;
}

/** Returns the claims of a well-formed, correctly signed, unexpired token; otherwise null. */
export function verifyTableToken(
  token: unknown,
  key: Buffer,
  now: Date,
  maxAgeMs = TABLE_TOKEN_MAX_AGE_MS,
): TableTokenClaims | null {
  if (typeof token !== "string" || token.length > 120) return null;
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return null;
  const [, restaurantHex, tableHex, version, issued, given] = match;
  const payload = token.slice(0, token.lastIndexOf("."));
  const expected = Buffer.from(signature(key, payload));
  const received = Buffer.from(given ?? "");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  const issuedAt = new Date(Number.parseInt(issued ?? "", 36) * 1_000);
  const age = now.getTime() - issuedAt.getTime();
  // A small allowance for clock drift between servers.
  if (!Number.isFinite(age) || age > maxAgeMs || age < -5 * 60_000) return null;
  return {
    restaurantId: new ObjectId(restaurantHex),
    tableId: new ObjectId(tableHex),
    qrVersion: Number(version),
    issuedAt,
  };
}
