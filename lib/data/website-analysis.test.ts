import { describe, expect, it } from "vitest";
import {
  groupPlanCategories,
  mapBrandProfile,
  mapGeoAnalysis,
  mapWebsiteAudit,
} from "./website-analysis";

/** Trimmed from a real response captured 2026-08-27. */
const SEO = {
  siteWideAudit: {
    healthScore: 0,
    crawledPages: 17,
    totalIssuesFound: 69,
    pagesWithMissingTitle: 0,
    pagesWithMissingDesc: 17,
    pagesWithMissingH1: 0,
    pagesWithNoSchema: 9,
    pagesWithMissingOg: 17,
    pagesWithMissingCanonical: 17,
    pagesWithMissingAlt: 1,
    technicalChecklist: {
      httpsSecure: true,
      robotsTxtFound: true,
      sitemapFound: true,
      ga4Detected: false,
      gtmDetected: true,
    },
  },
  siteSynthesis: {
    keyFindings: [
      { title: "Site health score is 0", severity: "critical", text: "High issue volume." },
      { title: "All pages missing meta description", severity: "critical", text: "17/17." },
      { title: "No GA4 detected", severity: "high", text: "Tracking gap." },
      { title: "Images missing alt", severity: "opportunity", text: "Some pages." },
    ],
  },
};

const GEO = {
  geoWideAudit: {
    geoScore: 62,
    crawlabilityScore: 100,
    entityScore: 62,
    contentScore: 56,
    trustScore: 32,
    crawledPages: 17,
    pagesWithSchema: 8,
    pagesWithAuthor: 0,
    llmsTxtFound: true,
    issueRanking: "Missing author: 17/17 pages\nNo FAQ schema: 15/17 pages",
    aiBotStatus: { GPTBot: "allowed", ClaudeBot: "allowed", CCBot: "blocked" },
  },
};

describe("mapWebsiteAudit", () => {
  it("maps the real response", () => {
    const audit = mapWebsiteAudit("a@b.com", SEO, "2026-08-27T08:30:00Z")!;
    // `healthScore` is not read at all any more — the backend asked us to drop
    // it. This fixture has no `avgLlmSeoScore`, so there is no score to show.
    expect(audit.score).toBeNull();
    expect(audit.pagesCrawled).toBe(17);
    expect(audit.totalIssues).toBe(69);
    expect(audit.analysedAt).toBe("2026-08-27T08:30:00Z");
  });

  it("counts severities from the findings the backend sent", () => {
    const audit = mapWebsiteAudit("a@b.com", SEO)!;
    expect(audit.criticalCount).toBe(2);
    expect(audit.highCount).toBe(1);
    expect(audit.findings).toHaveLength(4);
  });

  it("keeps `opportunity`, which is a real backend severity", () => {
    const audit = mapWebsiteAudit("a@b.com", SEO)!;
    expect(audit.findings.map((f) => f.severity)).toContain("opportunity");
  });

  it("coerces an unrecognised severity rather than trusting it blindly", () => {
    const audit = mapWebsiteAudit("a@b.com", {
      siteSynthesis: { keyFindings: [{ title: "X", severity: "catastrophic" }] },
    })!;
    expect(audit.findings[0]!.severity).toBe("opportunity");
  });

  it("reports affectedPages as 0 because the backend does not send it", () => {
    // Site-level findings only. Any per-page number here would be invented.
    const audit = mapWebsiteAudit("a@b.com", SEO)!;
    expect(audit.findings.every((f) => f.affectedPages === 0)).toBe(true);
  });

  it("derives category scores from real per-page counts", () => {
    const audit = mapWebsiteAudit("a@b.com", SEO)!;
    const byName = Object.fromEntries(audit.categoryScores.map((c) => [c.category, c.score]));
    // 17 of 17 pages missing meta descriptions -> 0%
    expect(byName["Meta descriptions"]).toBe(0);
    // 0 of 17 missing a title -> 100%
    expect(byName["Page titles"]).toBe(100);
    // 9 of 17 without schema -> 47%. Named "Schema coverage", not "Structured
    // data": GEO reports a DIFFERENT backend field under the Markup group, and
    // two broad-sounding labels over two different counts read as a
    // contradiction — 100% here beside 1 of 17 there.
    expect(byName["Schema coverage"]).toBe(47);
    // 4 of 5 technical checks pass -> 80%
    expect(byName["Technical setup"]).toBe(80);
  });

  it("returns no category breakdown when nothing was crawled", () => {
    // Better an absent breakdown than a row of misleading 100s.
    const audit = mapWebsiteAudit("a@b.com", { siteWideAudit: { crawledPages: 0 } })!;
    expect(audit.categoryScores).toEqual([]);
  });

  it("returns null for an absent seo section", () => {
    expect(mapWebsiteAudit("a@b.com", null)).toBeNull();
    expect(mapWebsiteAudit("a@b.com", {})).toBeNull();
  });
});

