import {
  actionKind,
  summarySentence,
  buildActions,
  buildHeroStats,
  buildOpportunities,
  buildPresenceFlow,
  orderForSummary,
  scoreTone,
} from "@/lib/data/overview-summary";
import type { Opportunity } from "@/lib/data/overview-summary";
import type { AdvertisingData, BusinessProfile, GeoAnalysis, WebsiteAudit } from "@/lib/data/types";

/**
 * What the landing screen tells someone to do next.
 *
 * This lives outside the page because a page cannot be tested here, and the
 * list is the whole point of the screen: it decides what an account sees
 * first. Getting it wrong is not a layout bug, it is telling a customer to fix
 * something that is already fine.
 */

const profile = (over: Partial<BusinessProfile> = {}): BusinessProfile => ({
  businessId: "acct",
  businessName: "Acme",
  businessType: "B2B SaaS",
  industry: "Marketing",
  websiteUrl: "acme.test",
  description: "",
  websiteAuditScore: 0,
  geoVisibilityScore: 0,
  ...over,
});

const audit = (over: Partial<WebsiteAudit> = {}): WebsiteAudit =>
  ({
    businessId: "acct",
    score: 60,
    pagesCrawled: 10,
    totalIssues: 4,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    categoryScores: [],
    findings: [],
    ...over,
  }) as WebsiteAudit;

const geo = (over: Partial<GeoAnalysis> = {}): GeoAnalysis =>
  ({ businessId: "acct", score: 70, engineCoverage: [], ...over }) as GeoAnalysis;

const ads = (over: Partial<AdvertisingData> = {}): AdvertisingData =>
  ({
    businessId: "acct",
    platforms: [{ platform: "google", label: "Google Ads", connected: true, detail: "" }],
    spend: "0",
    impressions: "0",
    clicks: "0",
    ctr: "0",
    cpc: "0",
    conversions: 0,
    cpa: "—",
    targetCpa: null,
    roas: "0",
    ...over,
  }) as AdvertisingData;

const agent = (agentId: string, runs: unknown[] = []) =>
  ({ agentId, runs, status: "idle" }) as never;

const waiting = (agentId: string) => ({ agentId, runs: [], status: "needs-setup" }) as never;

const AGENTS = [
  { id: "on-page-seo", name: "On-Page SEO" },
  { id: "google-ads", name: "Google Ads" },
  { id: "blog-posting", name: "Blog Posting" },
  { id: "meta-ads", name: "Meta Ads" },
  { id: "lead-qualification", name: "Lead Qualification" },
];

