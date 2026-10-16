import { describe, expect, it } from "vitest";
import type { AeoArea, AeoDeployment, AeoFix, AeoGap, AeoResult, AeoSurface } from "./aeo-audit";
import {
  areaScoreLabel,
  approvableIds,
  areaShare,
  awaitingFixes,
  biggestShortfalls,
  coverageLabel,
  discoveryLabel,
  fixCountLabel,
  fixCounts,
  fixesSentence,
  fixLocation,
  fixRouteNote,
  fixStatus,
  formatPoints,
  gapSummary,
  groupFixesByPlace,
  hasReportBody,
  hasShipped,
  headingRewrite,
  placeLabel,
  plainProse,
  reachableScore,
  surfaceDetail,
  pageHint,
  pendingRouteSentence,
  previewTaste,
  resultCaveats,
  scoreTone,
  severityVariant,
  suggestedSurfaceLabel,
} from "./aeo-report";

/**
 * What the AEO report screens read.
 *
 * Every figure below comes from a real run against leadbyte.ai (job
 * `38790a5d0e43`, 2026-09-22) rather than being made up, because the rules
 * being tested are all about shapes the service actually produces: fractional
 * scores beside whole ones, areas that score full marks and send no
 * improvement, and site-wide areas with no page count at all.
 */

const area = (over: Partial<AeoArea>): AeoArea => ({
  key: "meta",
  label: "Meta tags",
  earned: 2,
  weight: 10,
  reason: "",
  evidence: "",
  improvement: "",
  worst_page: "",
  page_count: 0,
  ...over,
});

const AREAS: AeoArea[] = [
  area({ key: "ssr", label: "Server rendering", earned: 14.5, weight: 15, page_count: 19 }),
  area({ key: "robots", label: "robots.txt", earned: 10, weight: 10 }),
  area({ key: "sitemap", label: "sitemap.xml", earned: 7, weight: 10 }),
  area({ key: "llms_txt", label: "llms.txt", earned: 10, weight: 10 }),
  area({ key: "schema", label: "Structured data", earned: 13.7, weight: 15, page_count: 19 }),
  area({ key: "meta", label: "Meta tags", earned: 2, weight: 10, page_count: 19 }),
  area({ key: "content_structure", label: "Content structure", earned: 6.7, weight: 10 }),
  area({ key: "entity", label: "Brand consistency", earned: 6.5, weight: 10 }),
  area({ key: "freshness", label: "Freshness", earned: 2.2, weight: 5 }),
  area({ key: "ai_visibility", label: "AI visibility", earned: 5, weight: 5 }),
];

const result = (over: Partial<AeoResult> = {}): AeoResult => ({
  domain: "leadbyte.ai",
  url: "https://leadbyte.ai",
  brand: "LeadByte",
  platform: "Vite",
  logo: "",
  score: 78,
  ceiling: 100,
  ceiling_note: "",
  pages_audited: 19,
  pages_found: 19,
  blocked_pages: 0,
  coverage_note: "",
  discovery_source: "sitemap",
  generation_note: "",
  render_note: "",
  gap_count: 7,
  run_id: "",
  areas: AREAS,
  pages: [{ url: "https://leadbyte.ai/pricing", path: "/pricing", score: 74 }],
  gaps: [],
  competitors: [],
  fixes: [],
  pending_ships_via: [],
  deployment: null,
  surfaces: [],
  ...over,
});

