/** Form model and validation for the booking rules panel (S5-01). */

export interface TurnTimeRow {
  maxPartySize: number;
  minutes: string;
}

export interface BookingRulesForm {
  turnTimes: TurnTimeRow[];
  pacingCoversPer15Min: string;
  minLeadMinutes: string;
  maxAdvanceDays: string;
  changeCutoffMinutes: string;
}

export interface BookingRulesBody {
  turnTimes: Array<{ maxPartySize: number; minutes: number }>;
  pacingCoversPer15Min: number;
  minLeadMinutes: number;
  maxAdvanceDays: number;
  changeCutoffMinutes: number;
}

export type BookingRulesErrors = Partial<Record<keyof BookingRulesForm | `turn-${number}`, string>>;

const LIMITS = {
  turnMinutes: [30, 300],
  pacingCoversPer15Min: [1, 500],
  minLeadMinutes: [0, 10080],
  maxAdvanceDays: [1, 365],
  changeCutoffMinutes: [0, 10080],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads GET /booking-rules into editable strings. */
export function parseBookingRulesResponse(
  payload: unknown,
): { form: BookingRulesForm; usingDefaults: boolean } | null {
  if (!isRecord(payload) || !isRecord(payload.rules)) return null;
  const rules = payload.rules;
  if (!Array.isArray(rules.turnTimes)) return null;
  const turnTimes = rules.turnTimes.flatMap((rule) =>
    isRecord(rule) && typeof rule.maxPartySize === "number" && typeof rule.minutes === "number"
      ? [{ maxPartySize: rule.maxPartySize, minutes: String(rule.minutes) }]
      : [],
  );
  const numbers = [
    rules.pacingCoversPer15Min,
    rules.minLeadMinutes,
    rules.maxAdvanceDays,
    rules.changeCutoffMinutes,
  ];
  if (turnTimes.length === 0 || numbers.some((value) => typeof value !== "number")) return null;
  return {
    usingDefaults: payload.usingDefaults === true,
    form: {
      turnTimes: turnTimes.sort((left, right) => left.maxPartySize - right.maxPartySize),
      pacingCoversPer15Min: String(rules.pacingCoversPer15Min),
      minLeadMinutes: String(rules.minLeadMinutes),
      maxAdvanceDays: String(rules.maxAdvanceDays),
      changeCutoffMinutes: String(rules.changeCutoffMinutes),
    },
  };
}

function wholeNumber(value: string, [min, max]: readonly [number, number]): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return parsed >= min && parsed <= max ? parsed : null;
}

/** Validates the form the same way the API does; returns a body or per-field errors. */
export function validateBookingRules(
  form: BookingRulesForm,
): { body: BookingRulesBody; errors: null } | { body: null; errors: BookingRulesErrors } {
  const errors: BookingRulesErrors = {};
  const turnTimes = form.turnTimes.map((row, index) => {
    const minutes = wholeNumber(row.minutes, LIMITS.turnMinutes);
    if (minutes === null) errors[`turn-${index}`] = "Use 30 to 300 minutes.";
    return { maxPartySize: row.maxPartySize, minutes: minutes ?? 0 };
  });
  const read = (field: keyof typeof LIMITS & keyof BookingRulesForm, message: string) => {
    const value = wholeNumber(form[field], LIMITS[field]);
    if (value === null) errors[field] = message;
    return value ?? 0;
  };
  const body: BookingRulesBody = {
    turnTimes,
    pacingCoversPer15Min: read("pacingCoversPer15Min", "Use 1 to 500 covers."),
    minLeadMinutes: read("minLeadMinutes", "Use 0 to 10080 minutes."),
    maxAdvanceDays: read("maxAdvanceDays", "Use 1 to 365 days."),
    changeCutoffMinutes: read("changeCutoffMinutes", "Use 0 to 10080 minutes."),
  };
  return Object.keys(errors).length > 0 ? { body: null, errors } : { body, errors: null };
}

export function partyRangeLabel(rows: readonly TurnTimeRow[], index: number): string {
  const from = index === 0 ? 1 : rows[index - 1].maxPartySize + 1;
  const to = rows[index].maxPartySize;
  return from === to ? `${to} guests` : `${from}–${to} guests`;
}
