import {
  buildAgentDashboard,
  mapCompetitors,
  mapKeywords,
  mapLeadQualification,
  mapOffPageMail,
  mapSocialPosts,
  num,
  sectionFailed,
} from "./agent-dashboard";
import type { SourceOutcome } from "@/lib/api/read-cascade";

/**
 * The dashboard tables are raw DynamoDB, read by name, with field spellings
 * taken from a document rather than from a response. So these tests are about
 * what happens when the payload is NOT the shape the document promised —
 * which is the case this mapping has to survive.
 */

const ok = (rows: Record<string, unknown>[]): SourceOutcome => ({
  ok: true,
  error: null,
  rows,
});

describe("num", () => {
  it("reads a figure whichever type DynamoDB used", () => {
    // The guide says values arrive as strings or numbers, interchangeably.
    expect(num(1200)).toBe(1200);
    expect(num("1200")).toBe(1200);
    expect(num(" 1,200 ")).toBe(1200);
  });

  it("is null for anything that is not a figure, never 0", () => {
    // 0 is a fact the backend can state. Coercing an absent field to it prints
    // a number nobody sent — the mistake rule 6 exists for.
    expect(num(undefined)).toBeNull();
    expect(num(null)).toBeNull();
    expect(num("")).toBeNull();
    expect(num("n/a")).toBeNull();
    expect(num(Number.NaN)).toBeNull();
    expect(num(0)).toBe(0);
  });
});

describe("mapLeadQualification", () => {
  it("reads the four KPIs off the single row", () => {
    const kpis = mapLeadQualification(
      ok([
        {
          no_of_client_lead_email: "42",
          no_of_email_sent_to_leads: 120,
          no_of_responses_from_leads: 7,
          salesteam_sent_email_sent_count: 3,
        },
      ]),
    );
    expect(kpis.map((k) => k.value)).toEqual([42, 120, 7, 3]);
  });

  it("keeps the labels and nulls the figures when the table is empty", () => {
    // Still four labelled slots: the section says what it would show, rather
    // than collapsing to nothing and leaving the reader guessing.
    const kpis = mapLeadQualification(ok([]));
    expect(kpis).toHaveLength(4);
    expect(kpis.every((k) => k.value === null)).toBe(true);
  });
});

describe("mapSocialPosts", () => {
  it("labels each platform's audience column by what that platform reports", () => {
    // Instagram reports reach and Facebook reports views. Merging them into one
    // unlabelled column would equate two different claims.
    const posts = mapSocialPosts({
      Facebook_Analytics: ok([{ post_link: "https://fb/1", likes_count: 5, views_count: 90 }]),
      Instagram_analytics: ok([{ post_link: "https://ig/1", likes_count: 9, reach_count: 40 }]),
    });

    expect(posts).toEqual([
      {
        platform: "Facebook",
        link: "https://fb/1",
        likes: 5,
        comments: null,
        audience: 90,
        audienceLabel: "Views",
      },
      {
        platform: "Instagram",
        link: "https://ig/1",
        likes: 9,
        comments: null,
        audience: 40,
        audienceLabel: "Reach",
      },
    ]);
  });

  it("is empty when no platform returned anything", () => {
    expect(mapSocialPosts({})).toEqual([]);
  });
});

describe("mapKeywords", () => {
  it("drops a row with no keyword rather than rendering it blank", () => {
    // Rule 5: an empty string is "not set", and a blank row in a table reads
    // as data we lost rather than data that was never there.
    const rows = mapKeywords(
      ok([
        { Keyword: "lead automation", Priority: "High", SearchVolume: "880" },
        { Keyword: "   ", Priority: "Low", SearchVolume: 10 },
        { Priority: "Low" },
      ]),
    );
    expect(rows).toEqual([
      { keyword: "lead automation", priority: "High", searchVolume: 880 },
    ]);
  });
});

describe("mapCompetitors", () => {
  it("reads the backend's own misspelling of the referring-domain field", () => {
    // `Reffering_domain` is how the table spells it. Correcting it here would
    // read nothing and show a dash on every row.
    const rows = mapCompetitors(
      ok([{ Competitor_name: "Acme", authority_score: 51, Reffering_domain: "1200" }]),
    );
    expect(rows).toEqual([
      { name: "Acme", authorityScore: 51, referringDomains: 1200 },
    ]);
  });

  it("drops a nameless competitor", () => {
    expect(mapCompetitors(ok([{ authority_score: 9 }]))).toEqual([]);
  });
});

describe("mapOffPageMail", () => {
  it("sums the counts across every row", () => {
    const kpis = mapOffPageMail(
      ok([
        { sent_mails: 10, reply_mails: 2 },
        { sent_mails: "5", reply_mails: 1 },
      ]),
    );
    expect(kpis).toEqual([
      { label: "Emails sent", value: 15 },
      { label: "Replies", value: 3 },
    ]);
  });

  it("is null, not 0, when no row carried the column at all", () => {
    // "Nobody has replied" and "this column is not in the payload" are
    // different facts and must not both print as zero.
    expect(mapOffPageMail(ok([{ something_else: 1 }]))).toEqual([
      { label: "Emails sent", value: null },
      { label: "Replies", value: null },
    ]);
  });
});

describe("sectionFailed", () => {
  it("separates a table that had nothing from one that could not be read", () => {
    // The whole reason `SourceOutcome` is carried through instead of being
    // flattened to rows: an empty state has to be earned.
    const empty = buildAgentDashboard("on-page-seo", { keywo_details: ok([]) });
    expect(sectionFailed(empty)).toBeNull();

    const broken = buildAgentDashboard("on-page-seo", {
      keywo_details: { ok: false, error: "500 from /api/query", rows: [] },
    });
    expect(sectionFailed(broken)).toBe("500 from /api/query");
  });
});

describe("buildAgentDashboard", () => {
  it("fills only the sections that agent has", () => {
    // Each agent reads its own tables; a shared fallback is what made one
    // agent display another's activity log (rule 3).
    const social = buildAgentDashboard("social-media", {
      Facebook_Analytics: ok([{ post_link: "https://fb/1" }]),
    });
    expect(social.posts).toHaveLength(1);
    expect(social.kpis).toEqual([]);
    expect(social.keywords).toEqual([]);
    expect(social.competitors).toEqual([]);
  });
});
