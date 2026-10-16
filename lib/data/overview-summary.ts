import type { AdvertisingData, BusinessProfile, GeoAnalysis, WebsiteAudit } from "@/lib/data/types";
import type { AgentState } from "@/lib/data/types";

/**
 * What the landing screen says to do next, and how it colours a score.
 *
 * ## Why this is not in the page
 *
 * Pages are not tested here — `npm run build` is their only check — so any
 * rule that decides what a customer is TOLD belongs in a module that can be.
 * This list is exactly that: it is the first thing anyone reads after signing
 * in, and every item is a claim about their account. Telling somebody to fix
 * two critical findings they do not have, or that their AI visibility is poor
 * when it was never measured, is worse than an empty list.
 *
 * It was inline in `overview/page.tsx` as five conditional `<li>` blocks plus
 * a hand-maintained `nextActionCount` that repeated all five conditions a
 * second time to decide whether to show "nothing to do". Two copies of the
 * same rule is one that goes stale.
 */

export interface Action {
  title: string;
  /** Why it is worth doing — the consequence, not a restatement of the verb. */
  reason: string;
  /** The words on the control, an active verb for what happens next. */
  cta: string;
  href: string;
  /** Drives the marker's colour. Reserved for things already going wrong. */
  urgent: boolean;
}

/**
 * At most four.
 *
 * A landing screen listing eight jobs is a backlog, and a backlog gets closed
 * rather than worked through. The order below is the priority, so a cut item
 * is always the least pressing one.
 */
const MAX_ACTIONS = 4;

/**
 * Priority actions are capped one lower than opportunities because the
 * Overview draws them three to a row. At four, the heading said "4 things
 * need your attention" above three cards, and the fourth thing was nowhere.
 */
const MAX_PRIORITY_ACTIONS = 3;

/**
 * The agents the summary leads with, in this order — the order they were
 * asked for. Both the agent tiles and the "set up an agent" action read it,
 * so the one the action names is always the first waiting tile. Agents not
 * listed here still show, after these.
 */
export const SUMMARY_AGENT_ORDER: readonly string[] = [
  "meta-ads",
  "openai-ads",
  "google-ads",
  "on-page-seo",
  "lead-qualification",
  "linkedin-ads",
  "social-media",
];

/**
 * What each agent tile on the Summary says, in the wording given for it
 * (2026-09-28). Summary only: the Agents page keeps the definitions' own
 * descriptions. An agent missing here falls back to that description.
 */
export const SUMMARY_AGENT_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "on-page-seo": "Optimizes metadata, schema, content, and internal links to improve search visibility.",
  "google-ads": "Creates campaigns and creatives, manages budgets and targeting, and optimizes performance continuously.",
  "lead-qualification": "Scores inbound leads against your ideal customer profile and routes qualified leads to sales.",
  "social-media": "Creates and schedules on-brand posts from your content, campaigns, and marketing strategy.",
  "meta-ads": "Creates campaigns and creatives, manages audiences and targeting, and optimizes performance continuously.",
  "off-page-seo": "Builds authority through citations, backlinks, brand mentions, and off-page SEO opportunities.",
  aeo: "Optimizes content for AI answers by improving structure, clarity, authority, and answer relevance.",
  "linkedin-ads": "Creates campaigns and creatives, targets professional audiences, and optimizes campaign performance.",
  "openai-ads": "Creates and manages AI-focused campaigns and optimizes performance using your connected API setup.",
};

/** `agents` with the `SUMMARY_AGENT_ORDER` ones first; the rest keep their order. */
export function orderForSummary<T extends { id: string }>(agents: readonly T[]): T[] {
  const rank = (id: string) => {
    const at = SUMMARY_AGENT_ORDER.indexOf(id);
    return at === -1 ? SUMMARY_AGENT_ORDER.length : at;
  };
  return [...agents].sort((a, b) => rank(a.id) - rank(b.id));
}

