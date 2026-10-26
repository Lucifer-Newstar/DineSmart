/** Data helpers for printable table QR cards (S5-03). */

export interface TableQrLink {
  tableId: string;
  tableNumber: string;
  token: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseQrLinks(payload: unknown): TableQrLink[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.tables)) return null;
  return payload.tables
    .flatMap((entry) =>
      isRecord(entry) &&
      typeof entry.tableId === "string" &&
      typeof entry.tableNumber === "string" &&
      typeof entry.token === "string" &&
      entry.token.startsWith("t1.")
        ? [{ tableId: entry.tableId, tableNumber: entry.tableNumber, token: entry.token }]
        : [],
    )
    .sort((left, right) =>
      left.tableNumber.localeCompare(right.tableNumber, "en", { numeric: true }),
    );
}

/** The link printed on the card; the menu reads `table` and asks the API which table it is. */
export function menuLinkFor(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/menu?table=${encodeURIComponent(token)}`;
}

/**
 * Turns a QR module matrix into one SVG path: a 1×1 square per dark module,
 * merged along each row so the path stays short.
 */
export function qrModulesPath(modules: readonly (readonly boolean[])[]): string {
  const parts: string[] = [];
  modules.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x += 1;
      parts.push(`M${start} ${y}h${x - start}v1h${start - x}z`);
    }
  });
  return parts.join("");
}