describe("formatPoints", () => {
  it("keeps one decimal where the service sent one, and none where it did not", () => {
    // 14.5 and 10 arrive side by side. Rounding both to integers loses the
    // first; printing both to one decimal makes the second read as a
    // measurement it is not.
    expect(formatPoints(14.5)).toBe("14.5");
    expect(formatPoints(10)).toBe("10");
    expect(formatPoints(2.2)).toBe("2.2");
    expect(formatPoints(0)).toBe("0");
    expect(formatPoints(13.74)).toBe("13.7");
  });

  it("gives an em dash to anything that is not a number", () => {
    expect(formatPoints(Number.NaN)).toBe("—");
    expect(formatPoints(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("areaScoreLabel and areaShare", () => {
  it("spells an area's score the one way", () => {
    expect(areaScoreLabel(AREAS[0]!)).toBe("14.5/15");
    expect(areaScoreLabel(AREAS[5]!)).toBe("2/10");
  });

  it("draws the bar from the fraction actually earned", () => {
    expect(areaShare(AREAS[0]!)).toBe(97);
    expect(areaShare(AREAS[5]!)).toBe(20);
    expect(areaShare(AREAS[1]!)).toBe(100);
  });

  it("draws an unscoreable area empty, never full", () => {
    // A weight of zero would divide by zero, and the answer must not be a bar
    // at 100% — an empty bar on an unscored row is quiet, a full one is a
    // claim nobody made.
    expect(areaShare(area({ earned: 0, weight: 0 }))).toBe(0);
    expect(areaShare(area({ earned: 4, weight: 0 }))).toBe(0);
  });

  it("clamps a score that somehow exceeds its weight", () => {
    expect(areaShare(area({ earned: 12, weight: 10 }))).toBe(100);
    expect(areaShare(area({ earned: -3, weight: 10 }))).toBe(0);
  });
});

describe("scoreTone", () => {
  it("uses the same 70 and 40 the rest of the app does", () => {
    // A fourth threshold in a fourth file is how two screens end up
    // disagreeing about what "good" means for the same site.
    expect(scoreTone(78)).toBe("good");
    expect(scoreTone(70)).toBe("good");
    expect(scoreTone(69)).toBe("warn");
    expect(scoreTone(40)).toBe("warn");
    expect(scoreTone(39)).toBe("crit");
    expect(scoreTone(0)).toBe("crit");
  });

  it("has a tone for no score at all, which is not the worst tone", () => {
    expect(scoreTone(null)).toBe("none");
  });
});

describe("coverageLabel", () => {
  it("says the two numbers only when they differ", () => {
    // "19 of 19" invites the reader to look for the missing ones.
    expect(coverageLabel(result())).toBe("19 pages audited");
    expect(coverageLabel(result({ pages_audited: 6 }))).toBe("6 of 19 pages audited");
  });

  it("gets the singular right", () => {
    expect(coverageLabel(result({ pages_audited: 1, pages_found: 1 }))).toBe("1 page audited");
  });

  it("says nothing rather than something made up", () => {
    expect(coverageLabel(result({ pages_audited: null, pages_found: null }))).toBeNull();
  });
});

describe("resultCaveats", () => {
  it("is empty on a clean run", () => {
    expect(resultCaveats(result())).toEqual([]);
  });

  it("carries the service's own wording, and drops the blank ones", () => {
    const caveats = resultCaveats(
      result({ coverage_note: "Six pages were behind a login.", render_note: "   " }),
    );
    expect(caveats).toEqual(["Six pages were behind a login."]);
  });
});

describe("severityVariant", () => {
  it("matches the website audit's own severity colours", () => {
    expect(severityVariant("critical")).toBe("confidence-low");
    expect(severityVariant("high")).toBe("confidence-medium");
    expect(severityVariant("medium")).toBe("confidence-partial");
    expect(severityVariant("low")).toBe("confidence-high");
    expect(severityVariant("HIGH")).toBe("confidence-medium");
  });

  it("never makes an unrecognised severity look safe", () => {
    // Green on a severity we cannot read would tell someone a finding is minor
    // on no evidence at all.
    expect(severityVariant("catastrophic")).toBe("confidence-partial");
    expect(severityVariant("")).toBe("confidence-partial");
  });
});

describe("gapSummary", () => {
  const gap = (over: Partial<AeoGap>): AeoGap => ({
    key: "meta",
    title: "Meta tags",
    points: 8,
    effort: "low",
    severity: "medium",
    where: "19 pages",
    check_id: "meta_tags",
    evidence: "",
    pages: [],
    improvement: "",
    ships_via: [],
    ...over,
  });

  it("reads as one line of what it is worth and what it costs", () => {
    expect(gapSummary(gap({}))).toBe("8 points · low effort · 19 pages");
    expect(gapSummary(gap({ points: 2.8, effort: "high", where: "17 pages" }))).toBe(
      "2.8 points · high effort · 17 pages",
    );
  });

  it("leaves out what the service did not send", () => {
    expect(gapSummary(gap({ effort: "", where: "" }))).toBe("8 points");
    expect(gapSummary(gap({ points: 1, effort: "", where: "" }))).toBe("1 point");
  });
});

describe("pageHint", () => {
  it("keeps the /100 that PageSections reads back to size its gauge", () => {
    // The component parses `N/100` out of this string. Drop it and the bar
    // silently disappears with no error anywhere.
    expect(pageHint(74)).toBe("74/100 page score");
    expect(pageHint(58.4)).toBe("58/100 page score");
  });
});

describe("biggestShortfalls", () => {
  it("names the areas losing the most points, not the lowest percentages", () => {
    // Meta loses 8 and freshness loses 2.8; freshness scores worse as a
    // fraction. What is worth fixing first is the points, which is what the
    // service's own gap ranking uses too.
    expect(biggestShortfalls(AREAS).map((a) => a.key)).toEqual([
      "meta",
      "entity",
      "content_structure",
    ]);
  });

  it("ignores areas that are already full marks", () => {
    const full = [area({ key: "robots", earned: 10, weight: 10 })];
    expect(biggestShortfalls(full)).toEqual([]);
  });
});

describe("hasReportBody", () => {
  it("is false only when there is genuinely nothing to draw", () => {
    expect(hasReportBody(result())).toBe(true);
    expect(
      hasReportBody(result({ areas: [], gaps: [], pages: [], score: null })),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fixes and routes. Values from job 65d5d6dc7d96 (leadbyte.ai, 2026-09-23).
// ---------------------------------------------------------------------------

const fix = (over: Partial<AeoFix>): AeoFix => ({
  id: "https://leadbyte.ai/:head:description",
  action: "Add a description summarising this page",
  rationale: "",
  where: "/",
  kind: "head_meta",
  fix_type: "generate_meta_description",
  needs_approval: false,
  approved: false,
  preview: "",
  language: "text",
  ships_via: ["source_pr", "manual"],
  ...over,
});

const HELD = fix({ id: "held", kind: "body", fix_type: "generate_answer_block", needs_approval: true });

const DEPLOYMENT: AeoDeployment = {
  surface: "manual",
  achievable: 96,
  pull_request_url: "",
  files_changed: 0,
  head_location: "the page's HTML, immediately before the closing head tag",
  root_file_location: "the site root (or the build's public/ directory)",
  body_location: "the page's HTML, where the content belongs",
  platform_notes: [],
};

const surface = (over: Partial<AeoSurface>): AeoSurface => ({
  id: "manual",
  label: "Copy-paste pack",
  available: true,
  note: "",
  achievable: 96,
  gain: 19,
  unreachable: null,
  unreachable_areas: [],
  ...over,
});

describe("fixStatus", () => {
  it("holds body copy until someone approves it", () => {
    expect(fixStatus(fix({}))).toBe("ready");
    expect(fixStatus(HELD)).toBe("awaiting");
    expect(fixStatus({ ...HELD, approved: true })).toBe("approved");
  });
});

describe("fixCounts and fixesSentence", () => {
  it("counts what is listed", () => {
    expect(fixCounts([fix({}), HELD, HELD])).toEqual({ total: 3, ready: 1, awaiting: 2 });
  });

  it("reads correctly for one, many, and none held", () => {
    expect(fixesSentence([fix({}), fix({}), HELD])).toBe(
      "We wrote 3 fixes for this site. 2 are ready to use. 1 changes what your pages say, so it needs a person to approve it first.",
    );
    expect(fixesSentence([fix({})])).toBe(
      "We wrote 1 fix for this site. All of them are ready to use.",
    );
    expect(fixesSentence([HELD, HELD])).toBe(
      "We wrote 2 fixes for this site. 2 change what your pages say, so they need a person to approve them first.",
    );
  });

  it("says nothing when nothing was written", () => {
    expect(fixesSentence([])).toBeNull();
    expect(fixCountLabel([])).toBeNull();
  });

  it("labels a page row with its count and how many are held", () => {
    expect(fixCountLabel([fix({})])).toBe("1 fix");
    expect(fixCountLabel([fix({}), HELD])).toBe("2 fixes · 1 needs approval");
    expect(fixCountLabel([HELD, HELD, fix({})])).toBe("3 fixes · 2 need approval");
  });
});

describe("groupFixesByPlace and placeLabel", () => {
  it("groups by where, keeping the order they arrived in", () => {
    const groups = groupFixesByPlace([
      fix({ id: "a", where: "/" }),
      fix({ id: "b", where: "whole site" }),
      fix({ id: "c", where: "/" }),
    ]);
    expect([...groups.keys()]).toEqual(["/", "whole site"]);
    expect(groups.get("/")?.map((f) => f.id)).toEqual(["a", "c"]);
  });

  it("capitalises a place and leaves a path alone", () => {
    expect(placeLabel("whole site")).toBe("Whole site");
    expect(placeLabel("/blog")).toBe("/blog");
    expect(placeLabel("")).toBe("Elsewhere");
  });
});

describe("fixLocation", () => {
  it("uses the service's own sentence for each kind", () => {
    expect(fixLocation(fix({ kind: "head_schema" }), DEPLOYMENT)).toBe(DEPLOYMENT.head_location);
    expect(fixLocation(fix({ kind: "head_meta" }), DEPLOYMENT)).toBe(DEPLOYMENT.head_location);
    expect(fixLocation(fix({ kind: "body" }), DEPLOYMENT)).toBe(DEPLOYMENT.body_location);
    expect(fixLocation(fix({ kind: "root_file" }), DEPLOYMENT)).toBe(DEPLOYMENT.root_file_location);
  });

  it("says nothing for an unknown kind or with no deployment", () => {
    expect(fixLocation(fix({ kind: "mystery" }), DEPLOYMENT)).toBeNull();
    expect(fixLocation(fix({}), null)).toBeNull();
  });
});

describe("headingRewrite", () => {
  it("reads the before and after out of the preview", () => {
    const rewrite = fix({
      fix_type: "rewrite_heading",
      preview: '{"from": "Features", "to": "What features are included?"}',
    });
    expect(headingRewrite(rewrite)).toEqual({ from: "Features", to: "What features are included?" });
  });

  it("falls back to the raw preview for anything else", () => {
    expect(headingRewrite(fix({ fix_type: "rewrite_heading", preview: "not json" }))).toBeNull();
    expect(headingRewrite(fix({ fix_type: "rewrite_heading", preview: '{"from": "A"}' }))).toBeNull();
    expect(headingRewrite(fix({ preview: '{"from": "A", "to": "B"}' }))).toBeNull();
  });
});

describe("reachableScore", () => {
  it("is the deployment's figure when it beats the current score", () => {
    expect(reachableScore(result({ score: 77, deployment: DEPLOYMENT, fixes: [fix({})] }))).toBe(96);
  });

  it("is null when it is no better, or there is nothing to compare", () => {
    expect(reachableScore(result({ score: 96, deployment: DEPLOYMENT, fixes: [fix({})] }))).toBeNull();
    expect(reachableScore(result({ score: null, deployment: DEPLOYMENT, fixes: [fix({})] }))).toBeNull();
    expect(reachableScore(result({ score: 77, deployment: null, fixes: [fix({})] }))).toBeNull();
    expect(reachableScore(result({ score: 77, deployment: DEPLOYMENT, fixes: [] }))).toBeNull();
  });
});

describe("surfaceDetail", () => {
  it("names the gain and what the route cannot reach", () => {
    expect(surfaceDetail(surface({ unreachable_areas: ["Freshness", "AI visibility"] }))).toBe(
      "+19 points · can't help with Freshness, AI visibility",
    );
    expect(surfaceDetail(surface({ gain: 0 }))).toBeNull();
  });

  it("says why a route is unavailable, and not what it could reach", () => {
    expect(
      surfaceDetail(surface({ available: false, note: "this site is not WordPress", gain: 0 })),
    ).toBe("Not available: this site is not WordPress");
    expect(surfaceDetail(surface({ available: false }))).toBe("Not available");
  });
});

describe("hasShipped", () => {
  it("is only true with a pull request or changed files", () => {
    expect(hasShipped(DEPLOYMENT)).toBe(false);
    expect(hasShipped(null)).toBe(false);
    expect(hasShipped({ ...DEPLOYMENT, pull_request_url: "https://github.com/x/y/pull/1" })).toBe(true);
    expect(hasShipped({ ...DEPLOYMENT, files_changed: 3 })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Codes and markup. Values from zippygo.ai (job 56ae6f5d777b, 2026-09-24), a
// JavaScript-only site — the case that surfaced all four of these.
// ---------------------------------------------------------------------------

describe("discoveryLabel", () => {
  it("puts the service's codes into words", () => {
    expect(discoveryLabel("sitemap")).toBe("Pages found from your sitemap");
    expect(discoveryLabel("rendered-crawl")).toBe("Pages found by loading the site in a browser");
  });

  it("still says something for a code it does not know, and nothing for none", () => {
    expect(discoveryLabel("link-walk")).toBe("Pages found via link walk");
    expect(discoveryLabel("")).toBeNull();
  });
});

describe("plainProse", () => {
  it("reduces Markdown links to their text and drops the empty brackets", () => {
    expect(
      plainProse(
        "ZippyGo Logistics shares the name. ([zippygo.co.in](https://zippygo.co.in/about-us?utm_source=openai)); Yes.",
      ),
    ).toBe("ZippyGo Logistics shares the name. (zippygo.co.in); Yes.");
  });

  it("leaves prose without links exactly as it was", () => {
    const text = "Add a machine-readable datePublished and dateModified value.";
    expect(plainProse(text)).toBe(text);
  });
});

describe("fixRouteNote", () => {
  const SURFACES: AeoSurface[] = [
    surface({ id: "source_pr", label: "GitHub pull request" }),
    surface({ id: "edge", label: "Cloudflare Worker" }),
    surface({ id: "manual", label: "Copy-paste pack" }),
  ];

  it("names the only route that can carry a fix the suggested one cannot", () => {
    // Every held FAQ on zippygo ships by pull request alone; the service
    // suggests the copy-paste pack.
    expect(fixRouteNote(fix({ ships_via: ["source_pr"] }), DEPLOYMENT, SURFACES)).toBe(
      "Only through a GitHub pull request",
    );
    expect(
      fixRouteNote(fix({ ships_via: ["source_pr", "edge"] }), DEPLOYMENT, SURFACES),
    ).toBe("Only through a GitHub pull request or Cloudflare Worker");
  });

  it("says nothing when the suggested route can take it, or no route is named", () => {
    expect(fixRouteNote(fix({ ships_via: ["source_pr", "manual"] }), DEPLOYMENT, SURFACES)).toBeNull();
    expect(fixRouteNote(fix({ ships_via: [] }), DEPLOYMENT, SURFACES)).toBeNull();
    expect(fixRouteNote(fix({ ships_via: ["source_pr"] }), null, SURFACES)).toBeNull();
  });

  it("falls back to the route's id when the service sent no label for it", () => {
    expect(fixRouteNote(fix({ ships_via: ["ftp"] }), DEPLOYMENT, SURFACES)).toBe("Only through a ftp");
  });
});

describe("suggestedSurfaceLabel", () => {
  it("names the route behind the headline figure", () => {
    const withRoutes = result({
      deployment: DEPLOYMENT,
      surfaces: [surface({ id: "source_pr", label: "GitHub pull request" }), surface({})],
    });
    expect(suggestedSurfaceLabel(withRoutes)).toBe("Copy-paste pack");
  });

  it("is null with no deployment, or a route the list does not carry", () => {
    expect(suggestedSurfaceLabel(result({ deployment: null }))).toBeNull();
    expect(suggestedSurfaceLabel(result({ deployment: DEPLOYMENT, surfaces: [] }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Approving held fixes
// ---------------------------------------------------------------------------

describe("awaitingFixes and approvableIds", () => {
  const FIXES = [
    fix({ id: "ready" }),
    fix({ id: "held-a", needs_approval: true }),
    fix({ id: "held-b", needs_approval: true }),
    fix({ id: "done", needs_approval: true, approved: true }),
  ];

  it("lists only what is still held", () => {
    expect(awaitingFixes(FIXES).map((f) => f.id)).toEqual(["held-a", "held-b"]);
  });

  it("sends every held fix for 'all', and nothing else", () => {
    expect(approvableIds(FIXES, "all")).toEqual(["held-a", "held-b"]);
  });

  it("drops ids that are ready, already approved, or not in this audit", () => {
    // A stale tab or an edited form names these. None of them is someone
    // approving copy they have read.
    expect(approvableIds(FIXES, ["held-b", "ready", "done", "someone-elses"])).toEqual(["held-b"]);
    expect(approvableIds(FIXES, [])).toEqual([]);
  });
});

describe("pendingRouteSentence", () => {
  const SURFACES = [surface({ id: "source_pr", label: "GitHub pull request" }), surface({})];

  it("names the route approved fixes would take, and that approving is not a deploy", () => {
    expect(pendingRouteSentence(result({ pending_ships_via: ["source_pr"], surfaces: SURFACES }))).toBe(
      "Once approved, they can go out through a GitHub pull request. Approving does not change your site by itself.",
    );
    expect(
      pendingRouteSentence(result({ pending_ships_via: ["source_pr", "manual"], surfaces: SURFACES })),
    ).toBe(
      "Once approved, they can go out through a GitHub pull request or Copy-paste pack. Approving does not change your site by itself.",
    );
  });

  it("says plainly when no route can carry them yet", () => {
    expect(pendingRouteSentence(result({ pending_ships_via: [] }))).toBe(
      "No route can carry these yet, so approving them changes nothing on your site today.",
    );
  });
});

describe("previewTaste", () => {
  it("keeps short text whole, with no ellipsis", () => {
    expect(previewTaste("Talk to ZippyGo like you would to a travel assistant.")).toBe(
      "Talk to ZippyGo like you would to a travel assistant.",
    );
  });

  it("cuts long text on a word and marks the cut", () => {
    const long = "word ".repeat(100);
    const taste = previewTaste(long, 50);
    expect(taste.endsWith("word…")).toBe(true);
    expect(taste.length).toBeLessThanOrEqual(51);
  });

  it("flattens the line breaks of an HTML or JSON preview", () => {
    expect(previewTaste('<section>\n  <h2>FAQ</h2>\n</section>')).toBe("<section> <h2>FAQ</h2> </section>");
  });
});