/**
 * What the Overview calls an account whose profile has no business name yet.
 *
 * Exported so the page that sets it and the intro that has to RECOGNISE it
 * share one string. The intro's heading reads "Here's what we found about
 * {name}", which becomes "…about Your business." if it cannot tell the
 * default from a real name — so it compares against this rather than
 * string-matching, and the two cannot drift apart.
 */
export const DEFAULT_BUSINESS_NAME = "Your business";

/** Below this, AI answer engines struggle to read a site at all. */
const GEO_FLOOR = 50;

export function buildActions({
  profile,
  audit,
  geo,
  ads,
  agentStates,
  agents,
}: {
  profile: BusinessProfile | null;
  audit: WebsiteAudit | null;
  geo: GeoAnalysis | null;
  ads: AdvertisingData | null;
  agentStates: AgentState[];
  /** The offered agents, for their names. Hidden ones are never suggested. */
  agents: readonly { id: string; name: string }[];
}): Action[] {
  const actions: Action[] = [];

  // First, always: nothing else on this page can be computed without it, so
  // an account in this state is looking at a screen of empty states and needs
  // to know which one thing unblocks them.
  if (!profile?.websiteUrl) {
    actions.push({
      title: "Add your website",
      reason: "Everything else on this page is worked out from a crawl of your site.",
      cta: "Add website",
      href: "/",
      urgent: true,
    });
  }

  if (audit && audit.criticalCount > 0) {
    const n = audit.criticalCount;
    actions.push({
      title: `Fix ${n} critical ${n === 1 ? "finding" : "findings"}`,
      reason: "Critical issues are the ones search engines and AI crawlers act on first.",
      cta: "Review",
      href: "/overview/website-audit",
      urgent: true,
    });
  }

  // `geo.score` is null when the backend never computed one, and `null < 50`
  // is TRUE in JavaScript — the unguarded comparison would have told every
  // unanalysed account its AI visibility was poor.
  if (geo && geo.score !== null && geo.score < GEO_FLOOR) {
    actions.push({
      title: "Improve how AI engines read your site",
      reason: `Scored ${geo.score} out of 100 — most answer engines cannot quote you reliably.`,
      cta: "Review",
      href: "/overview/geo-analysis",
      urgent: false,
    });
  }

  // Named, not assumed. This said "Connect LinkedIn Ads" whatever was actually
  // missing, because the sentence was hard-coded beside a check that only
  // asked whether ANY platform was unconnected.
  const missing = ads?.platforms.filter((platform) => !platform.connected) ?? [];
  if (missing.length > 0) {
    const names = missing.map((platform) => platform.label);
    actions.push({
      title: `Connect ${names.length === 1 ? names[0] : `${names.length} more ad accounts`}`,
      reason: "Spend on a disconnected account is missing from every figure here.",
      cta: "Connect",
      href: "/intelligence/connections",
      urgent: false,
    });
  }

  // By status, not by runs: runs exist only in the mock repo, so on a live
  // account this said "never run" for ever, even once it had been set up.
  //
  // ONE card for the first waiting agent, linking straight to its own setup,
  // rather than a card per agent: a new live account has every agent waiting,
  // and seven "Set up X" cards would push the audit and connection actions
  // off the row. The rest are counted in the reason instead.
  const waitingIds = new Set(
    agentStates.filter((state) => state.status === "needs-setup").map((state) => state.agentId),
  );
  const waiting = orderForSummary(agents.filter((agent) => SUMMARY_AGENT_ORDER.includes(agent.id))).filter(
    (agent) => waitingIds.has(agent.id),
  );
  const [nextAgent] = waiting;
  if (nextAgent) {
    const others = waiting.length - 1;
    actions.push({
      title: `Set up the ${nextAgent.name} agent`,
      reason:
        others > 0
          ? `It is not working for you until it is set up. ${others} more ${others === 1 ? "agent is" : "agents are"} waiting after it.`
          : "It is not working for you until it is set up.",
      cta: "Set up",
      href: `/agents/${nextAgent.id}`,
      urgent: false,
    });
  }

  return actions.slice(0, MAX_PRIORITY_ACTIONS);
}

