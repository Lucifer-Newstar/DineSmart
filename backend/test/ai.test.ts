import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId, type WithId } from "mongodb";
import { createAiRouter } from "../src/ai/ai.router.js";
import type { RecommendationResult } from "../src/ai/contracts.js";
import {
  GeminiRecommendationProvider,
  type GeminiTextGenerator,
} from "../src/ai/gemini.provider.js";
import {
  IncidentContextBuilder,
  type IncidentContextSource,
} from "../src/ai/incident-context.builder.js";
import { RECOMMENDATION_SYSTEM_INSTRUCTION } from "../src/ai/recommendation.prompt.js";
import type { RecommendationRepository } from "../src/ai/recommendation.repository.js";
import { RecommendationService } from "../src/ai/recommendation.service.js";
import { parseRecommendationOutput } from "../src/ai/recommendation.validation.js";
import type { AuthPrincipal, AuthService } from "../src/auth/auth.service.js";
import type {
  IncidentDocument,
  InventoryItemDocument,
  OrderDocument,
  RecommendationDocument,
  ReservationDocument,
  RestaurantDocument,
} from "../src/database/schema.js";
import type { RestaurantRealtimeEvent } from "../src/realtime/realtime.types.js";

const FIXED_NOW = new Date("2026-10-10T12:00:00.000Z");
const RESTAURANT_ID = new ObjectId("720000000000000000000001");
const INCIDENT_ID = new ObjectId("720000000000000000000002");
const CUSTOMER_ID = new ObjectId("720000000000000000000003");
const ORDER_ID = new ObjectId("720000000000000000000004");
const RESTAURANT_HEX = RESTAURANT_ID.toHexString();
const INCIDENT_HEX = INCIDENT_ID.toHexString();

class FakeIncidentContextSource implements IncidentContextSource {
  readonly incident: WithId<IncidentDocument> = {
    _id: INCIDENT_ID,
    restaurantId: RESTAURANT_ID,
    type: "inventory_shortage",
    severity: "critical",
    status: "open",
    triggerSnapshot: {
      available: 2.4,
      lowStockThreshold: 4,
      unit: "kg",
      email: "customer@example.com",
      phone: "+91 98765 43210",
      customerId: CUSTOMER_ID,
    },
    affectedEntity: { type: "inventory_item", id: new ObjectId() },
    createdAt: new Date(FIXED_NOW.getTime() - 5 * 60_000),
    updatedAt: FIXED_NOW,
  };

  readonly restaurant: WithId<RestaurantDocument> = {
    _id: RESTAURANT_ID,
    name: "Saffron & Co.",
    timezone: "Asia/Kolkata",
    currency: "INR",
    thresholds: { lowStockDefault: 4, kitchenDelayWarningMinutes: 15 },
    status: "active",
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };

  readonly orders: Array<WithId<OrderDocument>> = [
    {
      _id: ORDER_ID,
      restaurantId: RESTAURANT_ID,
      customerId: CUSTOMER_ID,
      totalMinor: 25000,
      currency: "INR",
      status: "Preparing",
      createdAt: new Date(FIXED_NOW.getTime() - 23 * 60_000),
      updatedAt: FIXED_NOW,
    },
  ];

  readonly inventory: Array<WithId<InventoryItemDocument>> = [
    {
      _id: new ObjectId(),
      restaurantId: RESTAURANT_ID,
      name: "Paneer contact alice@example.com +91 98765 43210",
      quantity: 2.4,
      unit: "kg",
      lowStockThreshold: 4,
      lastAdjustedAt: new Date(FIXED_NOW.getTime() - 20 * 60_000),
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    },
  ];

  readonly reservations: Array<WithId<ReservationDocument>> = [
    {
      _id: new ObjectId(),
      restaurantId: RESTAURANT_ID,
      customerId: CUSTOMER_ID,
      partySize: 4,
      startAt: new Date(FIXED_NOW.getTime() + 45 * 60_000),
      endAt: new Date(FIXED_NOW.getTime() + 90 * 60_000),
      status: "Confirmed",
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    },
  ];

  async findIncident(
    restaurantId: ObjectId,
    incidentId: ObjectId,
  ): Promise<WithId<IncidentDocument> | null> {
    return restaurantId.equals(RESTAURANT_ID) && incidentId.equals(INCIDENT_ID)
      ? this.incident
      : null;
  }

  async findRestaurant(restaurantId: ObjectId): Promise<WithId<RestaurantDocument> | null> {
    return restaurantId.equals(RESTAURANT_ID) ? this.restaurant : null;
  }

  async findActiveOrders(restaurantId: ObjectId): Promise<Array<WithId<OrderDocument>>> {
    return restaurantId.equals(RESTAURANT_ID) ? this.orders : [];
  }

