/**
 * The tab a key moves to in a WAI-ARIA tablist: Left/Right (and Up/Down) step
 * with wrap-around, Home and End jump to the ends. Returns null for any other
 * key so the browser keeps its default behaviour.
 */
export function tabIndexForKey(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** A stable element id for a tab label. */
export function tabId(prefix: string, label: string): string {
  return `${prefix}-${label
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")}`;
}
