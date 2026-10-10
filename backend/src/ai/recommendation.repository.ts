import type { Db, ObjectId, WithId } from "mongodb";
import { COLLECTIONS, type RecommendationDocument } from "../database/schema.js";
import type { RecommendationResult } from "./contracts.js";

export interface RecommendationRepository {
  save(
    restaurantId: ObjectId,
    incidentId: ObjectId,
    recommendation: RecommendationResult,
  ): Promise<WithId<RecommendationDocument>>;
  listForRestaurant(
    restaurantId: ObjectId,
    incidentId?: ObjectId,
    limit?: number,
  ): Promise<Array<WithId<RecommendationDocument>>>;
}

export class MongoRecommendationRepository implements RecommendationRepository {
  private readonly recommendations;

  constructor(db: Db) {
    this.recommendations = db.collection<RecommendationDocument>(COLLECTIONS.recommendations);
  }

  async save(
    restaurantId: ObjectId,
    incidentId: ObjectId,
    recommendation: RecommendationResult,
  ): Promise<WithId<RecommendationDocument>> {
    const updated = await this.recommendations.findOneAndUpdate(
      { restaurantId, incidentId },
      {
        $set: {
          summary: recommendation.summary,
          rootCause: recommendation.rootCause,
          priority: recommendation.priority,
          actions: recommendation.actions,
          confidence: recommendation.confidence,
          source: recommendation.source,
          provider: recommendation.provider,
          generatedAt: recommendation.generatedAt,
          updatedAt: recommendation.generatedAt,
        },
        $setOnInsert: { restaurantId, incidentId, createdAt: recommendation.generatedAt },
      },
      { upsert: true, returnDocument: "after", includeResultMetadata: false },
    );
    if (!updated) throw new Error("Recommendation upsert returned no document.");
    return updated;
  }

  listForRestaurant(
    restaurantId: ObjectId,
    incidentId?: ObjectId,
    limit = 30,
  ): Promise<Array<WithId<RecommendationDocument>>> {
    const filter = incidentId ? { restaurantId, incidentId } : { restaurantId };
    return this.recommendations
      .find(filter)
      .sort({ generatedAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 100))
      .toArray();
  }
}
