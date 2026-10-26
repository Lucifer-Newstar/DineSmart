/** Dine-in mode for the menu, opened from a table's QR card (S5-03). */

export const DINE_IN_STORAGE_KEY = "dinesmart.dine-in-table";
const TOKEN_PATTERN = /^t1\.[a-f\d]{24}\.[a-f\d]{24}\.\d{1,6}\.[a-z\d]{1,10}\.[A-Za-z0-9_-]{22}$/;

export interface DineInTable {
  token: string;
  restaurantId: string;
  tableId: string;
  tableNumber: string;
}

/** The `table` query value when it looks like a table token; otherwise null. */
export function tableTokenFromSearch(search: string): string | null {
  const token = new URLSearchParams(search).get("table");
  return token && TOKEN_PATTERN.test(token) ? token : null;
}

export function isTableToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads GET /tables/qr/resolve; the token is kept so the order can carry it. */
export function parseResolvedTable(payload: unknown, token: string): DineInTable | null {
  const table = isRecord(payload) ? payload.table : null;
  if (
    !isRecord(table) ||
    typeof table.restaurantId !== "string" ||
    typeof table.tableId !== "string" ||
    typeof table.tableNumber !== "string" ||
    !table.tableNumber
  ) {
    return null;
  }
  return {
    token,
    restaurantId: table.restaurantId,
    tableId: table.tableId,
    tableNumber: table.tableNumber,
  };
}

/** The order body; a dine-in order adds the table token. */
export function orderBody<T>(restaurantId: string, items: T[], table: DineInTable | null) {
  return {
    restaurantId,
    items,
    ...(table && table.restaurantId.toLowerCase() === restaurantId.toLowerCase()
      ? { tableToken: table.token }
      : {}),
  };
}
