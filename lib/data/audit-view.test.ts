import {
  findingCounts,
  findingReach,
  leadingQueries,
  pageNeedsAttention,
  pageScore,
  pageSeverities,
  planCard,
} from "@/lib/data/audit-view";
import type { ActionPlanMonth, WebsiteAuditFinding } from "@/lib/data/types";

const finding = (severity: WebsiteAuditFinding["severity"]): WebsiteAuditFinding => ({
  id: severity + Math.random(),
  severity,
  title: "t",
  category: "c",
  affectedPages: 0,
});

describe("findingCounts", () => {
  it("counts rows per severity, with opportunities under All only", () => {
    const counts = findingCounts([finding("critical"), finding("critical"), finding("low"), finding("opportunity")]);
    expect(counts).toEqual({ all: 4, critical: 2, high: 0, medium: 0, low: 1 });
  });
});

describe("findingReach", () => {
  it("calls a finding with no page count site-wide, never '0 pages'", () => {
    expect(findingReach(0, 17)).toBe("Site-wide");
  });
  it("calls a finding on every crawled page site-wide", () => {
    expect(findingReach(17, 17)).toBe("Site-wide");
  });
  it("names the page count otherwise", () => {
    expect(findingReach(1, 17)).toBe("1 page");
    expect(findingReach(4, 17)).toBe("4 pages");
  });
});

describe("page status", () => {
  it("has no score when the analyzer sent none", () => {
    expect(pageScore({})).toBeNull();
    expect(pageScore({ seoScore: 0 })).toBe(0);
  });
  it("judges by score when there is one", () => {
    expect(pageNeedsAttention(62, 0)).toBe(true);
    expect(pageNeedsAttention(85, 3)).toBe(false);
  });
  it("judges by issues when there is no score", () => {
    expect(pageNeedsAttention(null, 2)).toBe(true);
    expect(pageNeedsAttention(null, 0)).toBe(false);
  });
  it("lists the severities a page has, in order", () => {
    const issue = (severity: "critical" | "low") => ({ issue: "i", severity, whyItMatters: "", howToFix: "" });
    expect(pageSeverities({ detailedIssues: [issue("low"), issue("critical"), issue("low")] })).toEqual([
      "critical",
      "low",
    ]);
    expect(pageSeverities({})).toEqual([]);
  });
});

describe("planCard", () => {
  it("flattens every action and joins distinct priorities and timeframes", () => {
    const month: ActionPlanMonth = {
      month: 1,
      title: "Foundations",
      subtitle: "",
      categories: [
        { category: "Meta", goal: "", actions: ["Add titles", ""], priority: "P1", timeframe: "Week 1-2" },
        { category: "Meta", goal: "", actions: ["Add canonicals"], priority: "P1", timeframe: "Week 3" },
      ],
    };
    expect(planCard(month)).toEqual({ items: ["Add titles", "Add canonicals"], tag: "P1 · Week 1-2, Week 3" });
  });
  it("leaves the tag empty when nothing was sent", () => {
    const month: ActionPlanMonth = { month: 2, title: "", subtitle: "", categories: [] };
    expect(planCard(month).tag).toBe("");
  });
});

describe("leadingQueries", () => {
  it("puts the most clicked first, then the most seen", () => {
    const q = (query: string, clicks: number, impressions: number) => ({ query, clicks, impressions, ctr: 0, position: 1 });
    expect(leadingQueries([q("a", 0, 5), q("b", 9, 1), q("c", 0, 50)]).map((x) => x.query)).toEqual(["b", "c", "a"]);
  });
});
