import { describe, expect, it } from "vitest";
import {
  isAeoFinished,
  isAeoReportReady,
  parseAeoJob,
  parseAeoResult,
  parseAeoSelection,
  parseAeoStart,
  toAeoState,
  toJobView,
} from "./aeo-audit";

/**
 * The parsers between the AEO service and the screens.
 *
 * Everything here is asserted against the shapes the service actually sends —
 * the `done` payload below is trimmed from a real run against leadbyte.ai (job
 * `38790a5d0e43`, captured 2026-09-22), not invented. What is tested is the
 * behaviour a poll depends on: that nothing throws, that a state we do not
 * recognise is not mistaken for a finished one, and that the two responses
 * which are identical on the wire stay identical here.
 */

describe("toAeoState", () => {
  it("maps every state the service documents", () => {
    for (const state of ["queued", "running", "done", "blocked", "error"]) {
      expect(toAeoState(state)).toBe(state);
    }
  });

  it("turns anything else into 'unknown', which is NOT finished", () => {
    // This is the load-bearing half. A word we do not know must leave the
    // board polling, not declare an audit over — a service that adds a state
    // would otherwise strand every run on whatever it was doing.
    for (const raw of ["finished", "", null, 7, undefined, {}]) {
      expect(toAeoState(raw)).toBe("unknown");
    }
    expect(isAeoFinished("unknown")).toBe(false);
    expect(isAeoFinished("queued")).toBe(false);
    expect(isAeoFinished("running")).toBe(false);
    expect(isAeoFinished("done")).toBe(true);
    expect(isAeoFinished("blocked")).toBe(true);
    expect(isAeoFinished("error")).toBe(true);
  });
});

describe("parseAeoStart", () => {
  it("reads needs_selection, never the length of the list", () => {
    // The whole contract. "subdomain:true, none found" and "subdomain:false"
    // are deliberately indistinguishable on the wire, and an empty
    // `subdomains: []` must never be read as "nothing to pick, so it started".
    const started = parseAeoStart({
      needs_selection: false,
      domain: "",
      subdomains: [],
      job: { id: "abc", state: "queued", url: "https://a.test" },
    });
    expect(started).toEqual({
      kind: "started",
      job: {
        id: "abc",
        state: "queued",
        stage: "",
        error: "",
        vendor: "",
        url: "https://a.test",
        result: null,
      },
    });
  });

  it("gives the two indistinguishable responses an identical result", () => {
    // Asserted as equality rather than plausibility: this is what stops the
    // "no subdomains found" path drifting away from the "never asked" path.
    const withEmptyFields = parseAeoStart({
      needs_selection: false,
      domain: "",
      subdomains: [],
      job: { id: "abc", state: "queued", url: "https://a.test" },
    });
    const withoutThem = parseAeoStart({
      needs_selection: false,
      job: { id: "abc", state: "queued", url: "https://a.test" },
    });
    expect(withEmptyFields).toEqual(withoutThem);
  });

  it("returns the hostnames to pick from, and starts nothing", () => {
    const pick = parseAeoStart({
      needs_selection: true,
      domain: "example.com",
      subdomains: ["blog.example.com", "app.example.com"],
      job: null,
    });
    expect(pick).toEqual({
      kind: "needs-selection",
      domain: "example.com",
      subdomains: ["blog.example.com", "app.example.com"],
    });
  });

  it("drops junk out of the hostname list", () => {
    const pick = parseAeoStart({
      needs_selection: true,
      domain: "example.com",
      subdomains: ["blog.example.com", null, 7, ""],
    });
    expect(pick.kind === "needs-selection" && pick.subdomains).toEqual(["blog.example.com"]);
  });
});

describe("parseAeoSelection", () => {
  it("keeps the started jobs and the refused sites apart", () => {
    // A site that simply does not appear is indistinguishable from one the
    // customer never picked, which is why the service returns 200 with both
    // lists rather than failing the call.
    const outcome = parseAeoSelection({
      jobs: [{ id: "a", state: "queued", url: "https://a.test" }],
      failed: [{ url: "https://b.test", error: "SiteUnreachableError: ..." }],
    });
    expect(outcome.jobs).toHaveLength(1);
    expect(outcome.failed).toEqual([
      { url: "https://b.test", error: "SiteUnreachableError: ..." },
    ]);
  });

  it("tolerates both lists being absent", () => {
    expect(parseAeoSelection({})).toEqual({ jobs: [], failed: [] });
    expect(parseAeoSelection(null)).toEqual({ jobs: [], failed: [] });
  });
});

describe("parseAeoJob", () => {
  it("never throws on a body it does not recognise", () => {
    const job = parseAeoJob("not an object", "fallback-id");
    expect(job.id).toBe("fallback-id");
    expect(job.state).toBe("unknown");
    expect(job.result).toBeNull();
  });

  it("carries the blocked reason, with no result behind it", () => {
    const job = parseAeoJob({
      id: "abc",
      state: "blocked",
      vendor: "AWS_WAF",
      error: "a bot wall answered instead of the page — no score was recorded",
      result: null,
    });
    expect(job.state).toBe("blocked");
    expect(job.vendor).toBe("AWS_WAF");
    expect(job.result).toBeNull();
  });
});