/**
 * The colour a score is set in.
 *
 * Both website scores used to render in amber whatever they were, so the
 * colour carried no information — 46 and 92 looked equally cautionary. Banding
 * makes the colour say something before the number is read.
 *
 * Null stays NEUTRAL rather than joining a band. A score the backend never
 * computed is not a bad score, and amber beside two real figures reads as a
 * middling verdict on something that was never measured — the same mistake
 * `website-analysis.ts` maps a zero to null to avoid.
 */
export function scoreTone(score: number | null): "neutral" | "good" | "warn" | "crit" {
  if (score === null) return "neutral";
  if (score >= 80) return "good";
  if (score >= 50) return "warn";
  return "crit";
}

export type ActionKind = "critical" | "ads" | "seo" | "generic";

/**
 * Which visual family an action belongs to, from the action itself.
 *
 * `Action` carries no `kind` of its own — `buildActions` is read by the plain
 * text row on today's Overview page, which has no use for one. This is
 * read-only classification for a screen that wants to colour-code its cards,
 * so it infers from the same title/reason text a person already reads rather
 * than adding a field every other caller would have to keep in sync.
 */
export function actionKind(action: Action): ActionKind {
  const text = `${action.title} ${action.reason}`.toLowerCase();
  if (action.urgent) return "critical";
  if (text.includes("ad accounts") || text.includes("ads")) return "ads";
  if (text.includes("seo") || text.includes("website")) return "seo";
  return "generic";
}

export interface Opportunity {
  label: string;
  detail: string;
}

/**
 * At most four directional opportunities, each tied to a real number.
 *
 * Same reasoning as `buildActions`: this is a claim about the account, read
 * on the first screen after signing in, so it belongs somewhere testable
 * rather than inline in the page. Every entry below reads an existing field —
 * nothing here is a synthesized "value proposition" or an invented metric.
 */
export function buildOpportunities({
  audit,
  geo,
  ads,
  needsSetup,
}: {
  audit: WebsiteAudit | null;
  geo: GeoAnalysis | null;
  ads: AdvertisingData | null;
  needsSetup: number;
}): Opportunity[] {
  const items: Opportunity[] = [];

  if (geo && geo.score !== null) {
    items.push({
      label: "Increase visibility in AI search",
      detail: `Current visibility is ${geo.score}/100.`,
    });
  }

  if (audit && audit.criticalCount > 0) {
    const n = audit.criticalCount;
    items.push({
      label: "Fix technical SEO issues",
      detail: `${n} critical ${n === 1 ? "issue" : "issues"} found in the audit.`,
    });
  }

  if (!ads || ads.conversions === 0) {
    items.push({
      label: "Connect paid channels to measure conversions",
      detail: "Conversion data becomes useful once a connected account records one.",
    });
  }

  if (needsSetup > 0) {
    items.push({
      label: "Automate growth with AI agents",
      detail: `${needsSetup} ${needsSetup === 1 ? "agent" : "agents"} still ${needsSetup === 1 ? "needs" : "need"} setup.`,
    });
  }

  return items.slice(0, MAX_ACTIONS);
}

export interface HeroStat {
  key: "pages" | "opportunities" | "actions";
  value: number;
  /**
   * Both forms, because none of these pluralise by adding an `s` to the end:
   * it is "pages analysed", not "page analyseds", and "key opportunities",
   * not "key opportunitys". `countOf`'s default suffix cannot do either.
   */
  noun: string;
  nounPlural: string;
}

/**
 * The three figures in the welcome hero, and the rule that every one of them
 * has a source.
 *
 * ## Why this is a module and not three lines of JSX
 *
 * The requested design showed "17 pages analyzed · 3 key opportunities ·
 * 4 insights ready". The first two are real fields. **The third does not
 * exist**: nothing in this codebase counts "insights", and the nearest
 * countable numbers (`totalIssues`, `findings.length`, `openCount`) are
 * different quantities with different meanings. A hero stat is the first
 * number a customer reads after signing in, so inventing one — or summing
 * three real ones into a total nobody can reproduce on the next screen — is
 * the worst available option. The third slot is `openCount` instead, which is
 * literally what the hero points the reader down to.
 *
 * A stat whose source is missing is DROPPED rather than shown as zero. "0
 * pages analysed" beside a heading saying the insights are ready is a
 * contradiction; an absent stat is just a shorter strip.
 *
 * Fewer than two survivors returns an empty list, and the caller renders no
 * strip at all: one lonely figure under a display heading reads as the other
 * two having failed to load.
 */
