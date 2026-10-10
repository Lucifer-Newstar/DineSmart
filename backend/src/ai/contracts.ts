import type { IncidentSeverity } from "../database/schema.js";

export interface ContextSignal {
  name: string;
  quantity: number;
  unit: string;
  lowStockThreshold: number;
}

export interface ActiveOrderSignal {
  status: string;
  ageMinutes: number;
}

export interface ReservationSignal {
  partySize: number;
  startsInMinutes: number;
}

export interface IncidentRecommendationContext {
  incident: {
    type: string;
    severity: IncidentSeverity;
    status: string;
    ageMinutes: number;
    trigger: Record<string, string | number | boolean>;
  };
  restaurant: {
    timezone: string;
    currency: string;
    thresholds: Record<string, number>;
  };
  operations: {
    activeOrders: ActiveOrderSignal[];
    lowStockItems: ContextSignal[];
    upcomingReservations: ReservationSignal[];
  };
}

export interface RecommendationAction {
  description: string;
  rationale: string;
  expectedImpact: string;
}

export interface StructuredRecommendation {
  summary: string;
  rootCause: string;
  priority: IncidentSeverity;
  actions: RecommendationAction[];
  confidence: number;
}

export type RecommendationSource = "gemini" | "fallback" | "demo";

export interface RecommendationResult extends StructuredRecommendation {
  source: RecommendationSource;
  provider: string;
  generatedAt: Date;
}