/** Trimmed from a real `done` response — job 38790a5d0e43, 2026-09-22. */
const REAL_RESULT = {
  domain: "leadbyte.ai",
  url: "https://leadbyte.ai",
  brand: "LeadByte",
  platform: "Vite",
  logo: "https://leadbyte.ai/Leadbyte_Logo-removebg-preview.webp",
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
  run_id: "2026-09-22T07:38:40Z",
  areas: [
    { key: "ssr", label: "Server rendering", earned: 14.5, weight: 15, page_count: 19, worst_page: "/", improvement: "Move the detailed service and agent descriptions into the server-rendered HTML." },
    { key: "robots", label: "robots.txt", earned: 10, weight: 10, page_count: 0, worst_page: "", improvement: "" },
    { key: "sitemap", label: "sitemap.xml", earned: 7, weight: 10, page_count: 0, worst_page: "" },
    { key: "llms_txt", label: "llms.txt", earned: 10, weight: 10, page_count: 0, worst_page: "", improvement: "" },
    { key: "schema", label: "Structured data", earned: 13.7, weight: 15, page_count: 19, worst_page: "/services" },
    { key: "meta", label: "Meta tags", earned: 2, weight: 10, page_count: 19, worst_page: "/" },
    { key: "content_structure", label: "Content structure", earned: 6.7, weight: 10, page_count: 19, worst_page: "/" },
    { key: "entity", label: "Brand consistency", earned: 6.5, weight: 10, page_count: 19, worst_page: "/agents/google-ads-agent" },
    { key: "freshness", label: "Freshness", earned: 2.2, weight: 5, page_count: 19, worst_page: "/" },
    { key: "ai_visibility", label: "AI visibility", earned: 5, weight: 5, page_count: 0, worst_page: "", improvement: "" },
  ],
  pages: [
    { url: "https://leadbyte.ai/terms-and-conditions", path: "/terms-and-conditions", score: 58 },
    { url: "https://leadbyte.ai/pricing", path: "/pricing", score: 74 },
  ],
  gaps: [
    { key: "meta", title: "Meta tags", points: 8, effort: "low", severity: "medium", where: "19 pages", ships_via: ["manual", "source_pr"], pages: [{ where: "/", evidence: '"canonical": null' }] },
    { key: "freshness", title: "Freshness", points: 2.8, effort: "high", severity: "low", where: "17 pages", ships_via: [] },
  ],
  competitors: [
    { name: "Iverton AI", url: "https://ivertonai.com/", why: "Offers an all-in-one AI marketing automation platform." },
    { name: "", url: "https://nameless.test", why: "No name, so nothing to render." },
  ],
  // Layer 2 and 3, from job 65d5d6dc7d96 (2026-09-23), trimmed.
  fixes: [
    { id: "https://leadbyte.ai/:head:description", action: "Add a description summarising this page", rationale: "Description taken from the page's own opening sentence.", where: "/", kind: "head_meta", fix_type: "generate_meta_description", needs_approval: false, approved: false, preview: "automate optimize outgrow", language: "text", ships_via: ["source_pr", "manual"] },
    { id: "https://leadbyte.ai/:body:answer", action: "Open the page with a short, direct answer to what it is", where: "/", kind: "body", fix_type: "generate_answer_block", needs_approval: true, approved: false, preview: "LeadByte is an AI-powered marketing automation platform.", language: "text", ships_via: ["source_pr", "manual"] },
    { id: "no-flag", action: "A fix that forgot to say whether it needs approval", where: "/", kind: "body", preview: "…" },
    { id: "empty" },
  ],
  deployment: {
    surface: "manual",
    achievable: 96,
    pull_request_url: "",
    files_changed: 0,
    head_location: "the page's HTML, immediately before the closing head tag",
    platform_notes: ["Generated by a build step or a site builder.", ""],
  },
  surfaces: [
    { id: "plugin", label: "WordPress plugin", available: false, note: "this site is not WordPress", achievable: 0, gain: 0, unreachable_areas: [] },
    { id: "manual", label: "Copy-paste pack", available: true, achievable: 96, gain: 19, unreachable_areas: ["Freshness"] },
    { id: "nameless" },
  ],
};

