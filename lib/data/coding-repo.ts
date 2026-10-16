import { devGlobal } from "@/lib/dev-global";
import { fixturesAllowed } from "@/lib/data/fixtures";

export type PullRequestStatus = "AWAITING REVIEW" | "MERGED" | "DRAFT PR";
export type PullRequestRisk = "LOW" | "MEDIUM" | "HIGH";

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  source: string;
  risk: PullRequestRisk;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  status: PullRequestStatus;
  detail: string;
  branch: string;
}

export interface CodingState {
  openPrs: number;
  merged: number;
  findingsCoveredOf: [number, number];
  checksPassingOf: [number, number];
  pullRequests: PullRequest[];
}

// Mutable (approveAndShip flips a PR to MERGED and adjusts the counters),
// so it must live on globalThis — see lib/dev-global.ts.
const SEED = devGlobal<Record<string, CodingState>>("coding_state", () => ({
  novaflow: {
    openPrs: 3,
    merged: 1,
    findingsCoveredOf: [7, 18],
    checksPassingOf: [12, 12],
    pullRequests: [
      {
        id: "pr421",
        number: 421,
        title: "Unblock 3 pages in robots.txt",
        source: "AUDIT · CRITICAL",
        risk: "LOW",
        filesChanged: 1,
        linesAdded: 3,
        linesRemoved: 2,
        status: "AWAITING REVIEW",
        detail: "Blocks 12 queued schema fixes from the On-Page SEO agent.",
        branch: "gw/robots-unblock",
      },
      {
        id: "pr422",
        number: 422,
        title: "Defer animation bundle, serve AVIF hero",
        source: "AUDIT · CRITICAL",
        risk: "MEDIUM",
        filesChanged: 6,
        linesAdded: 84,
        linesRemoved: 31,
        status: "AWAITING REVIEW",
        detail: "Targets mobile LCP 4.6s → est. 2.4s across 12 templates.",
        branch: "gw/mobile-lcp",
      },
      {
        id: "pr423",
        number: 423,
        title: "Server-side validation feedback on demo form",
        source: "AUDIT · CRITICAL",
        risk: "MEDIUM",
        filesChanged: 3,
        linesAdded: 112,
        linesRemoved: 8,
        status: "DRAFT PR",
        detail: "6% of submissions fail silently. Needs a CRM field before it can ship.",
        branch: "gw/form-validation",
      },
      {
        id: "pr418",
        number: 418,
        title: "Organization + Product schema sitewide",
        source: "GEO · P1",
        risk: "LOW",
        filesChanged: 9,
        linesAdded: 226,
        linesRemoved: 4,
        status: "MERGED",
        detail: "Shipped 25 Aug. Validated in Rich Results, no regressions.",
        branch: "gw/schema-org",
      },
    ],
  },
}));

export interface CodingRepo {
  get(businessId: string): Promise<CodingState | null>;
  approveAndShip(businessId: string, prId: string): Promise<void>;
}

class MockCodingRepo implements CodingRepo {
  async get(businessId: string): Promise<CodingState | null> {
    return fixturesAllowed() ? (SEED[businessId] ?? null) : null;
  }

  async approveAndShip(businessId: string, prId: string): Promise<void> {
    const state = SEED[businessId];
    if (!state) return;
    const pr = state.pullRequests.find((p) => p.id === prId);
    if (!pr || pr.status === "MERGED") return;
    pr.status = "MERGED";
    pr.detail = "Merged by CI, no manual deploy.";
    state.openPrs = Math.max(0, state.openPrs - 1);
    state.merged += 1;
  }
}

let instance: CodingRepo | null = null;

export function getCodingRepo(): CodingRepo {
  if (!instance) instance = new MockCodingRepo();
  return instance;
}