const MIN_HERO_STATS = 2;

export function buildHeroStats({
  audit,
  opportunities,
  openCount,
}: {
  /*
   * Only the crawl count is read, so only that is asked for. The Overview
   * dashboard holds a narrowed view of the audit rather than a `WebsiteAudit`,
   * and widening this to the full type would force a cast at the one call
   * site for a field it does not touch.
   */
  audit: Pick<WebsiteAudit, "pagesCrawled"> | null;
  opportunities: Opportunity[];
  openCount: number;
}): HeroStat[] {
  const stats: HeroStat[] = [];

  // `pagesCrawled` is the real crawl count, already shown twice further down
  // this page. `audit === null` is a new account, not a zero.
  if (audit && audit.pagesCrawled > 0) {
    stats.push({
      key: "pages",
      value: audit.pagesCrawled,
      noun: "page analysed",
      nounPlural: "pages analysed",
    });
  }

  if (opportunities.length > 0) {
    stats.push({
      key: "opportunities",
      value: opportunities.length,
      noun: "opportunity",
      nounPlural: "opportunities",
    });
  }

  if (openCount > 0) {
    stats.push({
      key: "actions",
      value: openCount,
      noun: "priority action",
      nounPlural: "priority actions",
    });
  }

  return stats.length >= MIN_HERO_STATS ? stats : [];
}

export type PresenceNodeState = "active" | "pending" | "dormant";

export interface PresenceNode {
  id: string;
  /** A short noun phrase. Fixed per node — see the note below on why. */
  label: string;
  /** A sourced figure, or null when there is nothing real to print. */
  value: string | null;
  state: PresenceNodeState;
  /** 0-1. Drives the ridge height in the drawing, nothing else. */
  strength: number;
}

/**
 * The account's digital presence as a four-point signal flow.
 *
 * ## Why the labels are fixed and only the state moves
 *
 * The design asked for nodes that adapt per industry — "Website → AI Search →
 * Leads" for a SaaS, "Website → Local Search → Reviews → Patients" for a
 * dental practice. That cannot be built honestly here. `industry` and
 * `businessType` are free-text strings that are routinely empty, there is no
 * taxonomy, enum or lookup anywhere in the product that classifies a business
 * into a vertical, and the backend payload documentation states plainly that
 * no industry field exists upstream. Labelling a dentist's funnel "Reviews →
 * Patients" would be a claim about their business that nothing measured.
 *
 * So the four labels are this page's own four subjects, which are true for
 * every account, and everything that varies per client — which nodes are
 * lit, what figure each one carries, how high the ridge rises — comes from
 * real fields. A brand-new account gets four dormant nodes on a dashed line,
 * which is an honest picture of knowing nothing yet rather than a funnel
 * asserted to be running.
 *
 * ## Why a value is null rather than zero
 *
 * Same rule as `buildHeroStats`. "0 pages" beside a heading that says we
 * analysed the site is a contradiction; no figure at all is just a node that
 * has not lit up.
 */