describe("mapGeoAnalysis", () => {
  it("maps the readiness scores", () => {
    const geo = mapGeoAnalysis("a@b.com", GEO)!;
    expect(geo.score).toBe(62);
    expect(geo.subScores).toEqual([
      { label: "Crawlability", score: 100 },
      { label: "Entity clarity", score: 62 },
      { label: "Content", score: 56 },
      { label: "Trust", score: 32 },
    ]);
  });

  it("leaves engineCoverage empty — the backend does not measure citations", () => {
    // The single most important assertion here: we must not invent per-engine
    // citation counts the backend has no data for.
    expect(mapGeoAnalysis("a@b.com", GEO)!.engineCoverage).toEqual([]);
  });

  it("reads which AI crawlers are blocked", () => {
    const geo = mapGeoAnalysis("a@b.com", GEO)!;
    expect(geo.aiBots).toEqual([
      { bot: "GPTBot", access: "allowed" },
      { bot: "ClaudeBot", access: "allowed" },
      { bot: "CCBot", access: "blocked" },
    ]);
    expect(geo.weaknesses.some((w) => w.includes("CCBot"))).toBe(true);
    expect(geo.risks).toHaveLength(1);
  });

  it("treats 'not specified' as unknown, NOT as blocked", () => {
    // The backend emits "not specified" when robots.txt is silent about a
    // crawler. Folding that into "blocked" told customers a crawler was
    // blocked when nothing of the kind had been established.
    const geo = mapGeoAnalysis("a@b.com", {
      geoWideAudit: { aiBotStatus: { GPTBot: "allowed", CCBot: "not specified" } },
    })!;

    expect(geo.aiBots).toEqual([
      { bot: "GPTBot", access: "allowed" },
      { bot: "CCBot", access: "unknown" },
    ]);
    expect(geo.weaknesses.some((w) => w.includes("CCBot"))).toBe(false);
    expect(geo.risks).toEqual([]);
  });

  it("does not claim all crawlers are allowed when one is blocked", () => {
    const geo = mapGeoAnalysis("a@b.com", GEO)!;
    expect(geo.strengths.some((s) => s.includes("All"))).toBe(false);
  });

  it("does not claim all crawlers are allowed when one is merely unknown", () => {
    // "All allowed" is a claim; it needs every bot explicitly allowed.
    const geo = mapGeoAnalysis("a@b.com", {
      geoWideAudit: { aiBotStatus: { GPTBot: "allowed", CCBot: "not specified" } },
    })!;
    expect(geo.strengths.some((s) => s.includes("All"))).toBe(false);
  });

  it("credits a site where every crawler is explicitly allowed", () => {
    const geo = mapGeoAnalysis("a@b.com", {
      geoWideAudit: { aiBotStatus: { GPTBot: "allowed", ClaudeBot: "allowed" }, llmsTxtFound: true },
    })!;
    expect(geo.strengths.some((s) => s.includes("All 2 AI crawlers"))).toBe(true);
    expect(geo.risks).toEqual([]);
  });

  it("flags a missing llms.txt", () => {
    const geo = mapGeoAnalysis("a@b.com", { geoWideAudit: { llmsTxtFound: false } })!;
    expect(geo.weaknesses.some((w) => w.includes("llms.txt"))).toBe(true);
  });

  it("splits the backend's ranked issue summary into lines", () => {
    const geo = mapGeoAnalysis("a@b.com", GEO)!;
    expect(geo.opportunities).toEqual([
      "Missing author: 17/17 pages",
      "No FAQ schema: 15/17 pages",
    ]);
  });

  it("returns null for an absent geo section", () => {
    expect(mapGeoAnalysis("a@b.com", null)).toBeNull();
    expect(mapGeoAnalysis("a@b.com", {})).toBeNull();
  });
});

