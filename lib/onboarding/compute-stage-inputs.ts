import { cache } from "react";
import { getWebsiteAuditRepo } from "@/lib/data/website-audit-repo";
import { getConnectionsRepo } from "@/lib/data/connections-repo";
import { getStrategyRepo } from "@/lib/data/strategy-repo";
import { getAgentRepo } from "@/lib/data/agent-repo";
import type { StageInputs } from "./stage-flags";

/**
 * Wrapped in React `cache()`: PageShell calls this on every authenticated
 * page, and in live mode each repo is one or more HTTP round trips. Without
 * memoisation a single page render repeats the whole fan-out for any component
 * that asks again.
 *
 * Builds the real StageInputs for a business from every repository's
 * actual current state. This is what closes the gap Phase 0 left open
 * (the Overview page's flags were hardcoded there) — getStageFlags itself
 * was already correct; this is the piece that feeds it real data instead
 * of fixture booleans.
 */
export const computeStageInputs = cache(async function computeStageInputs(
  businessId: string,
): Promise<StageInputs> {
  const [audit, connections, strategy, agentStates] = await Promise.all([
    getWebsiteAuditRepo().get(businessId),
    getConnectionsRepo().get(businessId),
    getStrategyRepo().get(businessId),
    getAgentRepo().listStates(businessId),
  ]);

  return {
    // NOT just `audit !== null`. A row exists the moment the analysis writes
    // anything, so the rail ticked Audit green while the page under it said
    // "fix 2 critical findings" and showed 0/100 — the tick was reporting that
    // we had tried, which is not what a customer reads it as.
    //
    // A score is no longer the test, though. The backend restored its auditor
    // on 2026-09-07 and now returns real crawls — 5 pages, 20 issues — while
    // `healthScore` alone stays 0 and therefore maps to null. Requiring a
    // score meant a complete, populated audit never ticked, so `/` sent
    // everyone back to the website screen after every sign-in, forever.
    //
    // Pages crawled is the honest test: it is a fact about the run, it comes
    // from the backend, and it is 0 for the "a row exists but nothing happened"
    // case this guard was written for.
    auditComplete: audit !== null && (audit.score !== null || audit.pagesCrawled > 0),
    connectionsResolved: connections.googleAnalyticsConnected || connections.skipped,
    strategyGenerated: strategy.generated,
    agentActive: agentStates.some((s) => s.runs.length > 0),
  };
})
