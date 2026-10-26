/**
 * What the connection banner says (S5-05), or null when everything is fine.
 * The browser being offline wins over a dropped live-update socket.
 */
export type LiveUpdateStatus = "off" | "connecting" | "live" | "offline";

export function connectionNotice(online: boolean, realtime: LiveUpdateStatus): string | null {
  if (!online) {
    return "You are offline. Changes cannot be saved until the connection returns.";
  }
  if (realtime === "offline") {
    return "Live updates paused. Reconnecting… Lists still refresh when you reload them.";
  }
  return null;
}