describe("buildActions", () => {
  it("says nothing needs doing when nothing does", () => {
    // The empty case is the one a healthy account lands on every day, and it
    // has to be reachable — a list that always finds something to nag about
    // stops being read at all.
    const actions = buildActions({
      profile: profile(),
      audit: audit(),
      geo: geo(),
      ads: ads(),
      agentStates: [agent("on-page-seo", [{}])],
      agents: AGENTS,
    });
    expect(actions).toEqual([]);
  });

  it("raises critical audit findings, and marks them urgent", () => {
    const [action] = buildActions({
      profile: profile(),
      audit: audit({ criticalCount: 2 }),
      geo: geo(),
      ads: ads(),
      agentStates: [agent("on-page-seo", [{}])],
      agents: AGENTS,
    });
    expect(action!.title).toContain("2 critical");
    expect(action!.urgent).toBe(true);
    expect(action!.href).toBe("/overview/website-audit");
  });

  it("uses the singular for one finding", () => {
    // "Fix 1 critical audit findings" is the kind of thing that makes a
    // customer trust the rest of the number less.
    const [action] = buildActions({
      profile: profile(),
      audit: audit({ criticalCount: 1 }),
      geo: geo(),
      ads: ads(),
      agentStates: [agent("on-page-seo", [{}])],
      agents: AGENTS,
    });
    expect(action!.title).toContain("1 critical finding");
    expect(action!.title).not.toContain("findings");
  });

  it("names the platform that is actually disconnected", () => {
    // It used to say "Connect LinkedIn Ads" whatever was missing, because the
    // sentence was hard-coded beside a check that only asked whether ANY
    // platform was unconnected.
    const [action] = buildActions({
      profile: profile(),
      audit: audit(),
      geo: geo(),
      ads: ads({
        platforms: [
          { platform: "google", label: "Google Ads", connected: true, detail: "" },
          { platform: "meta", label: "Meta Ads", connected: false, detail: "" },
        ] as AdvertisingData["platforms"],
      }),
      agentStates: [agent("on-page-seo", [{}])],
      agents: AGENTS,
    });
    expect(action!.title).toContain("Meta Ads");
  });

  it("does not raise a low GEO score the backend never computed", () => {
    // Null is "not measured", and `null < 50` is true in JavaScript — the
    // check that shipped would have told every unanalysed account its AI
    // visibility was bad.
    const actions = buildActions({
      profile: profile(),
      audit: audit(),
      geo: geo({ score: null }),
      ads: ads(),
      agentStates: [agent("on-page-seo", [{}])],
      agents: AGENTS,
    });
    expect(actions.map((a) => a.href)).not.toContain("/overview/geo-analysis");
  });

  it("raises a genuinely low GEO score", () => {
    const actions = buildActions({
      profile: profile(),
      audit: audit(),
      geo: geo({ score: 30 }),
      ads: ads(),
      agentStates: [agent("on-page-seo", [{}])],
      agents: AGENTS,
    });
    expect(actions.map((a) => a.href)).toContain("/overview/geo-analysis");
  });

  it("asks for a website before anything else when there is none", () => {
    // Nothing else on the page can be computed without it, so it goes first
    // however many other items qualify.
    const actions = buildActions({
      profile: profile({ websiteUrl: "" }),
      audit: audit({ criticalCount: 5 }),
      geo: geo({ score: 10 }),
      ads: ads(),
      agentStates: [agent("on-page-seo")],
      agents: AGENTS,
    });
    expect(actions[0]!.href).toBe("/");
    expect(actions[0]!.urgent).toBe(true);
  });

  it("copes with an account that has nothing at all yet", () => {
    // A brand-new sign-in: no profile row, no analysis, no ad accounts.
    const actions = buildActions({
      profile: null,
      audit: null,
      geo: null,
      ads: null,
      agentStates: [],
      agents: AGENTS,
    });
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0]!.href).toBe("/");
  });

  it("keeps the list short enough to act on", () => {
    // Everything wrong at once. A landing screen listing eight jobs is a
    // backlog, and a backlog gets closed rather than worked through.
    const actions = buildActions({
      profile: profile({ websiteUrl: "" }),
      audit: audit({ criticalCount: 9 }),
      geo: geo({ score: 5 }),
      ads: ads({
        platforms: [
          { platform: "meta", label: "Meta Ads", connected: false, detail: "" },
        ] as AdvertisingData["platforms"],
      }),
      agentStates: [agent("on-page-seo")],
      agents: AGENTS,
    });
    // Three, because the Overview draws three cards to a row and the heading
    // counts what is returned — at four it announced a card nobody could see.
    expect(actions.length).toBeLessThanOrEqual(3);
  });

  it("links straight to the first waiting agent in the summary order", () => {
    // Google Ads comes before Meta Ads in the repo; the summary puts Meta first.
    const actions = buildActions({
      profile: profile(),
      audit: audit(),
      geo: geo(),
      ads: ads(),
      agentStates: [waiting("google-ads"), waiting("meta-ads"), waiting("lead-qualification")],
      agents: AGENTS,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]!.href).toBe("/agents/meta-ads");
    expect(actions[0]!.title).toBe("Set up the Meta Ads agent");
    expect(actions[0]!.reason).toContain("2 more agents are waiting");
  });

  it("does not suggest an agent outside the summary list", () => {
    const actions = buildActions({
      profile: profile(),
      audit: audit(),
      geo: geo(),
      ads: ads(),
      agentStates: [waiting("blog-posting")],
      agents: AGENTS,
    });
    expect(actions).toEqual([]);
  });

  it("does not suggest an agent that is already set up", () => {
    const actions = buildActions({
      profile: profile(),
      audit: audit(),
      geo: geo(),
      ads: ads(),
      agentStates: [agent("meta-ads"), waiting("on-page-seo")],
      agents: AGENTS,
    });
    expect(actions[0]!.href).toBe("/agents/on-page-seo");
    expect(actions[0]!.reason).not.toContain("more");
  });
});