  async findLowStockItems(restaurantId: ObjectId): Promise<Array<WithId<InventoryItemDocument>>> {
    return restaurantId.equals(RESTAURANT_ID) ? this.inventory : [];
  }

  async findUpcomingReservations(
    restaurantId: ObjectId,
  ): Promise<Array<WithId<ReservationDocument>>> {
    return restaurantId.equals(RESTAURANT_ID) ? this.reservations : [];
  }
}

class FakeRecommendationRepository implements RecommendationRepository {
  saved: WithId<RecommendationDocument> | undefined;

  async save(
    restaurantId: ObjectId,
    incidentId: ObjectId,
    recommendation: RecommendationResult,
  ): Promise<WithId<RecommendationDocument>> {
    this.saved = {
      ...recommendation,
      restaurantId,
      incidentId,
      _id: this.saved?._id ?? new ObjectId(),
      createdAt: this.saved?.createdAt ?? recommendation.generatedAt,
      updatedAt: recommendation.generatedAt,
    };
    return this.saved;
  }

  async listForRestaurant(
    restaurantId: ObjectId,
    incidentId?: ObjectId,
  ): Promise<Array<WithId<RecommendationDocument>>> {
    if (!this.saved?.restaurantId.equals(restaurantId)) return [];
    if (incidentId && !this.saved.incidentId.equals(incidentId)) return [];
    return [this.saved];
  }
}

function makeContextBuilder(source = new FakeIncidentContextSource()) {
  return new IncidentContextBuilder(source);
}

function managerPrincipal(): AuthPrincipal {
  return { userId: "720000000000000000000099", role: "Manager", restaurantId: RESTAURANT_HEX };
}