/**
 * `brand_profile` was declared on AnalysisPayload but never mapped, so the
 * Business profile screen read only Leadbyte_User_Overall_Details and showed
 * "No website details yet" for a brand-new account whose analysis had in fact
 * completed. Field names come from the backend contract (2026-09-02) and the
 * integration map; plausible variants are accepted because a wrong guess here
 * has cost this project three separate bugs.
 */
describe("mapBrandProfile", () => {
  const FULL = {
    company_name: "ZippyGo",
    contact_details: { emails: ["hi@zippygo.com"] },
    brand_profile: {
      facts: { business_overview: "Voice-based flight booking." },
    },
  };

  it("reads the company name and the nested business overview", () => {
    const p = mapBrandProfile("a@b.com", FULL, undefined);

    expect(p?.businessName).toBe("ZippyGo");
    expect(p?.description).toBe("Voice-based flight booking.");
  });

  it("takes businessType and industry from the seo section when present", () => {
    const p = mapBrandProfile("a@b.com", FULL, {
      businessName: "ZippyGo",
      businessType: "Travel & Tourism",
      industry: "Flight booking",
    });

    expect(p?.businessType).toBe("Travel & Tourism");
    expect(p?.industry).toBe("Flight booking");
  });

  it("ignores the backend's known placeholder values rather than showing them", () => {
    const p = mapBrandProfile("a@b.com", FULL, {
      businessType: "Unknown Business",
      industry: "General",
    });

    // A8 in docs/backend/BACKEND.md: these come back as placeholders for sites
    // with plenty of content. Rendering them is worse than rendering nothing.
    expect(p?.businessType).toBe("");
    expect(p?.industry).toBe("");
  });

  /**
   * Captured from a real bakery account (2026-09-15): the backend has been
   * sending `brand_profile.competitors` all along and nothing read it.
   */
  it("reads the competitors the analysis names", () => {
    const p = mapBrandProfile(
      "a@b.com",
      {
        brand_profile: {
          competitors: [
            {
              name: "Bourke Street Bakery",
              url: "https://bourkestreetbakery.com.au",
              reason: "artisan breads and pastries",
            },
            { name: "Sonoma Bakery", url: "sonoma.com.au" },
          ],
        },
      },
      undefined,
    );

    expect(p?.brand?.competitors?.[0]).toEqual({
      name: "Bourke Street Bakery",
      url: "https://bourkestreetbakery.com.au",
      reason: "artisan breads and pastries",
    });
    // A scheme-less url in an href is a RELATIVE path — the same bug the
    // header chip had, which linked to /overview/go.chefgaa.com.
    expect(p?.brand?.competitors?.[1]).toEqual({
      name: "Sonoma Bakery",
      url: "https://sonoma.com.au",
      reason: undefined,
    });
  });

  it("drops calls to action that are just carousel arrows, not real button text", () => {
    // Captured from a real account: the crawler's button/link detector picked
    // up a carousel's "‹"/"›" controls alongside "Subscribe", a real one.
    const p = mapBrandProfile(
      "a@b.com",
      {
        brand_profile: {
          facts: { calls_to_action: ["‹", "›", "Subscribe"] },
        },
      },
      undefined,
    );

    expect(p?.brand?.callsToAction).toEqual(["Subscribe"]);
  });

  it("drops competitors it cannot name, and repeats of one it can", () => {
    const p = mapBrandProfile(
      "a@b.com",
      {
        brand_profile: {
          competitors: [
            { url: "https://nameless.com" },
            { name: "Sonoma Bakery" },
            { name: "sonoma bakery", url: "https://sonoma.com.au" },
            "just a string",
          ],
        },
      },
      undefined,
    );

    expect(p?.brand?.competitors?.map((c) => c.name)).toEqual(["Sonoma Bakery"]);
  });

  it("has no competitors when the payload carries none", () => {
    expect(mapBrandProfile("a@b.com", FULL, undefined)?.brand?.competitors).toEqual([]);
  });

  it("falls back to the seo businessName when brand_profile has no company_name", () => {
    const p = mapBrandProfile("a@b.com", {}, { businessName: "FromSeo" });

    expect(p?.businessName).toBe("FromSeo");
  });

  it("accepts the alternative spellings a payload might use", () => {
    const p = mapBrandProfile(
      "a@b.com",
      { companyName: "CamelCase", description: "Direct description" },
      undefined,
    );

    expect(p?.businessName).toBe("CamelCase");
    expect(p?.description).toBe("Direct description");
  });

  it("returns null when there is no brand profile and no seo section", () => {
    expect(mapBrandProfile("a@b.com", undefined, undefined)).toBeNull();
    expect(mapBrandProfile("a@b.com", {}, {})).toBeNull();
  });

  it("carries the websiteUrl through alongside real details", () => {
    const p = mapBrandProfile(
      "a@b.com",
      { company_name: "ZippyGo", website_url: "zippygo.com" },
      undefined,
    );

    expect(p?.websiteUrl).toBe("zippygo.com");
  });

  it("does NOT count a bare websiteUrl as details — that was the blank-panel bug", () => {
    // A profile row carrying only a URL is what made the Business profile
    // screen render a heading over an empty panel.
    expect(mapBrandProfile("a@b.com", { website_url: "zippygo.com" }, undefined)).toBeNull();
  });
});

