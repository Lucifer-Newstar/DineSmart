import { GoogleGenAI } from "@google/genai";
import type { IncidentRecommendationContext, StructuredRecommendation } from "./contracts.js";
import {
  buildRecommendationPrompt,
  RECOMMENDATION_RESPONSE_JSON_SCHEMA,
  RECOMMENDATION_SYSTEM_INSTRUCTION,
} from "./recommendation.prompt.js";
import { parseRecommendationOutput } from "./recommendation.validation.js";

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_REQUEST_TIMEOUT_MS = 7_000;

export interface GeminiTextGenerator {
  generate(prompt: string): Promise<string | undefined>;
}

export interface RecommendationProvider {
  readonly provider: string;
  generate(context: IncidentRecommendationContext): Promise<StructuredRecommendation>;
}

export class GoogleGeminiTextGenerator implements GeminiTextGenerator {
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(prompt: string): Promise<string | undefined> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        systemInstruction: RECOMMENDATION_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseJsonSchema: RECOMMENDATION_RESPONSE_JSON_SCHEMA,
        temperature: 0.2,
        maxOutputTokens: 900,
        abortSignal: AbortSignal.timeout(GEMINI_REQUEST_TIMEOUT_MS),
      },
    });
    return response.text;
  }
}

export class GeminiRecommendationProvider implements RecommendationProvider {
  readonly provider: string;

  constructor(
    private readonly generator: GeminiTextGenerator,
    model = DEFAULT_GEMINI_MODEL,
  ) {
    this.provider = model;
  }

  async generate(context: IncidentRecommendationContext): Promise<StructuredRecommendation> {
    const prompt = buildRecommendationPrompt(context);
    const rawOutput = await this.generator.generate(prompt);
    return parseRecommendationOutput(rawOutput, context.incident.severity);
  }
}