describe("orderForSummary", () => {
  it("puts the summary agents first, in order, and keeps the rest after", () => {
    expect(orderForSummary(AGENTS).map((a) => a.id)).toEqual([
      "meta-ads",
      "google-ads",
      "on-page-seo",
      "lead-qualification",
      "blog-posting",
    ]);
  });
});

describe("actionKind", () => {
  it("reads urgent as critical whatever the wording", () => {
    expect(actionKind({ title: "Add your website", reason: "", cta: "", href: "", urgent: true })).toBe(
      "critical",
    );
  });

  it("reads a non-urgent ad-connection action as ads", () => {
    expect(
      actionKind({
        title: "Connect 2 more ad accounts",
        reason: "Spend on a disconnected account is missing from every figure here.",
        cta: "",
        href: "",
        urgent: false,
      }),
    ).toBe("ads");
  });

  it("reads a website/SEO action as seo", () => {
    expect(
      actionKind({
        title: "Improve how AI engines read your site",
        reason: "Most answer engines cannot quote your website reliably.",
        cta: "",
        href: "",
        urgent: false,
      }),
    ).toBe("seo");
  });

  it("falls back to generic for anything else", () => {
    expect(
      actionKind({ title: "Set up the On-Page SEO agent", reason: "It has never run.", cta: "", href: "", urgent: false }),
    ).toBe("seo"); // "SEO" in the title still counts
    expect(
      actionKind({ title: "Review your plan", reason: "Nothing else matches.", cta: "", href: "", urgent: false }),
    ).toBe("generic");
  });
});

describe("buildOpportunities", () => {
  it("lists nothing when every condition is already satisfied", () => {
    const items = buildOpportunities({
      audit: audit({ criticalCount: 0 }),
      geo: geo({ score: null }),
      ads: ads({ conversions: 5 }),
      needsSetup: 0,
    });
    expect(items).toEqual([]);
  });

  it("only raises a GEO opportunity when a score actually exists", () => {
    // `geo.score` is null when the backend never computed one — the same
    // null-guard `buildActions` needs for the exact same field.
    const items = buildOpportunities({
      audit: audit(),
      geo: geo({ score: null }),
      ads: ads({ conversions: 5 }),
      needsSetup: 0,
    });
    expect(items.map((i) => i.label)).not.toContain("Increase visibility in AI search");
  });

  it("raises paid-channel opportunity on zero conversions, not just no account", () => {
    const items = buildOpportunities({
      audit: audit(),
      geo: geo({ score: null }),
      ads: ads({ conversions: 0 }),
      needsSetup: 0,
    });
    expect(items.map((i) => i.label)).toContain("Connect paid channels to measure conversions");
  });

  it("caps at four", () => {
    const items = buildOpportunities({
      audit: audit({ criticalCount: 3 }),
      geo: geo({ score: 20 }),
      ads: ads({ conversions: 0 }),
      needsSetup: 4,
    });
    expect(items.length).toBeLessThanOrEqual(4);
  });
});

