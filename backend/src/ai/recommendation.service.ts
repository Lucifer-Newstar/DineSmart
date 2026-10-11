import { ObjectId, type WithId } from "mongodb";
import type { RecommendationDocument } from "../database/schema.js";
import type { RestaurantRealtimePublisher } from "../realtime/realtime.types.js";
import type {
  IncidentRecommendationContext,
  RecommendationResult,
  StructuredRecommendation,
} from "./contracts.js";
import { buildFallbackRecommendation } from "./fallback.recommendations.js";
import type { RecommendationProvider } from "./gemini.provider.js";
import type { IncidentContextBuilder } from "./incident-context.builder.js";
import type { RecommendationRepository } from "./recommendation.repository.js";

export const DETERMINISTIC_PROVIDER_NAME = "deterministic-fallback";

export class RecommendationService {
  constructor(
    private readonly contextBuilder: IncidentContextBuilder,
    private readonly repository: RecommendationRepository,
    private readonly provider?: RecommendationProvider,
    private readonly clock: () => Date = () => new Date(),
    private readonly publishRealtime: RestaurantRealtimePublisher = () => undefined,
  ) {}

  async generate(
    restaurantIdText: string,
    incidentIdText: string,
  ): Promise<WithId<RecommendationDocument>> {
    const context = await this.contextBuilder.build(restaurantIdText, incidentIdText, this.clock());
    const generated = await this.generateSafely(context);
    const recommendation: RecommendationResult = {
      ...generated.content,
      source: generated.source,
      provider: generated.provider,
      generatedAt: this.clock(),
    };

    const restaurantId = new ObjectId(restaurantIdText);
    const incidentId = new ObjectId(incidentIdText);
    const saved = await this.repository.save(restaurantId, incidentId, recommendation);
    try {
      this.publishRealtime({
        restaurantId,
        event: "recommendation.updated",
        data: { incidentId: incidentId.toHexString() },
      });
    } catch {
      // The persisted recommendation remains usable if push delivery is unavailable.
    }
    return saved;
  }

  async list(
    restaurantIdText: string,
    incidentIdText?: string,
  ): Promise<Array<WithId<RecommendationDocument>>> {
    if (
      !ObjectId.isValid(restaurantIdText) ||
      (incidentIdText && !ObjectId.isValid(incidentIdText))
    ) {
      return [];
    }
    return this.repository.listForRestaurant(
      new ObjectId(restaurantIdText),
      incidentIdText ? new ObjectId(incidentIdText) : undefined,
    );
  }

  private async generateSafely(context: IncidentRecommendationContext): Promise<{
    content: StructuredRecommendation;
    source: "gemini" | "fallback";
    provider: string;
  }> {
    if (this.provider) {
      try {
        return {
          content: await this.provider.generate(context),
          source: "gemini",
          provider: this.provider.provider,
        };
      } catch {
        // Provider failures, quota/timeouts, and invalid structured output use deterministic rules.
      }
    }

    return {
      content: buildFallbackRecommendation(context),
      source: "fallback",
      provider: DETERMINISTIC_PROVIDER_NAME,
    };
  }
}
