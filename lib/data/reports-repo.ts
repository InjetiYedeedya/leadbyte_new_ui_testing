import type { ReportSummary } from "./types";
import { fixturesAllowed } from "@/lib/data/fixtures";

export interface ReportsRepo {
  list(businessId: string): Promise<ReportSummary[]>;
}

const SEED: Record<string, ReportSummary[]> = {
  novaflow: [
    { id: "full", title: "Full intelligence report", pages: 34, note: "Updated 2 min ago" },
    { id: "audit", title: "Website audit only", pages: 12, note: "Client-safe" },
    { id: "geo", title: "GEO visibility report", pages: 7, note: "Includes prompt log" },
    { id: "strategy", title: "Strategy & budget deck", pages: 9, note: "Board format" },
  ],
};

class MockReportsRepo implements ReportsRepo {
  async list(businessId: string): Promise<ReportSummary[]> {
    return fixturesAllowed() ? (SEED[businessId] ?? []) : [];
  }
}

let instance: ReportsRepo | null = null;

export function getReportsRepo(): ReportsRepo {
  if (!instance) instance = new MockReportsRepo();
  return instance;
}