describe("scoreTone", () => {
  it("does not colour a score that was never measured", () => {
    // Null used to render as amber alongside real scores, which made "we have
    // not measured this" look like a middling verdict.
    expect(scoreTone(null)).toBe("neutral");
  });

  it("reads low, middling and high as crit, warn and good", () => {
    expect(scoreTone(20)).toBe("crit");
    expect(scoreTone(60)).toBe("warn");
    expect(scoreTone(90)).toBe("good");
  });

  it("puts the boundaries where the copy implies they are", () => {
    expect(scoreTone(50)).toBe("warn");
    expect(scoreTone(49)).toBe("crit");
    expect(scoreTone(80)).toBe("good");
    expect(scoreTone(79)).toBe("warn");
  });
});

describe("buildHeroStats", () => {
  const opps = (n: number): Opportunity[] =>
    Array.from({ length: n }, (_, i) => ({ label: `o${i}`, detail: "d" }));

  it("sources all three figures from real fields", () => {
    const stats = buildHeroStats({ audit: audit({ pagesCrawled: 17 }), opportunities: opps(3), openCount: 4 });
    expect(stats).toEqual([
      { key: "pages", value: 17, noun: "page analysed", nounPlural: "pages analysed" },
      { key: "opportunities", value: 3, noun: "opportunity", nounPlural: "opportunities" },
      { key: "actions", value: 4, noun: "priority action", nounPlural: "priority actions" },
    ]);
  });

  it("never offers an insights count, because nothing measures one", () => {
    // The requested design asked for "4 insights ready". No field in this
    // codebase counts insights, and a total summed from the other three would
    // be a number nobody could reproduce on the next screen. This assertion is
    // here so it cannot creep back in.
    const stats = buildHeroStats({ audit: audit(), opportunities: opps(4), openCount: 4 });
    for (const stat of stats) {
      expect(`${stat.noun} ${stat.nounPlural}`).not.toMatch(/insight/i);
    }
  });

  it("drops the pages figure for an account with no audit yet", () => {
    // `audit: null` is a new account, not a site with zero pages.
    const stats = buildHeroStats({ audit: null, opportunities: opps(2), openCount: 3 });
    expect(stats.map((s) => s.key)).toEqual(["opportunities", "actions"]);
  });

  it("drops a figure that is zero rather than printing a nought", () => {
    const stats = buildHeroStats({ audit: audit({ pagesCrawled: 4 }), opportunities: opps(2), openCount: 0 });
    expect(stats.map((s) => s.key)).toEqual(["pages", "opportunities"]);
  });

  it("returns nothing at all when fewer than two figures survive", () => {
    // One lonely number under a display heading reads as the other two having
    // failed to load. The caller renders no strip for an empty list.
    expect(buildHeroStats({ audit: null, opportunities: [], openCount: 2 })).toEqual([]);
    expect(buildHeroStats({ audit: null, opportunities: [], openCount: 0 })).toEqual([]);
  });

  it("carries both word forms, because none of them pluralise with an s", () => {
    const [pages] = buildHeroStats({ audit: audit({ pagesCrawled: 1 }), opportunities: opps(1), openCount: 1 });
    // "page analyseds" and "key opportunitys" are what a default suffix gives.
    expect(pages).toMatchObject({ noun: "page analysed", nounPlural: "pages analysed" });
  });
});

