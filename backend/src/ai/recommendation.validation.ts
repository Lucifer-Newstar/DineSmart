import type { IncidentSeverity } from "../database/schema.js";
import type { RecommendationAction, StructuredRecommendation } from "./contracts.js";

export class InvalidRecommendationOutput extends Error {
  constructor(message = "The recommendation output did not match the required schema.") {
    super(message);
    this.name = "InvalidRecommendationOutput";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") throw new InvalidRecommendationOutput();
  const sanitized = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
    .replace(/\+?\d[\d ().-]{7,}\d/g, "[redacted]")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxLength);
  if (sanitized.length < 8) throw new InvalidRecommendationOutput();
  return sanitized;
}

function parseAction(value: unknown): RecommendationAction {
  if (!isRecord(value)) throw new InvalidRecommendationOutput();
  return {
    description: safeText(value.description, 240),
    rationale: safeText(value.rationale, 240),
    expectedImpact: safeText(value.expectedImpact, 240),
  };
}

export function parseRecommendationOutput(
  text: string | undefined,
  expectedPriority: IncidentSeverity,
): StructuredRecommendation {
  if (typeof text !== "string" || text.length > 8_000) throw new InvalidRecommendationOutput();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new InvalidRecommendationOutput();
  }
  if (!isRecord(parsed)) throw new InvalidRecommendationOutput();

  const summary = safeText(parsed.summary, 320);
  const rootCause = safeText(parsed.rootCause, 480);
  if (parsed.priority !== expectedPriority) throw new InvalidRecommendationOutput();
  if (!Array.isArray(parsed.actions) || parsed.actions.length < 1 || parsed.actions.length > 3) {
    throw new InvalidRecommendationOutput();
  }
  if (
    typeof parsed.confidence !== "number" ||
    !Number.isFinite(parsed.confidence) ||
    parsed.confidence < 0 ||
    parsed.confidence > 1
  ) {
    throw new InvalidRecommendationOutput();
  }

  return {
    summary,
    rootCause,
    priority: expectedPriority,
    actions: parsed.actions.map(parseAction),
    confidence: parsed.confidence,
  };
}
