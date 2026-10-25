function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface SignedInDevice {
  id: string;
  deviceLabel: string;
  lastUsedAt: string;
  createdAt: string;
  current: boolean;
}

/** Parses GET /auth/sessions; malformed rows are dropped, a malformed body is null. */
export function parseSessions(value: unknown): SignedInDevice[] | null {
  if (!isRecord(value) || !Array.isArray(value.sessions)) return null;
  return value.sessions.flatMap((raw) => {
    if (!isRecord(raw)) return [];
    const { id, deviceLabel, lastUsedAt, createdAt, current } = raw;
    if (typeof id !== "string" || typeof deviceLabel !== "string") return [];
    if (typeof lastUsedAt !== "string" || typeof createdAt !== "string") return [];
    if (typeof current !== "boolean") return [];
    return [{ id, deviceLabel, lastUsedAt, createdAt, current }];
  });
}