describe("buildPresenceFlow", () => {
  const opps = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `o${i}`, detail: "d" }));
  const ads = (state: "not-connected" | "no-conversions" | "available", conversions = 0) => ({
    state,
    conversions,
  });

  it("always returns the same four nodes, whatever the account", () => {
    // The labels are fixed on purpose: there is no industry taxonomy in this
    // product, so a per-vertical funnel would be invented. What varies is
    // state and figures.
    const flow = buildPresenceFlow({
      audit: null,
      geo: null,
      ads: ads("not-connected"),
      opportunities: [],
    });
    expect(flow.map((n) => n.id)).toEqual(["website", "visibility", "opportunities", "growth"]);
    expect(flow.map((n) => n.label)).toEqual([
      "Website",
      "AI visibility",
      "Opportunities",
      "Growth",
    ]);
  });

  it("shows a brand-new account as four dormant nodes with no figures", () => {
    const flow = buildPresenceFlow({
      audit: null,
      geo: null,
      ads: ads("not-connected"),
      opportunities: [],
    });
    expect(flow.every((n) => n.state === "dormant")).toBe(true);
    expect(flow.every((n) => n.value === null)).toBe(true);
    expect(flow.every((n) => n.strength === 0)).toBe(true);
  });

  it("lights each node from its own real field", () => {
    const flow = buildPresenceFlow({
      audit: audit({ pagesCrawled: 17 }),
      geo: { score: 62 },
      ads: ads("available", 128),
      opportunities: opps(3),
    });
    expect(flow).toMatchObject([
      { id: "website", state: "active", value: "17 pages" },
      { id: "visibility", state: "active", value: "62 / 100" },
      { id: "opportunities", state: "active", value: "3 found" },
      { id: "growth", state: "active", value: "128 conversions" },
    ]);
  });

  it("treats a measurement that produced no score as pending, not absent", () => {
    // A geo row with a null score RAN and found nothing; that is not the same
    // as never having run, and the drawing distinguishes them.
    const flow = buildPresenceFlow({
      audit: null,
      geo: { score: null },
      ads: ads("not-connected"),
      opportunities: [],
    });
    expect(flow[1]).toMatchObject({ id: "visibility", state: "pending", value: null });
  });

  it("maps each advertising state to its own node state", () => {
    const growth = (state: "not-connected" | "no-conversions" | "available", n = 0) =>
      buildPresenceFlow({ audit: null, geo: null, ads: ads(state, n), opportunities: [] })[3];

    expect(growth("not-connected")).toMatchObject({ state: "dormant", value: null });
    // Connected but nothing recorded yet: lit, but with nothing to print.
    expect(growth("no-conversions")).toMatchObject({ state: "pending", value: null });
    expect(growth("available", 1)).toMatchObject({ state: "active", value: "1 conversion" });
  });

  it("uses the singular for a count of one", () => {
    const flow = buildPresenceFlow({
      audit: audit({ pagesCrawled: 1 }),
      geo: null,
      ads: ads("available", 1),
      opportunities: opps(1),
    });
    expect(flow[0]!.value).toBe("1 page");
    expect(flow[3]!.value).toBe("1 conversion");
  });

  it("keeps every strength inside 0-1 so the drawing cannot overshoot", () => {
    const flow = buildPresenceFlow({
      audit: audit({ pagesCrawled: 4000 }),
      geo: { score: 100 },
      ads: ads("available", 99999),
      opportunities: opps(4),
    });
    for (const node of flow) {
      expect(node.strength).toBeGreaterThanOrEqual(0);
      expect(node.strength).toBeLessThanOrEqual(1);
    }
  });
});

describe("summarySentence (2026-10-13)", () => {
  it("finds the sentence that says what the business is, past the headings", () => {
    const raw =
      "LeadByte — Automate. Optimize. Outgrow. About Us We Build AI That Works While You Sleep LeadByte is an AI automation company focused on helping businesses grow smarter, faster, and more efficiently through intelligent workflows. We build decision-driven workflows.";
    expect(summarySentence(raw, "LeadByte")).toBe(
      "LeadByte is an AI automation company focused on helping businesses grow smarter, faster, and more efficiently through intelligent workflows.",
    );
  });

  it("accepts a sentence in the first person", () => {
    expect(summarySentence("Home Menu Contact. We help local bakeries sell more cakes online every week.", "Acme")).toBe(
      "We help local bakeries sell more cakes online every week.",
    );
  });

  it("falls back to the first readable sentence, and to null when there is none", () => {
    expect(summarySentence("Fresh bread and pastries baked every morning in our village shop", "Acme")).toBe(
      "Fresh bread and pastries baked every morning in our village shop.",
    );
    expect(summarySentence("Home About Us Services Contact Blog", "Acme")).toBeNull();
    expect(summarySentence("", "Acme")).toBeNull();
    expect(summarySentence(null, "Acme")).toBeNull();
  });
});