describe("unscored analyses", () => {
  it("keeps a real audit score when the backend sends one", () => {
    // `avgLlmSeoScore` since 2026-09-07 — `healthScore` is no longer read at
    // all, at the backend's request.
    const seo = { siteWideAudit: { avgLlmSeoScore: 64, crawledPages: 3 }, siteSynthesis: {} };
    expect(mapWebsiteAudit("a@b.com", seo, undefined)?.score).toBe(64);
  });

  it("reads a zero GEO score with NO other scores as unscored", () => {
    // Sharpened on 2026-09-07. An earlier version of this test asserted 0,
    // reasoning that a site blocking every AI crawler earns a real zero. True
    // — but a payload with no sub-scores at all cannot tell that site apart
    // from an auditor that produced nothing, and every real payload measured
    // since carries the five sub-scores alongside. So the decision is made on
    // the companions (see `score()`), and with none the honest answer is "not
    // scored".
    const geo = { geoWideAudit: { geoScore: 0, crawledPages: 1 } };
    expect(mapGeoAnalysis("a@b.com", geo, undefined)?.score).toBeNull();
  });

  it("shows a zero GEO score as a zero when the sub-scores are real", () => {
    // The blocks-every-crawler case as it actually arrives: crawlability 100,
    // content 47 — and a geoScore of 0 that means exactly what it says.
    const geo = {
      geoWideAudit: { geoScore: 0, crawlabilityScore: 100, contentScore: 47, crawledPages: 22 },
    };
    expect(mapGeoAnalysis("a@b.com", geo, undefined)?.score).toBe(0);
  });

  it("still reads a zero health score as unscored", () => {
    // `healthScore` is the one axis the backend does not compute: it comes
    // back 0 beside a genuine 5-page crawl with 20 issues found.
    const seo = {
      siteWideAudit: { healthScore: 0, crawledPages: 5, totalIssuesFound: 20 },
      siteSynthesis: {},
    };
    const audit = mapWebsiteAudit("a@b.com", seo, undefined);
    expect(audit?.score).toBeNull();
    expect(audit?.pagesCrawled).toBe(5);
    expect(audit?.totalIssues).toBe(20);
  });

  it("keeps a real GEO score when the backend sends one", () => {
    const geo = { geoWideAudit: { geoScore: 62, crawledPages: 1 } };
    expect(mapGeoAnalysis("a@b.com", geo, undefined)?.score).toBe(62);
  });
});

