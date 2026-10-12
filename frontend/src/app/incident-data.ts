export type IncidentSeverity = "info" | "warning" | "critical";
export type IncidentStatus = "open" | "active" | "resolved";

export type IncidentTriggerValue = string | number | boolean;

export interface IncidentRecord {
  id: string;
  type: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  triggerSnapshot: Record<string, IncidentTriggerValue>;
  affectedEntity: { type: string; id: string };
  rootCause: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolutionReason: string | null;
}

export interface ParsedIncidentList {
  incidents: IncidentRecord[];
  truncated: boolean;
}

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const SLUG_PATTERN = /^[a-z][a-z\d_]{0,63}$/;
const MAX_INCIDENTS = 200;
const MAX_TRIGGER_FIELDS = 12;
const MAX_ROOT_CAUSE_LENGTH = 500;
const MAX_RESOLUTION_REASON_LENGTH = 80;
const MAX_TRIGGER_TEXT_LENGTH = 80;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const VALID_SEVERITIES = new Set<IncidentSeverity>(["info", "warning", "critical"]);
const VALID_STATUSES = new Set<IncidentStatus>(["open", "active", "resolved"]);
const SAFE_TRIGGER_FIELDS = new Set([
  "elapsedMinutes",
  "thresholdMinutes",
  "queueLength",
  "activeOrderCount",
  "oldestActiveOrderMinutes",
  "available",
  "lowStockThreshold",
  "unit",
  "partySize",
  "conflictCount",
  "capacity",
  "tableStatus",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length <= maxLength &&
    Array.from(value).every((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127;
    })
  );
}

function parseTimestamp(value: unknown): string | null {
  if (!isBoundedText(value, 40) || !ISO_TIMESTAMP_PATTERN.test(value)) return null;
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null;
}

function parseNullableTimestamp(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return parseTimestamp(value) ?? undefined;
}

function parseTriggerSnapshot(value: unknown): Record<string, IncidentTriggerValue> | null {
  if (!isRecord(value) || Object.keys(value).length > MAX_TRIGGER_FIELDS) return null;
  const snapshot: Record<string, IncidentTriggerValue> = {};

  for (const [key, field] of Object.entries(value)) {
    if (!SAFE_TRIGGER_FIELDS.has(key)) return null;
    if (typeof field === "number") {
      if (!Number.isFinite(field) || field < 0 || field > 1_000_000_000) return null;
      snapshot[key] = field;
    } else if (typeof field === "boolean") {
      snapshot[key] = field;
    } else if (isBoundedText(field, MAX_TRIGGER_TEXT_LENGTH)) {
      snapshot[key] = field.trim();
    } else {
      return null;
    }
  }

  return snapshot;
}

function parseIncidentRecord(value: unknown): IncidentRecord | null {
  if (!isRecord(value) || !isRecord(value.affectedEntity)) return null;
  if (
    typeof value.id !== "string" ||
    !OBJECT_ID_PATTERN.test(value.id) ||
    typeof value.type !== "string" ||
    !SLUG_PATTERN.test(value.type) ||
    typeof value.severity !== "string" ||
    !VALID_SEVERITIES.has(value.severity as IncidentSeverity) ||
    typeof value.status !== "string" ||
    !VALID_STATUSES.has(value.status as IncidentStatus) ||
    typeof value.affectedEntity.type !== "string" ||
    !SLUG_PATTERN.test(value.affectedEntity.type) ||
    typeof value.affectedEntity.id !== "string" ||
    !OBJECT_ID_PATTERN.test(value.affectedEntity.id) ||
    (value.rootCause !== undefined && !isBoundedText(value.rootCause, MAX_ROOT_CAUSE_LENGTH)) ||
    !isBoundedText(value.resolutionReason ?? "", MAX_RESOLUTION_REASON_LENGTH)
  ) {
    return null;
  }

  const triggerSnapshot = parseTriggerSnapshot(value.triggerSnapshot);
  const createdAt = parseTimestamp(value.createdAt);
  const updatedAt = parseTimestamp(value.updatedAt);
  const resolvedAt = parseNullableTimestamp(value.resolvedAt);
  if (!triggerSnapshot || !createdAt || !updatedAt || resolvedAt === undefined) return null;

  return {
    id: value.id,
    type: value.type,
    severity: value.severity as IncidentSeverity,
    status: value.status as IncidentStatus,
    triggerSnapshot,
    affectedEntity: { type: value.affectedEntity.type, id: value.affectedEntity.id },
    rootCause: typeof value.rootCause === "string" ? value.rootCause.trim() : "",
    createdAt,
    updatedAt,
    resolvedAt,
    resolutionReason:
      typeof value.resolutionReason === "string" ? value.resolutionReason.trim() : null,
  };
}

export function parseIncidentsResponse(value: unknown): ParsedIncidentList | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.incidents) ||
    value.incidents.length > MAX_INCIDENTS ||
    typeof value.truncated !== "boolean"
  ) {
    return null;
  }

  const incidents = value.incidents.map(parseIncidentRecord);
  if (incidents.some((incident) => incident === null)) return null;
  const parsedIncidents = incidents as IncidentRecord[];
  const ids = new Set(parsedIncidents.map((incident) => incident.id.toLowerCase()));
  if (ids.size !== parsedIncidents.length) return null;

  return { incidents: parsedIncidents, truncated: value.truncated };
}
