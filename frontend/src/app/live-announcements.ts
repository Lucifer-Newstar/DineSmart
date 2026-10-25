/**
 * Text for the polite live region that tells screen-reader users about items
 * that arrived while they were working (WCAG 4.1.3). The first load is a
 * baseline and is never announced; afterwards each new item is announced once.
 */
export interface Arrival {
  id: string;
  label: string;
}

export interface ArrivalNoun {
  one: string;
  many: string;
}

export function describeArrivals(
  previous: ReadonlySet<string> | null,
  items: readonly Arrival[],
  noun: ArrivalNoun,
): string {
  if (previous === null) return "";
  const arrived = items.filter((item) => !previous.has(item.id));
  if (arrived.length === 0) return "";
  const newest = arrived[0]?.label.trim() ?? "";
  if (arrived.length === 1) return newest ? `New ${noun.one}: ${newest}` : `New ${noun.one}`;
  return newest
    ? `${arrived.length} new ${noun.many}. Newest: ${newest}`
    : `${arrived.length} new ${noun.many}`;
}