describe("the audit score comes from avgLlmSeoScore, not healthScore", () => {
  // Asked for by the backend on 2026-09-07, and the full payload for
  // go.chefgaa.com shows why: healthScore 0 on a site with a perfect title,
  // meta description, H1, alt text and viewport on all 22 pages — every one of
  // the 101 issues is a missing canonical, OG tag or schema block. A single
  // number reading 0 there is not something a customer can act on.
  const REAL = {
    siteWideAudit: {
      healthScore: 0,
      avgLlmSeoScore: 61,
      crawledPages: 22,
      totalIssuesFound: 101,
      kpiTargets: [
        { kpi: "Health Score", current: "0%", month1: "30%", month3: "75%" },
        { kpi: "Schema coverage", current: "0/22", month1: "5/22", month3: "22/22" },
      ],
    },
  };

  it("shows the LLM SEO score", () => {
    expect(mapWebsiteAudit("b1", REAL)?.score).toBe(61);
  });

  it("ignores healthScore even when it is the only score present", () => {
    const audit = mapWebsiteAudit("b1", { siteWideAudit: { healthScore: 80, crawledPages: 5 } });
    expect(audit?.score).toBeNull();
  });

  it("drops the Health Score row from the KPI table too", () => {
    // Not shown means not shown anywhere. Leaving it four rows down puts the
    // discarded number back on the same screen.
    const kpis = mapWebsiteAudit("b1", REAL)?.kpiTargets ?? [];
    expect(kpis.map((k) => k.kpi)).toEqual(["Schema coverage"]);
  });

  it("keeps the issue counts, which are real either way", () => {
    const audit = mapWebsiteAudit("b1", REAL);
    expect(audit?.pagesCrawled).toBe(22);
    expect(audit?.totalIssues).toBe(101);
  });
});

describe("a zero score: broken calculation, or a real verdict?", () => {
  // The zero->null rule was written when EVERY axis came back 0 and the
  // calculation plainly did not exist. That is no longer the situation:
  // measured on go.chefgaa.com 2026-09-07, healthScore was 0 while
  // avgLlmSeoScore was 60, geoScore 37, content 47, extractability 62 — and
  // the audit's own counts explain the zero: 22 pages crawled,
  // pagesWithZeroIssues 0, all 22 missing canonical, OG and schema. Not one
  // clean page, so a health score of 0 is CORRECT.
  //
  // So the question a zero has to answer is "was anything scored at all",
  // which is a fact about the whole payload, not about one field.

  it("reports nothing when the LLM SEO score itself is zero", () => {
    // The original symptom: the auditor was unreachable and every axis came
    // back 0, and "0/100" in red told customers their site had failed
    // everything.
    const audit = mapWebsiteAudit("b1", {
      siteWideAudit: { avgLlmSeoScore: 0, crawledPages: 22 },
    });
    expect(audit?.score).toBeNull();
  });

  it("applies the same rule to the GEO score", () => {
    const scored = mapGeoAnalysis("b1", {
      geoWideAudit: { geoScore: 0, contentScore: 47, crawledPages: 22 },
    });
    expect(scored?.score).toBe(0);

    const unscored = mapGeoAnalysis("b1", {
      geoWideAudit: { geoScore: 0, contentScore: 0, trustScore: 0, crawledPages: 22 },
    });
    expect(unscored?.score).toBeNull();
  });
});

