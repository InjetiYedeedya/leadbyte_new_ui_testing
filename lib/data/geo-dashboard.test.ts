import {
  categoryRows,
  enginesChecked,
  extractabilityBuckets,
  overallVerdict,
  quickWins,
  scoreTone,
  subScoreVerdict,
} from "@/lib/data/geo-dashboard";
import type { GeoAnalysisPage, GeoSignal } from "@/lib/data/types";

const page = (extractabilityScore: number | null): GeoAnalysisPage => ({
  url: "https://x.com",
  shortUrl: "/",
  extractabilityScore,
  geoIssueCount: 0,
  geoIssues: [],
  status: "",
});

const signal = (label: string, pages: number, group: GeoSignal["group"], total = 17): GeoSignal => ({
  label,
  pages,
  total,
  group,
});

describe("GEO dashboard bands", () => {
  it("colours and names scores at the same edges everywhere", () => {
    expect([scoreTone(100), scoreTone(80), scoreTone(79), scoreTone(50), scoreTone(49)]).toEqual([
      "good",
      "good",
      "warn",
      "warn",
      "crit",
    ]);
    expect(subScoreVerdict(100).label).toBe("Excellent");
    expect(subScoreVerdict(62).label).toBe("Needs work");
    expect(subScoreVerdict(32).label).toBe("Poor");
    expect(overallVerdict(62).label).toBe("Needs improvement");
    expect(overallVerdict(85).label).toBe("Strong");
  });
});

describe("extractabilityBuckets", () => {
  it("sorts scored pages into three bands and leaves unscored ones out", () => {
    expect(extractabilityBuckets([page(100), page(80), page(60), page(50), page(10), page(null)])).toEqual({
      good: 2,
      partial: 2,
      poor: 1,
      scored: 5,
    });
  });
});

describe("categoryRows", () => {
  it("counts missing page-checks per group, in the fixed order", () => {
    const rows = categoryRows([
      signal("Author named", 0, "Trust & authorship"),
      signal("Questions as headings", 12, "Structure"),
      signal("Answer near the top", 17, "Structure"),
    ]);
    expect(rows.map((r) => r.group)).toEqual(["Structure", "Trust & authorship"]);
    expect(rows[0]).toMatchObject({ missing: 5, passing: 1, checks: 2, coverage: 85 });
    expect(rows[1]).toMatchObject({ missing: 17, passing: 0, coverage: 0 });
  });

  it("is empty with no signals", () => {
    expect(categoryRows([])).toEqual([]);
  });
});

describe("quickWins", () => {
  it("ranks the signals missing from the most pages, and skips ones every page has", () => {
    const wins = quickWins([
      signal("Published date", 10, "Trust & authorship"),
      signal("Author named", 5, "Trust & authorship"),
      signal("Schema.org markup", 17, "Markup"),
      signal("FAQ or Article schema", 16, "Markup"),
    ]);
    expect(wins[0]).toMatchObject({ pages: 12, total: 17, group: "Trust & authorship" });
    expect(wins.map((w) => w.title)).toEqual([
      "Add an author byline to 12 pages",
      "Add a published or updated date to 7 pages",
      "Add FAQ or Article schema to 1 page",
    ]);
  });
});

describe("enginesChecked", () => {
  it("names each engine once, only for crawlers that were checked", () => {
    expect(
      enginesChecked([
        { bot: "GPTBot", access: "allowed" },
        { bot: "ChatGPT-User", access: "allowed" },
        { bot: "ClaudeBot", access: "blocked" },
        { bot: "CCBot", access: "allowed" },
        { bot: "Google-Extended", access: "unknown" },
      ]),
    ).toEqual(["ChatGPT", "Claude", "Google AI"]);
  });
});

