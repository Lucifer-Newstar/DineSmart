/**
 * Booking rules a restaurant sets for online reservations (S5-01).
 *
 * Turn times say how long a party of a given size keeps its table. Pacing caps the
 * covers that may start in any 15-minute window so the kitchen is not hit by every
 * booking at once. The lead time, booking window and change cutoff bound when a
 * customer may book or change a booking.
 */

export interface TurnTimeRule {
  /** The largest party this rule covers; rules are read smallest first. */
  maxPartySize: number;
  minutes: number;
}

export interface BookingRules {
  turnTimes: TurnTimeRule[];
  /** Maximum covers (guests) that may start inside one 15-minute window. */
  pacingCoversPer15Min: number;
  /** Bookings must start at least this many minutes from now. */
  minLeadMinutes: number;
  /** Bookings may start at most this many days ahead. */
  maxAdvanceDays: number;
  /** Customers may change or cancel until this many minutes before the start. */
  changeCutoffMinutes: number;
}

export const BOOKING_RULE_LIMITS = {
  maxPartySize: 12,
  turnMinutes: { min: 30, max: 300 },
  pacingCovers: { min: 1, max: 500 },
  minLeadMinutes: { min: 0, max: 7 * 24 * 60 },
  maxAdvanceDays: { min: 1, max: 365 },
  changeCutoffMinutes: { min: 0, max: 7 * 24 * 60 },
  maxTurnTimeRules: 12,
} as const;

export const DEFAULT_BOOKING_RULES: Readonly<BookingRules> = Object.freeze({
  turnTimes: [
    { maxPartySize: 2, minutes: 90 },
    { maxPartySize: 4, minutes: 90 },
    { maxPartySize: 6, minutes: 120 },
    { maxPartySize: 12, minutes: 150 },
  ],
  pacingCoversPer15Min: 20,
  minLeadMinutes: 60,
  maxAdvanceDays: 60,
  changeCutoffMinutes: 120,
});

export class BookingRulesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingRulesError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedInteger(
  value: unknown,
  field: string,
  limits: { readonly min: number; readonly max: number },
): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < limits.min ||
    (value as number) > limits.max
  ) {
    throw new BookingRulesError(
      `${field} must be a whole number from ${limits.min} to ${limits.max}.`,
    );
  }
  return value as number;
}

/**
 * Validates a full set of booking rules. Turn-time rules are sorted by party size,
 * must not repeat a size and must cover the largest bookable party.
 */
export function parseBookingRules(value: unknown): BookingRules {
  if (!isRecord(value)) throw new BookingRulesError("Booking rules must be an object.");
  const allowed = new Set([
    "turnTimes",
    "pacingCoversPer15Min",
    "minLeadMinutes",
    "maxAdvanceDays",
    "changeCutoffMinutes",
  ]);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new BookingRulesError(`Unknown booking rule: ${unknown}.`);

  if (
    !Array.isArray(value.turnTimes) ||
    value.turnTimes.length === 0 ||
    value.turnTimes.length > BOOKING_RULE_LIMITS.maxTurnTimeRules
  ) {
    throw new BookingRulesError(
      `Provide from 1 to ${BOOKING_RULE_LIMITS.maxTurnTimeRules} turn-time rules.`,
    );
  }
  const turnTimes = value.turnTimes.map((rule): TurnTimeRule => {
    if (
      !isRecord(rule) ||
      Object.keys(rule).some((key) => key !== "maxPartySize" && key !== "minutes")
    ) {
      throw new BookingRulesError("Each turn-time rule needs maxPartySize and minutes only.");
    }
    return {
      maxPartySize: boundedInteger(rule.maxPartySize, "maxPartySize", {
        min: 1,
        max: BOOKING_RULE_LIMITS.maxPartySize,
      }),
      minutes: boundedInteger(rule.minutes, "minutes", BOOKING_RULE_LIMITS.turnMinutes),
    };
  });
  turnTimes.sort((left, right) => left.maxPartySize - right.maxPartySize);
  for (let index = 1; index < turnTimes.length; index += 1) {
    if (turnTimes[index].maxPartySize === turnTimes[index - 1].maxPartySize) {
      throw new BookingRulesError("Each party size may appear in only one turn-time rule.");
    }
  }
  if (turnTimes[turnTimes.length - 1].maxPartySize !== BOOKING_RULE_LIMITS.maxPartySize) {
    throw new BookingRulesError(
      `The last turn-time rule must cover parties of ${BOOKING_RULE_LIMITS.maxPartySize}.`,
    );
  }

  return {
    turnTimes,
    pacingCoversPer15Min: boundedInteger(
      value.pacingCoversPer15Min,
      "pacingCoversPer15Min",
      BOOKING_RULE_LIMITS.pacingCovers,
    ),
    minLeadMinutes: boundedInteger(
      value.minLeadMinutes,
      "minLeadMinutes",
      BOOKING_RULE_LIMITS.minLeadMinutes,
    ),
    maxAdvanceDays: boundedInteger(
      value.maxAdvanceDays,
      "maxAdvanceDays",
      BOOKING_RULE_LIMITS.maxAdvanceDays,
    ),
    changeCutoffMinutes: boundedInteger(
      value.changeCutoffMinutes,
      "changeCutoffMinutes",
      BOOKING_RULE_LIMITS.changeCutoffMinutes,
    ),
  };
}

/** Reads stored rules, falling back to the defaults when they are missing or damaged. */
export function resolveBookingRules(stored: unknown): BookingRules {
  if (stored === undefined || stored === null) return cloneRules(DEFAULT_BOOKING_RULES);
  try {
    return parseBookingRules(stored);
  } catch {
    return cloneRules(DEFAULT_BOOKING_RULES);
  }
}

/** Minutes a party of this size keeps its table under the given rules. */
export function turnTimeMinutes(rules: BookingRules, partySize: number): number {
  const rule = rules.turnTimes.find((candidate) => partySize <= candidate.maxPartySize);
  return (rule ?? rules.turnTimes[rules.turnTimes.length - 1]).minutes;
}

function cloneRules(rules: Readonly<BookingRules>): BookingRules {
  return { ...rules, turnTimes: rules.turnTimes.map((rule) => ({ ...rule })) };
}