describe("GEO evidence signals", () => {
  // The per-page counts behind the four scores. Captured from the full
  // auditor payload for go.chefgaa.com (2026-09-07): the page showed
  // "content 47" and "entity 0" with nothing to explain either, while the
  // payload already said WHY — 14 of 22 pages use question headings, none
  // carry an author, none have FAQ schema.
  const AUDIT = {
    geoWideAudit: {
      crawledPages: 22,
      geoScore: 37,
      pagesWithQuestionHeadings: 14,
      pagesWithEarlyAnswer: 4,
      pagesWithFaqSchema: 0,
      pagesWithSchema: 0,
      pagesWithEntityMarkup: 0,
      pagesWithKnowledgeGraph: 0,
      pagesWithAuthor: 0,
      pagesWithPublishedDate: 0,
      pagesWithOutboundCitations: 0,
      pagesWithSocialProfiles: 0,
      pagesWithEditorialPolicy: 0,
      pagesWithEeatDepth: 1,
      totalGeoIssues: 225,
    },
  };

  it("reports each signal as pages-out-of-crawled", () => {
    const signals = mapGeoAnalysis("b1", AUDIT)?.signals ?? [];
    const byLabel = Object.fromEntries(signals.map((s) => [s.label, s]));

    expect(byLabel["Questions as headings"]).toEqual({
      label: "Questions as headings",
      pages: 14,
      total: 22,
      group: "Structure",
    });
    expect(byLabel["Author named"]?.pages).toBe(0);
  });

  it("keeps the strengths, not only the gaps", () => {
    // A page of zeros reads as a broken site. 14/22 already doing the right
    // thing is the most encouraging fact on the screen.
    const signals = mapGeoAnalysis("b1", AUDIT)?.signals ?? [];
    expect(signals.some((s) => s.pages > 0)).toBe(true);
  });

  it("groups them, because the four scores each have their own causes", () => {
    const groups = new Set((mapGeoAnalysis("b1", AUDIT)?.signals ?? []).map((s) => s.group));
    expect([...groups]).toEqual(["Structure", "Markup", "Trust & authorship"]);
  });

  it("OMITS a signal the payload never measured", () => {
    // Absent is not zero. Rendering "0 of 22" for something never checked
    // invents a failing grade.
    const signals =
      mapGeoAnalysis("b1", {
        geoWideAudit: { crawledPages: 22, pagesWithAuthor: 0 },
      })?.signals ?? [];

    expect(signals.map((s) => s.label)).toEqual(["Author named"]);
  });

  it("has no signals at all when nothing was crawled", () => {
    // Every one of these is "N of the pages we crawled". With no pages the
    // denominator is a lie.
    expect(mapGeoAnalysis("b1", { geoWideAudit: { pagesWithAuthor: 3 } })?.signals).toEqual([]);
  });

  it("carries the GEO issue total, which is its own headline", () => {
    // 225 GEO issues against 101 SEO ones — the page never said so.
    expect(mapGeoAnalysis("b1", AUDIT)?.totalIssues).toBe(225);
  });
});

describe("groupPlanCategories", () => {
  function task(category: string, goal: string, timeframe: string) {
    return { category, goal, actions: [goal], priority: "P1", timeframe };
  }

  /**
   * Month 1 of a live plan carries two tasks both headed "On-page SEO" —
   * different goals, different weeks. Keyed on the category they collided and
   * React warned about duplicate keys; rendered straight they were the same
   * heading twice with no explanation.
   */
  it("gathers two tasks sharing a label under one heading", () => {
    const out = groupPlanCategories([
      task("On-page SEO", "Add missing meta descriptions", "Week 1"),
      task("On-page SEO", "Implement Open Graph tags", "Week 2"),
    ]);

    expect(out).toHaveLength(1);
    expect(out[0]?.category).toBe("On-page SEO");
    expect(out[0]?.tasks).toHaveLength(2);
  });

  it("keeps each task's own timeframe rather than merging them", () => {
    // The sequencing is what the plan is FOR; flattening loses a week of it.
    const out = groupPlanCategories([
      task("On-page SEO", "Add missing meta descriptions", "Week 1"),
      task("On-page SEO", "Implement Open Graph tags", "Week 2"),
    ]);

    expect(out[0]?.tasks.map((t) => t.timeframe)).toEqual(["Week 1", "Week 2"]);
  });

  it("preserves the backend's order, for groups and tasks alike", () => {
    const out = groupPlanCategories([
      task("On-page SEO", "a", "Week 1"),
      task("Image Optimization", "b", "Week 2"),
      task("On-page SEO", "c", "Week 3"),
    ]);

    expect(out.map((g) => g.category)).toEqual(["On-page SEO", "Image Optimization"]);
    expect(out[0]?.tasks.map((t) => t.goal)).toEqual(["a", "c"]);
  });

  it("gives each untitled task its own group rather than one empty bucket", () => {
    const out = groupPlanCategories([task("", "a", "Week 1"), task("", "b", "Week 2")]);

    expect(out).toHaveLength(2);
  });

  it("handles an empty plan", () => {
    expect(groupPlanCategories([])).toEqual([]);
  });
});

