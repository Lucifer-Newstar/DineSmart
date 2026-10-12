export type RecommendationPriority = "info" | "warning" | "critical";
export type RecommendationSource = "gemini" | "fallback" | "demo";

export interface RecommendationAction {
  description: string;
  rationale: string;
  expectedImpact: string;
}

export interface Recommendation {
  incidentId: string;
  summary: string;
  rootCause: string;
  priority: RecommendationPriority;
  source: RecommendationSource;
  confidence: number;
  actions: RecommendationAction[];
}

export type RecommendationListParseResult =
  | { valid: true; recommendation: Recommendation | null }
  | { valid: false };

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const MAX_RECOMMENDATION_LIST_SIZE = 100;
const MAX_SUMMARY_LENGTH = 320;
const MAX_ROOT_CAUSE_LENGTH = 480;
const MAX_ACTION_TEXT_LENGTH = 240;
const VALID_PRIORITIES = new Set<RecommendationPriority>(["info", "warning", "critical"]);
const VALID_SOURCES = new Set<RecommendationSource>(["gemini", "fallback", "demo"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length >= 8 && value.length <= maxLength;
}

function parseAction(value: unknown): RecommendationAction | null {
  if (
    !isRecord(value) ||
    !isBoundedText(value.description, MAX_ACTION_TEXT_LENGTH) ||
    !isBoundedText(value.rationale, MAX_ACTION_TEXT_LENGTH) ||
    !isBoundedText(value.expectedImpact, MAX_ACTION_TEXT_LENGTH)
  ) {
    return null;
  }

  return {
    description: value.description.trim(),
    rationale: value.rationale.trim(),
    expectedImpact: value.expectedImpact.trim(),
  };
}

function parseRecommendationRecord(value: unknown): Recommendation | null {
  if (
    !isRecord(value) ||
    typeof value.incidentId !== "string" ||
    !OBJECT_ID_PATTERN.test(value.incidentId) ||
    !isBoundedText(value.summary, MAX_SUMMARY_LENGTH) ||
    !isBoundedText(value.rootCause, MAX_ROOT_CAUSE_LENGTH) ||
    typeof value.priority !== "string" ||
    !VALID_PRIORITIES.has(value.priority as RecommendationPriority) ||
    typeof value.source !== "string" ||
    !VALID_SOURCES.has(value.source as RecommendationSource) ||
    typeof value.confidence !== "number" ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1 ||
    !Array.isArray(value.actions) ||
    value.actions.length < 1 ||
    value.actions.length > 3
  ) {
    return null;
  }

  const actions = value.actions.map(parseAction);
  if (actions.some((action) => action === null)) return null;

  return {
    incidentId: value.incidentId,
    summary: value.summary.trim(),
    rootCause: value.rootCause.trim(),
    priority: value.priority as RecommendationPriority,
    source: value.source as RecommendationSource,
    confidence: value.confidence,
    actions: actions as RecommendationAction[],
  };
}

export function parseRecommendationsResponse(
  value: unknown,
  expectedIncidentId: string,
): RecommendationListParseResult {
  if (
    !OBJECT_ID_PATTERN.test(expectedIncidentId) ||
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    value.items.length > MAX_RECOMMENDATION_LIST_SIZE
  ) {
    return { valid: false };
  }

  const recommendations = value.items.map(parseRecommendationRecord);
  if (recommendations.some((item) => item === null)) return { valid: false };

  const matches = (recommendations as Recommendation[]).filter(
    (item) => item.incidentId.toLowerCase() === expectedIncidentId.toLowerCase(),
  );
  if (matches.length > 1) return { valid: false };

  return { valid: true, recommendation: matches[0] ?? null };
}

export function parseGeneratedRecommendationResponse(
  value: unknown,
  expectedIncidentId: string,
): Recommendation | null {
  if (!OBJECT_ID_PATTERN.test(expectedIncidentId) || !isRecord(value)) return null;
  const recommendation = parseRecommendationRecord(value.recommendation);
  if (
    !recommendation ||
    recommendation.incidentId.toLowerCase() !== expectedIncidentId.toLowerCase()
  ) {
    return null;
  }
  return recommendation;
}
