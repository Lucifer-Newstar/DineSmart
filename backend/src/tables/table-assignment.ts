/**
 * Best-fit table suggestion for seating a booking (S5-01).
 *
 * Pure: the caller passes the tables and which of them are already held for the
 * booking's time. The smallest free table that seats the party wins, so larger
 * tables stay open for larger parties. When no single table fits, the smallest
 * pair of free tables in the same zone is offered as a combination. Tables that are
 * occupied right now are skipped only when the party is about to sit (`skipOccupied`).
 */

export interface AssignableTable {
  id: string;
  tableNumber: string;
  capacity: number;
  status: string;
  zone?: string;
  accessible?: boolean;
}

export interface TableSuggestion {
  kind: "single" | "combined";
  tables: AssignableTable[];
  /** Seats left over after the party sits; lower is a tighter fit. */
  spareSeats: number;
}

const UNSEATABLE = new Set(["disabled", "out_of_service", "out-of-service"]);

function byFit(left: AssignableTable, right: AssignableTable): number {
  return (
    left.capacity - right.capacity ||
    left.tableNumber.localeCompare(right.tableNumber, undefined, { numeric: true })
  );
}

export function suggestTable(
  tables: readonly AssignableTable[],
  partySize: number,
  heldTableIds: ReadonlySet<string>,
  options: { needsAccessible?: boolean; skipOccupied?: boolean } = {},
): TableSuggestion | null {
  const free = tables
    .filter(
      (table) =>
        !UNSEATABLE.has(table.status.trim().toLowerCase()) &&
        !(options.skipOccupied && table.status === "occupied") &&
        !heldTableIds.has(table.id),
    )
    .sort(byFit);

  const single = free.find(
    (table) => table.capacity >= partySize && (!options.needsAccessible || table.accessible),
  );
  if (single) {
    return { kind: "single", tables: [single], spareSeats: single.capacity - partySize };
  }

  let best: TableSuggestion | null = null;
  for (let first = 0; first < free.length; first += 1) {
    for (let second = first + 1; second < free.length; second += 1) {
      const pair = [free[first], free[second]];
      const seats = pair[0].capacity + pair[1].capacity;
      if (seats < partySize) continue;
      if ((pair[0].zone ?? "") !== (pair[1].zone ?? "")) continue;
      if (options.needsAccessible && !pair.some((table) => table.accessible)) continue;
      if (!best || seats - partySize < best.spareSeats) {
        best = { kind: "combined", tables: pair, spareSeats: seats - partySize };
      }
    }
  }
  return best;
}