/**
 * Where the business says it is.
 *
 * Every part of `business_details` is routinely empty — a SaaS with no
 * premises lists no address and keeps no opening hours — so the job here is
 * mostly deciding when NOT to claim a location at all.
 */
describe("mapBrandProfile: location", () => {
  const withDetails = (business_details: unknown) => ({
    company_name: "ZippyGo",
    brand_profile: { facts: { business_overview: "Voice-based flight booking.", business_details } },
  });

  it("reads addresses, hours and map links", () => {
    const p = mapBrandProfile(
      "a@b.com",
      withDetails({
        location: ["Hyderabad, Telangana, India"],
        business_hours: ["Mon-Fri 9am-6pm"],
        map_links: ["https://maps.google.com/?q=zippygo"],
      }),
      undefined,
    );

    expect(p?.brand?.location?.addresses).toEqual(["Hyderabad, Telangana, India"]);
    expect(p?.brand?.location?.hours).toEqual(["Mon-Fri 9am-6pm"]);
    expect(p?.brand?.location?.mapLinks).toEqual(["https://maps.google.com/?q=zippygo"]);
  });

  it("reports NO location for an online-only business rather than empty lists", () => {
    // The card renders on `location` being present at all, so an empty object
    // here would put a "Location" heading above nothing on every SaaS account.
    const p = mapBrandProfile("a@b.com", withDetails({ location: [], business_hours: [] }), undefined);
    expect(p?.brand?.location).toBeUndefined();
  });

  it("reports no location when the payload omits business_details entirely", () => {
    const p = mapBrandProfile("a@b.com", withDetails(undefined), undefined);
    expect(p?.brand?.location).toBeUndefined();
  });

  it("keeps a location that has only an address", () => {
    // Partial is the normal case and is worth showing — an address with no
    // opening hours still answers "where are they".
    const p = mapBrandProfile("a@b.com", withDetails({ location: ["Hyderabad"] }), undefined);
    expect(p?.brand?.location?.addresses).toEqual(["Hyderabad"]);
    expect(p?.brand?.location?.hours).toBeUndefined();
  });

  it("drops blank entries instead of rendering empty rows", () => {
    const p = mapBrandProfile("a@b.com", withDetails({ location: ["  ", "Hyderabad", ""] }), undefined);
    expect(p?.brand?.location?.addresses).toEqual(["Hyderabad"]);
  });
});

/**
 * The lines the site leads with.
 *
 * The risk here is not a failed read, it is a CONFIDENT WRONG one: presenting
 * some subpage's headline as "your messaging" is a claim the customer cannot
 * check against the screen.
 */