function makeRecommendationRecord(): WithId<RecommendationDocument> {
  return {
    _id: new ObjectId("720000000000000000000010"),
    restaurantId: RESTAURANT_ID,
    incidentId: INCIDENT_ID,
    summary: "Paneer stock is below the configured reorder threshold.",
    rootCause: "The current on-hand count is below the reorder point.",
    priority: "critical",
    actions: [
      {
        description: "Confirm the stock count with a quick physical check.",
        rationale: "A count check validates the recorded balance.",
        expectedImpact: "Restores reliable menu availability information.",
      },
    ],
    confidence: 0.8,
    source: "fallback",
    provider: "deterministic-fallback",
    generatedAt: FIXED_NOW,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
}

async function withServer<T>(
  app: express.Express,
  callback: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("incident context is tenant-filtered, bounded, and excludes personal/customer identifiers", async () => {
  const builder = makeContextBuilder();
  const context = await builder.build(RESTAURANT_HEX, INCIDENT_HEX, FIXED_NOW);
  const serialized = JSON.stringify(context);

  assert.equal(context.incident.type, "inventory_shortage");
  assert.equal(context.incident.ageMinutes, 5);
  assert.equal(context.incident.trigger.available, 2.4);
  assert.equal(context.operations.activeOrders[0].ageMinutes, 23);
  assert.equal(context.operations.upcomingReservations[0].startsInMinutes, 45);
  assert.match(context.operations.lowStockItems[0].name, /\[redacted\]/);
  assert.ok(!("id" in context.incident));
  assert.ok(!serialized.includes("customer@example.com"));
  assert.ok(!serialized.includes("98765 43210"));
  assert.ok(!serialized.includes(CUSTOMER_ID.toHexString()));

  await assert.rejects(
    builder.build(new ObjectId().toHexString(), INCIDENT_HEX, FIXED_NOW),
    /not found/,
  );
  await assert.rejects(
    builder.build("bad-id", INCIDENT_HEX, FIXED_NOW),
    /valid incident reference/,
  );
});

test("Gemini provider uses structured JSON and rejects invalid or escalated recommendations", async () => {
  const context = await makeContextBuilder().build(RESTAURANT_HEX, INCIDENT_HEX, FIXED_NOW);
  let capturedPrompt = "";
  const validOutput = JSON.stringify({
    summary: "Paneer stock is below its reorder point during active service.",
    rootCause: "The verified on-hand quantity is under the configured threshold.",
    priority: "critical",
    actions: [
      {
        description: "Confirm the count and review availability with the shift manager.",
        rationale: "The current row shows 2.4 kilograms against a four kilogram threshold.",
        expectedImpact: "Prevents new orders from being promised without a stock check.",
      },
    ],
    confidence: 0.9,
  });
  const generator: GeminiTextGenerator = {
    async generate(prompt) {
      capturedPrompt = prompt;
      return validOutput;
    },
  };
  const provider = new GeminiRecommendationProvider(generator, "test-model");
  const result = await provider.generate(context);
  assert.equal(provider.provider, "test-model");
  assert.equal(result.priority, "critical");
  assert.equal(result.actions.length, 1);
  assert.ok(!capturedPrompt.includes("customer@example.com"));
  assert.ok(capturedPrompt.includes("<operational_context>"));
  assert.ok(RECOMMENDATION_SYSTEM_INSTRUCTION.includes("untrusted operational data"));

  assert.throws(() =>
    parseRecommendationOutput(validOutput.replace('"critical"', '"info"'), "critical"),
  );
  assert.throws(() => parseRecommendationOutput("not json", "critical"));
});

test("recommendation service persists Gemini results and uses deterministic fallback on missing or failing AI", async () => {
  const repository = new FakeRecommendationRepository();
  const builder = makeContextBuilder();
  const offlineService = new RecommendationService(
    builder,
    repository,
    undefined,
    () => new Date(FIXED_NOW),
  );
  const fallback = await offlineService.generate(RESTAURANT_HEX, INCIDENT_HEX);
  assert.equal(fallback.source, "fallback");
  assert.equal(fallback.provider, "deterministic-fallback");
  assert.equal(repository.saved?._id.toHexString(), fallback._id.toHexString());
  assert.equal((await offlineService.list(RESTAURANT_HEX, INCIDENT_HEX)).length, 1);

  const failingProvider = {
    provider: "test-model",
    async generate() {
      throw new Error("simulated quota or timeout");
    },
  };
  const resilientService = new RecommendationService(
    builder,
    repository,
    failingProvider,
    () => new Date(FIXED_NOW),
  );
  const secondFallback = await resilientService.generate(RESTAURANT_HEX, INCIDENT_HEX);
  assert.equal(secondFallback.source, "fallback");

  const provider = {
    provider: "test-model",
    async generate() {
      return {
        summary: "Paneer stock is below the configured threshold during service.",
        rootCause: "The current recorded count is under the reorder threshold.",
        priority: "critical" as const,
        actions: [
          {
            description: "Check the physical count and speak with the shift manager.",
            rationale: "The current inventory record shows a quantity below threshold.",
            expectedImpact: "Supports a reliable availability decision for the floor.",
          },
        ],
        confidence: 0.88,
      };
    },
  };
  const realtimeEvents: RestaurantRealtimeEvent[] = [];
  const onlineService = new RecommendationService(
    builder,
    repository,
    provider,
    () => new Date(FIXED_NOW),
    (event) => realtimeEvents.push(event),
  );
  const generated = await onlineService.generate(RESTAURANT_HEX, INCIDENT_HEX);
  assert.equal(generated.source, "gemini");
  assert.equal(generated.provider, "test-model");
  assert.equal(generated.priority, "critical");
  assert.deepEqual(realtimeEvents, [
    {
      restaurantId: RESTAURANT_ID,
      event: "recommendation.updated",
      data: { incidentId: INCIDENT_ID.toHexString() },
    },
  ]);
});

test("AI HTTP endpoints require a manager permission and return advisory fallback source", async () => {
  let principal: AuthPrincipal = managerPrincipal();
  const authService = {
    async verifyAccessToken() {
      return principal;
    },
  } as unknown as AuthService;
  const record = makeRecommendationRecord();
  const recommendationService = {
    async generate(restaurantId: string, incidentId: string) {
      assert.equal(restaurantId, RESTAURANT_HEX);
      assert.equal(incidentId, INCIDENT_HEX);
      return record;
    },
    async list() {
      return [record];
    },
  } as unknown as RecommendationService;
  const app = express();
  app.use(
    "/api/v1",
    createAiRouter({
      createAuthService: async () => authService,
      createRecommendationService: async () => recommendationService,
    }),
  );

  await withServer(app, async (baseUrl) => {
    const generated = await fetch(`${baseUrl}/api/v1/incidents/${INCIDENT_HEX}/recommendations`, {
      method: "POST",
      headers: { authorization: "Bearer test-token" },
    });
    assert.equal(generated.status, 200);
    const body = (await generated.json()) as {
      recommendation: { source: string; actions: unknown[] };
    };
    assert.equal(body.recommendation.source, "fallback");
    assert.equal(body.recommendation.actions.length, 1);

    const listed = await fetch(`${baseUrl}/api/v1/recommendations?incidentId=${INCIDENT_HEX}`, {
      headers: { authorization: "Bearer test-token" },
    });
    assert.equal(listed.status, 200);

    principal = { userId: "kitchen", role: "Kitchen Staff", restaurantId: RESTAURANT_HEX };
    const denied = await fetch(`${baseUrl}/api/v1/incidents/${INCIDENT_HEX}/recommendations`, {
      method: "POST",
      headers: { authorization: "Bearer test-token" },
    });
    assert.equal(denied.status, 403);
  });
});