export function buildPresenceFlow({
  audit,
  geo,
  ads,
  opportunities,
}: {
  audit: Pick<WebsiteAudit, "pagesCrawled"> | null;
  geo: { score: number | null } | null;
  ads: { state: "not-connected" | "no-conversions" | "available"; conversions: number };
  opportunities: Opportunity[];
}): PresenceNode[] {
  const pages = audit?.pagesCrawled ?? 0;
  const opportunityCount = opportunities.length;

  return [
    {
      id: "website",
      label: "Website",
      value: pages > 0 ? `${pages} ${pages === 1 ? "page" : "pages"}` : null,
      state: pages > 0 ? "active" : "dormant",
      // A site of 50 pages or more reads as "fully crawled" for the purpose of
      // a ridge height. The cap keeps a 4,000-page site from flattening every
      // other node against the baseline.
      strength: pages > 0 ? Math.min(pages / 50, 1) : 0,
    },
    {
      id: "visibility",
      label: "AI visibility",
      value: geo?.score != null ? `${geo.score} / 100` : null,
      // A geo row with no score is a measurement that ran and produced
      // nothing, which is not the same as never having run.
      state: geo === null ? "dormant" : geo.score === null ? "pending" : "active",
      strength: geo?.score != null ? geo.score / 100 : 0,
    },
    {
      id: "opportunities",
      label: "Opportunities",
      value: opportunityCount > 0 ? `${opportunityCount} found` : null,
      state: opportunityCount > 0 ? "active" : "dormant",
      // `buildOpportunities` caps at four, so four is full height.
      strength: Math.min(opportunityCount / MAX_ACTIONS, 1),
    },
    {
      id: "growth",
      label: "Growth",
      value:
        ads.state === "available"
          ? `${ads.conversions} ${ads.conversions === 1 ? "conversion" : "conversions"}`
          : null,
      state:
        ads.state === "available" ? "active" : ads.state === "no-conversions" ? "pending" : "dormant",
      strength: ads.state === "available" ? 1 : ads.state === "no-conversions" ? 0.4 : 0,
    },
  ];
}

/**
 * The anchor of the Overview's first stacked card, which the hero's scroll cue
 * points at. Here rather than in the dashboard because that is a client
 * module, and a server component importing a plain value from one receives a
 * client reference, not the string.
 */
export const FIRST_SECTION_ID = "summary";

/**
 * One clean sentence saying what the business does, picked out of the crawled
 * description — or null when there is none worth showing.
 *
 * The description is the site's text run together with its headings and
 * menus stripped of punctuation, so read raw it opens like "LeadByte —
 * Automate. Optimize. Outgrow. About Us We Build AI That Works While You Sleep
 * LeadByte is an AI automation company…" (2026-10-13). The sentence a reader
 * wants is usually in there: the business's name, or "We", followed by what
 * it is or does. A run of Title Case words before it is a heading, not prose.
 */
export function summarySentence(description: string | null | undefined, name: string): string | null {
  if (!description) return null;
  const text = description.replace(/\s+/g, " ").trim();
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const verbs = "is|are|was|helps|help|builds|build|provides|provide|offers|offer|creates|create|delivers|deliver|makes|make|specialises|specializes|specialise|specialize";
  const subject = new RegExp(`\\b(${escaped ? `${escaped}|` : ""}we|our team|our company)\\s+(${verbs})\\b`, "i");

  const words = (value: string) => value.trim().split(" ").filter(Boolean);
  const readable = (value: string) => {
    const list = words(value);
    if (list.length < 6 || list.length > 45) return false;
    // A heading or a menu is mostly Capitalised Words; a sentence is not.
    const capitalised = list.filter((word) => /^[A-Z]/.test(word)).length;
    return capitalised / list.length < 0.5;
  };
  const finish = (value: string) => {
    const trimmed = value.trim();
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  };

  // "We Build AI That Works" matches too, but it is a heading: the words after
  // the subject are Capitalised. A real sentence goes on in lower case.
  const headingLike = (candidate: string) =>
    words(candidate).slice(1, 4).filter((word) => /^[A-Z]/.test(word)).length >= 2;

  for (const sentence of sentences) {
    const all = new RegExp(subject.source, "gi");
    for (const match of sentence.matchAll(all)) {
      const candidate = sentence.slice(match.index);
      if (!headingLike(candidate) && readable(candidate)) {
        return finish(candidate.charAt(0).toUpperCase() + candidate.slice(1));
      }
    }
  }
  const prose = sentences.find(readable);
  return prose ? finish(prose) : null;
}
