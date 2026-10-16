import { isBackendConfigured } from "@/lib/api/config";
import { analysedAtOf, fetchLatestAnalysis, mapGeoAnalysis } from "./website-analysis";
import type { GeoAnalysis } from "./types";

export interface GeoAnalysisRepo {
  get(businessId: string): Promise<GeoAnalysis | null>;
}

const SEED: Record<string, GeoAnalysis> = {
  novaflow: {
    businessId: "novaflow",
    score: 61,
    engineCoverage: [
      { engine: "ChatGPT", cited: 4, outOf: 12 },
      { engine: "Perplexity", cited: 7, outOf: 12 },
      { engine: "Google AI", cited: 3, outOf: 12 },
      { engine: "Copilot", cited: 2, outOf: 12 },
    ],
    strengths: [
      "Product pages answer buyer questions directly — good extractable phrasing.",
      "Perplexity cites your SEO automation page for 7 of 12 seed prompts.",
    ],
    weaknesses: [
      "No Organization or Product schema — engines can't resolve NovaFlow as an entity.",
      "Zero third-party citations in the last 6 months.",
    ],
    opportunities: [
      '"Best marketing automation for small B2B teams" — 0 coverage, high intent.',
      "Category glossary would earn definitional citations.",
    ],
    risks: [
      "Two competitors already own the comparison answer space.",
      "Thin About page weakens trust signals in generated answers.",
    ],
  },
};

class MockGeoAnalysisRepo implements GeoAnalysisRepo {
  async get(businessId: string): Promise<GeoAnalysis | null> {
    return SEED[businessId] ?? null;
  }
}

class HttpGeoAnalysisRepo implements GeoAnalysisRepo {
  async get(businessId: string): Promise<GeoAnalysis | null> {
    const payload = await fetchLatestAnalysis(businessId);
    if (!payload) return null;
    return mapGeoAnalysis(businessId, payload.geo, analysedAtOf(payload));
  }
}

let instance: GeoAnalysisRepo | null = null;

export function getGeoAnalysisRepo(): GeoAnalysisRepo {
  if (!instance) {
    instance = isBackendConfigured() ? new HttpGeoAnalysisRepo() : new MockGeoAnalysisRepo();
  }
  return instance;
}