describe("parseAeoResult", () => {
  it("keeps every area the service sent — ten here, not the nine the brief lists", () => {
    // `ai_visibility` arrived on a normal run, which the integration brief
    // says only happens on the visibility track. Nothing may assume a count.
    const result = parseAeoResult(REAL_RESULT);
    expect(result?.areas).toHaveLength(10);
    expect(result?.areas.map((a) => a.key)).toContain("ai_visibility");
  });

  it("keeps fractional scores as they came", () => {
    // 14.5 out of 15 is not 15, and rounding it away loses the difference
    // between nearly perfect and perfect.
    const result = parseAeoResult(REAL_RESULT);
    expect(result?.areas[0]?.earned).toBe(14.5);
    expect(result?.areas.find((a) => a.key === "freshness")?.earned).toBe(2.2);
  });

  it("distinguishes a score of zero from no score at all", () => {
    // Zero is a real AEO score. Missing is not a score, and the screens print
    // an em dash for it rather than a red 0/100.
    expect(parseAeoResult({ ...REAL_RESULT, score: 0 })?.score).toBe(0);
    expect(parseAeoResult({ ...REAL_RESULT, score: null })?.score).toBeNull();
    expect(parseAeoResult({ ...REAL_RESULT, score: undefined })?.score).toBeNull();
    expect(parseAeoResult({ ...REAL_RESULT, score: "78" })?.score).toBeNull();
  });

  it("drops a competitor with no name rather than rendering a blank row", () => {
    const result = parseAeoResult(REAL_RESULT);
    expect(result?.competitors).toHaveLength(1);
    expect(result?.competitors[0]?.name).toBe("Iverton AI");
  });

  it("keeps a gap's own page list and tolerates an empty ships_via", () => {
    const result = parseAeoResult(REAL_RESULT);
    expect(result?.gaps[0]?.pages).toEqual([{ where: "/", evidence: '"canonical": null' }]);
    expect(result?.gaps[1]?.points).toBe(2.8);
  });

  it("keeps each gap's delivery routes", () => {
    const result = parseAeoResult(REAL_RESULT);
    expect(result?.gaps[0]?.ships_via).toEqual(["manual", "source_pr"]);
    expect(result?.gaps[1]?.ships_via).toEqual([]);
  });

  it("reads the fixes, and drops one with nothing to show", () => {
    const result = parseAeoResult(REAL_RESULT);
    expect(result?.fixes.map((f) => f.id)).toEqual([
      "https://leadbyte.ai/:head:description",
      "https://leadbyte.ai/:body:answer",
      "no-flag",
    ]);
    expect(result?.fixes[0]?.needs_approval).toBe(false);
    expect(result?.fixes[1]?.needs_approval).toBe(true);
  });

  it("holds a fix that does not say whether it needs approval", () => {
    // Body copy changes what a page says. A missing flag must never be the
    // thing that presents it as ready to use.
    const result = parseAeoResult(REAL_RESULT);
    expect(result?.fixes.find((f) => f.id === "no-flag")?.needs_approval).toBe(true);
  });

  it("reads the routes held fixes would ship by", () => {
    expect(parseAeoResult({ ...REAL_RESULT, pending_ships_via: ["source_pr"] })?.pending_ships_via).toEqual([
      "source_pr",
    ]);
    expect(parseAeoResult(REAL_RESULT)?.pending_ships_via).toEqual([]);
  });

  it("reads the deployment preview and drops empty notes", () => {
    const result = parseAeoResult(REAL_RESULT);
    expect(result?.deployment?.surface).toBe("manual");
    expect(result?.deployment?.achievable).toBe(96);
    expect(result?.deployment?.body_location).toBe("");
    expect(result?.deployment?.platform_notes).toEqual([
      "Generated by a build step or a site builder.",
    ]);
  });

  it("reads each route, and drops one with no label", () => {
    const result = parseAeoResult(REAL_RESULT);
    expect(result?.surfaces.map((x) => x.id)).toEqual(["plugin", "manual"]);
    expect(result?.surfaces[0]?.available).toBe(false);
    expect(result?.surfaces[1]?.gain).toBe(19);
  });

  it("returns null for a job that has no result yet", () => {
    expect(parseAeoResult(null)).toBeNull();
    expect(parseAeoResult(undefined)).toBeNull();
  });

  it("fills in what a half-written payload leaves out", () => {
    const result = parseAeoResult({ domain: "a.test" });
    expect(result?.score).toBeNull();
    expect(result?.areas).toEqual([]);
    expect(result?.pages).toEqual([]);
    expect(result?.gaps).toEqual([]);
    expect(result?.coverage_note).toBe("");
    expect(result?.fixes).toEqual([]);
    expect(result?.deployment).toBeNull();
    expect(result?.surfaces).toEqual([]);
  });
});

describe("toJobView and isAeoReportReady", () => {
  it("draws a report as soon as the result lands, before the job is done", () => {
    // The score is final when the crawl ends; fixes keep arriving after.
    const running = toJobView(parseAeoJob({ id: "a", state: "running", result: REAL_RESULT }));
    expect(running.hasResult).toBe(true);
    expect(isAeoReportReady(running)).toBe(true);
  });

  it("has nothing to draw before the result, or for a blocked or failed job", () => {
    expect(isAeoReportReady(toJobView(parseAeoJob({ id: "a", state: "running", result: null })))).toBe(false);
    expect(isAeoReportReady({ state: "blocked", hasResult: true })).toBe(false);
    expect(isAeoReportReady({ state: "error", hasResult: true })).toBe(false);
  });
});
