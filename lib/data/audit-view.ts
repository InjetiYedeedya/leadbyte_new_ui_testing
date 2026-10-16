import type {
  ActionPlanMonth,
  FindingSeverity,
  WebsiteAuditFinding,
  WebsiteAuditPage,
} from "@/lib/data/types";
import type { SearchQuery } from "@/lib/data/search-console";

/**
 * What the Website audit screen shows, worked out from the audit.
 *
 * Pure and tested because every value here is a claim about the customer's
 * site. The page itself has no test; the rules it follows live here.
 */

/** The four severities the screen filters by. "opportunity" is shown under All only. */
export const FILTER_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type FilterSeverity = (typeof FILTER_SEVERITIES)[number];

/** How many findings of each severity, for the filter tabs. Counts rows, so a tab never promises rows it will not show. */
export function findingCounts(findings: readonly WebsiteAuditFinding[]): Record<FilterSeverity | "all", number> {
  const counts = { all: findings.length, critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings) {
    if (finding.severity !== "opportunity") counts[finding.severity] += 1;
  }
  return counts;
}

/**
 * Where a finding applies. The backend reports a site-wide finding with no
 * page count, and "0 pages" would read as "affects nothing".
 */
export function findingReach(affectedPages: number, pagesCrawled: number): string {
  if (affectedPages <= 0 || (pagesCrawled > 1 && affectedPages >= pagesCrawled)) return "Site-wide";
  return `${affectedPages} ${affectedPages === 1 ? "page" : "pages"}`;
}

/** A page's score, or null when the analyzer sent none. */
export function pageScore(page: Pick<WebsiteAuditPage, "seoScore">): number | null {
  return typeof page.seoScore === "number" ? page.seoScore : null;
}

/**
 * Whether a page needs work: from its score when it has one (under 80, the
 * same line the rest of the app draws between warn and good), from its issue
 * count when it does not.
 */
export function pageNeedsAttention(score: number | null, issueCount: number): boolean {
  return score === null ? issueCount > 0 : score < 80;
}

/** Every severity a page has at least one explained issue of. */
export function pageSeverities(page: Pick<WebsiteAuditPage, "detailedIssues">): FilterSeverity[] {
  const found = new Set<FindingSeverity>((page.detailedIssues ?? []).map((issue) => issue.severity));
  return FILTER_SEVERITIES.filter((severity) => found.has(severity));
}

/**
 * One month of the plan as the card shows it: every action as a checklist
 * item, and one tag line with the month's distinct priorities and timeframes.
 */
export function planCard(month: ActionPlanMonth): { items: string[]; tag: string } {
  const items = month.categories.flatMap((task) => task.actions).filter((action) => action.trim() !== "");
  const unique = (values: string[]) => [...new Set(values.filter((value) => value.trim() !== ""))];
  const priorities = unique(month.categories.map((task) => task.priority));
  const timeframes = unique(month.categories.map((task) => task.timeframe));
  const tag = [priorities.join(", "), timeframes.join(", ")].filter((part) => part !== "").join(" · ");
  return { items, tag };
}

/** The queries the card leads with: most clicks first, then most impressions. */
export function leadingQueries(queries: readonly SearchQuery[]): SearchQuery[] {
  return [...queries].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}