describe("mapBrandProfile: messaging", () => {
  const seo = (perPageReport: unknown) => ({ perPageReport });

  it("takes the headline and search description from the homepage", () => {
    const p = mapBrandProfile("a@b.com", { company_name: "ZippyGo" }, seo([
      {
        url: "https://zippygo.ai/pricing",
        h1Tags: ["Pricing"],
        description: "Plans and pricing.",
      },
      {
        url: "https://zippygo.ai/",
        h1Tags: ["Book flights by voice"],
        description: "Voice-first flight booking for travellers.",
        llmReport: { pageType: "Homepage" },
      },
    ]));

    expect(p?.brand?.messaging).toEqual([
      { kind: "H1", text: "Book flights by voice" },
      { kind: "Meta", text: "Voice-first flight booking for travellers." },
    ]);
  });

  it("falls back to the shortest URL when no page is labelled Homepage", () => {
    // `pageType` comes from the LLM report and is not always there. The root
    // of the site is the next best answer, and it is a structural fact rather
    // than a guess.
    const p = mapBrandProfile("a@b.com", { company_name: "ZippyGo" }, seo([
      { url: "https://zippygo.ai/about/team", h1Tags: ["Our team"] },
      { url: "https://zippygo.ai/", h1Tags: ["Book flights by voice"] },
    ]));

    expect(p?.brand?.messaging?.[0]).toEqual({ kind: "H1", text: "Book flights by voice" });
  });

  it("reports nothing when the homepage has neither an H1 nor a description", () => {
    const p = mapBrandProfile("a@b.com", { company_name: "ZippyGo" }, seo([
      { url: "https://zippygo.ai/", h1Tags: [], description: "" },
    ]));
    expect(p?.brand?.messaging).toBeUndefined();
  });

  it("reports nothing when nothing was crawled", () => {
    const p = mapBrandProfile("a@b.com", { company_name: "ZippyGo" }, seo(undefined));
    expect(p?.brand?.messaging).toBeUndefined();
  });

  it("shows only the part that exists", () => {
    const p = mapBrandProfile("a@b.com", { company_name: "ZippyGo" }, seo([
      { url: "https://zippygo.ai/", h1Tags: ["Book flights by voice"], description: "  " },
    ]));
    expect(p?.brand?.messaging).toEqual([{ kind: "H1", text: "Book flights by voice" }]);
  });

  it("does not present the backend's \"Missing\" sentinel as the description", () => {
    // Observed live on leadbyte.ai: a page with no meta description comes back
    // with the literal string "Missing". Rendered, it tells the customer their
    // description IS the word "Missing" — a confident wrong answer, which is
    // worse than the blank it stands for.
    const p = mapBrandProfile("a@b.com", { company_name: "ZippyGo" }, seo([
      { url: "https://zippygo.ai/", h1Tags: ["Book flights by voice"], description: "Missing" },
    ]));
    expect(p?.brand?.messaging).toEqual([{ kind: "H1", text: "Book flights by voice" }]);
  });

  it("drops a headline the crawler ran together instead of showing mangled text", () => {
    // Also observed live: leadbyte.ai's "Automate. Optimize. Outgrow." came
    // back as "automateoptimizeoutgrow,". Showing a customer garbled text
    // about their own brand is the same fault that keeps `tagline` unmapped.
    const p = mapBrandProfile("a@b.com", { company_name: "ZippyGo" }, seo([
      { url: "https://zippygo.ai/", h1Tags: ["automateoptimizeoutgrow,"], description: "Real one." },
    ]));
    expect(p?.brand?.messaging).toEqual([{ kind: "Meta", text: "Real one." }]);
  });

  it("keeps a short single-word headline, which is legitimate", () => {
    // The run-together guard must not eat "Pricing" or a one-word brand line.
    const p = mapBrandProfile("a@b.com", { company_name: "ZippyGo" }, seo([
      { url: "https://zippygo.ai/", h1Tags: ["Pricing"] },
    ]));
    expect(p?.brand?.messaging?.[0]?.text).toBe("Pricing");
  });

  it("takes the FIRST h1 when a page carries several", () => {
    // More than one H1 is an SEO fault the audit already reports. Here the
    // first is the one a reader sees at the top of the page.
    const p = mapBrandProfile("a@b.com", { company_name: "ZippyGo" }, seo([
      { url: "https://zippygo.ai/", h1Tags: ["Book flights by voice", "Why us"] },
    ]));
    expect(p?.brand?.messaging?.[0]?.text).toBe("Book flights by voice");
  });
});
