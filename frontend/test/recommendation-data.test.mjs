import assert from "node:assert/strict";
import test from "node:test";
import {
  parseGeneratedRecommendationResponse,
  parseRecommendationsResponse,
} from "../src/app/recommendation-data.ts";

const INCIDENT_ID = "71000000000000000000001d";
const OTHER_INCIDENT_ID = "71000000000000000000001c";

function recommendation(overrides = {}) {
  return {
    incidentId: INCIDENT_ID,
    summary: "Paneer stock is below its reorder point during dinner service.",
    rootCause: "The current on-hand quantity is under the configured threshold.",
    priority: "critical",
    source: "fallback",
    confidence: 0.8,
    actions: [
      {
        description: "Confirm the stock count with a quick physical check.",
        rationale: "A count check validates the recorded balance.",
        expectedImpact: "Restores reliable menu availability information.",
      },
    ],
    provider: "deterministic-fallback",
    generatedAt: "2026-10-12T06:00:00.000Z",
    ...overrides,
  };
}

test("recommendation list parser selects the requested incident and preserves safe display fields", () => {
  const other = recommendation({ incidentId: OTHER_INCIDENT_ID, source: "demo" });
  const current = recommendation({ summary: "  Current API recommendation for the incident.  " });

  assert.deepEqual(parseRecommendationsResponse({ items: [other, current] }, INCIDENT_ID), {
    valid: true,
    recommendation: {
      incidentId: INCIDENT_ID,
      summary: "Current API recommendation for the incident.",
      rootCause: "The current on-hand quantity is under the configured threshold.",
      priority: "critical",
      source: "fallback",
      confidence: 0.8,
      actions: [
        {
          description: "Confirm the stock count with a quick physical check.",
          rationale: "A count check validates the recorded balance.",
          expectedImpact: "Restores reliable menu availability information.",
        },
      ],
    },
  });
});

test("recommendation list parser distinguishes a valid empty result from a malformed response", () => {
  assert.deepEqual(parseRecommendationsResponse({ items: [] }, INCIDENT_ID), {
    valid: true,
    recommendation: null,
  });
  assert.deepEqual(
    parseRecommendationsResponse(
      { items: [recommendation({ incidentId: OTHER_INCIDENT_ID })] },
      INCIDENT_ID,
    ),
    { valid: true, recommendation: null },
  );
  assert.deepEqual(parseRecommendationsResponse({ items: "not-an-array" }, INCIDENT_ID), {
    valid: false,
  });
});

test("recommendation list parser rejects invalid, oversized, or ambiguous records", () => {
  const invalidRecords = [
    recommendation({ incidentId: "not-an-object-id" }),
    recommendation({ summary: "short" }),
    recommendation({ summary: `${" ".repeat(321)}A sufficiently long summary for an incident.` }),
    recommendation({ rootCause: "short" }),
    recommendation({ priority: "high" }),
    recommendation({ source: "unknown" }),
    recommendation({ confidence: Number.NaN }),
    recommendation({ confidence: 1.1 }),
    recommendation({ actions: [] }),
    recommendation({
      actions: [
        recommendation().actions[0],
        recommendation().actions[0],
        recommendation().actions[0],
        recommendation().actions[0],
      ],
    }),
    recommendation({
      actions: [
        {
          description: "short",
          rationale: "A sufficiently long rationale.",
          expectedImpact: "A sufficiently long impact.",
        },
      ],
    }),
  ];

  for (const item of invalidRecords) {
    assert.deepEqual(parseRecommendationsResponse({ items: [item] }, INCIDENT_ID), {
      valid: false,
    });
  }
  assert.deepEqual(
    parseRecommendationsResponse(
      { items: Array.from({ length: 101 }, () => recommendation()) },
      INCIDENT_ID,
    ),
    { valid: false },
  );
  assert.deepEqual(
    parseRecommendationsResponse({ items: [recommendation(), recommendation()] }, INCIDENT_ID),
    { valid: false },
  );
  assert.deepEqual(parseRecommendationsResponse({ items: [] }, "bad-id"), { valid: false });
});

test("recommendation parser supports explicitly seeded demo guidance", () => {
  const result = parseRecommendationsResponse(
    { items: [recommendation({ source: "demo" })] },
    INCIDENT_ID,
  );
  assert.equal(result.valid, true);
  if (!result.valid) assert.fail("Expected a well-formed recommendation.");
  assert.equal(result.recommendation?.source, "demo");
});

test("generated recommendation parser validates the nested record and incident identity", () => {
  assert.equal(
    parseGeneratedRecommendationResponse({ recommendation: recommendation() }, INCIDENT_ID)?.source,
    "fallback",
  );
  assert.equal(
    parseGeneratedRecommendationResponse(
      { recommendation: recommendation({ incidentId: OTHER_INCIDENT_ID }) },
      INCIDENT_ID,
    ),
    null,
  );
  assert.equal(parseGeneratedRecommendationResponse({ items: [] }, INCIDENT_ID), null);
  assert.equal(
    parseGeneratedRecommendationResponse(
      { recommendation: recommendation({ confidence: -0.1 }) },
      INCIDENT_ID,
    ),
    null,
  );
});
