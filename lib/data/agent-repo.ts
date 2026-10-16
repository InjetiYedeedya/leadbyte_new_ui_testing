import { devGlobal } from "@/lib/dev-global";
import type { AgentDefinition, AgentRun, AgentState, AgentStatus } from "./types";
import { fixturesAllowed } from "@/lib/data/fixtures";

export interface AgentRepo {
  listDefinitions(): AgentDefinition[];
  getState(businessId: string, agentId: string): Promise<AgentState>;
  listStates(businessId: string): Promise<AgentState[]>;
  activate(businessId: string, agentId: string): Promise<AgentRun>;
  unblock(businessId: string, agentId: string, newStatus: AgentStatus): Promise<void>;
}

/**
 * ## `whyThisAgent` says what the agent DOES, never what your account shows
 *
 * These lines used to carry account-specific figures — "Broad match and PMax
 * burn 46% of spend at 2.9x your target CPA", "612 leads a month", "68% of
 * closed-won accounts…". They are rendered verbatim on EVERY account
 * (`agents/[agentId]/page.tsx`), and none of them came from a measurement, so
 * every customer was shown the same invented diagnosis of their own business.
 *
 * A number here needs a source and a period. Until an agent can read one, the
 * sentence describes the capability instead — which is true for everyone.
 */
export const AGENT_DEFINITIONS: AgentDefinition[] = [
  // ORDER IS THE ORDER ON SCREEN — the Agents list keeps this array order
  // inside its Ready / Needs-setup groups. Set by the product team on
  // 2026-09-30 (agent-repo.test.ts pins it). Writer and Coding are hidden.
  {
    id: "openai-ads",
    name: "OpenAI Ads",
    description: "Explore AI-powered advertising opportunities and prepare your next campaign.",
    // No `whyThisAgent` claim about this account's data: unlike the other
    // three, nothing in the analysis measures OpenAI ad performance yet, so a
    // sentence here would be a figure with no source behind it.
    whyThisAgent: "Runs on a key you supply, so spend and rate limits stay on your own account.",
  },
  {
    id: "meta-ads",
    name: "Meta Ads",
    // Approved copy for the agent's start screen (LBS-1255), word for word.
    description: "Automate The Campaign Creation. Monitor. Optimize. Grow.",
    whyThisAgent:
      "Launch your Meta campaigns faster and let your AI agent handle the ongoing work — with your permission.",
    benefits: [
      {
        title: "Save time with automation",
        body: "Set up your campaign once. Your agent can monitor performance, identify opportunities, and optimize campaigns based on your approved settings.",
      },
    ],
  },
  {
    id: "google-ads",
    name: "Google Ads",
    description: "Turn searches into customers with smarter campaigns, budgets, and keyword targeting.",
    whyThisAgent:
      "Finds where match types and Performance Max are spending above your target cost per acquisition.",
  },
  {
    id: "lead-qualification",
    name: "Lead Qualification",
    description: "Identify your best leads, score their potential, and help your sales team focus on buyers.",
    whyThisAgent:
      "Scores inbound leads the way your closed-won deals look, so sales sees the best ones first.",
  },
  {
    id: "on-page-seo",
    name: "On-Page SEO",
    description: "Optimize your pages, fix SEO issues, and help your website rank higher.",
    whyThisAgent:
      "Fixes the audit findings that sit on the pages organic search actually lands on.",
  },
  {
    id: "off-page-seo",
    name: "Off-Page SEO",
    description: "Build website authority, discover link opportunities, and strengthen your backlink profile.",
    whyThisAgent: "Earns citations on the sites your category is discussed on, and watches for new mentions.",
  },
  {
    id: "linkedin-ads",
    name: "LinkedIn Ads",
    description: "Reach decision-makers, generate quality B2B leads, and grow your business.",
    whyThisAgent:
      "Targets the job titles your closed-won deals share — the one thing LinkedIn can target directly.",
  },
  {
    id: "social-media",
    name: "Social Media",
    description: "Plan your content, create engaging posts and keep your social channels active.",
    whyThisAgent: "Published content has no distribution plan today.",
  },
  {
    id: "aeo",
    name: "AEO",
    description: "Make your content easier for AI search tools to understand, trust, and recommend.",
    // No figure about THIS account. GEO analysis measures the readability and
    // trust signals an answer engine reads; nothing yet measures how often one
    // actually cites this site, so a sentence claiming otherwise would be a
    // number with no source — the rule this list already follows.
    whyThisAgent:
      "Acts on what GEO analysis measures — whether an answer engine can read your pages, trust them and quote them.",
  },
  {
    id: "blog-posting",
    name: "Blog Posting",
    description: "Create SEO-friendly blog posts and publish fresh content for your website.",
    // Switched on 2026-09-28: one run writes a post and publishes it
    // (`POST /api/blog-posting`, see `lib/data/blog-posting.ts`). Free for
    // now, so no purchase rule in `agent-run-gate.ts`.
    whyThisAgent: "Keeps your blog publishing regularly without anyone on your team writing it.",
  },
  {
    id: "writer",
    name: "Writer",
    description: "Writes the pages your GEO gaps need, with a brief and evidence attached to every draft.",
    whyThisAgent: "Writes pages for the queries your site has no answer for yet.",
  },
  {
    id: "coding",
    name: "Coding",
    description: "Turns blocked audit findings into reviewable pull requests against your repo.",
    whyThisAgent: "Ships the audit fixes that need a code change, as reviewable pull requests.",
  },
];

const INITIAL_STATUS: Record<string, AgentStatus> = {
  "on-page-seo": "recommended",
  "google-ads": "recommended",
  "lead-qualification": "ready",
  "social-media": "ready",
  writer: "ready",
  coding: "ready",
  "meta-ads": "needs-setup",
  "off-page-seo": "recommended",
  "linkedin-ads": "blocked",
};

// Per-agent fixture content for what an activation actually does. Kept in
// one file per agent's own entry here (not a shared/generic template) —
// mixing these up once caused a real bug (Lead Qualification's activity
// log falling back to Google Ads' content). See the design spec's
// "Lessons carried into code."
const RUN_CONTENT: Record<string, Omit<AgentRun, "runId" | "date">> = {
  "lead-qualification": {
    entries: [
      { time: "10:12", tag: "SCORED", title: "Scored 612 inbound leads", detail: "Firmographic fit, page path and form intent weighted against 41 closed-won deals." },
      { time: "10:13", tag: "ROUTED", title: "Routed 148 A-grade leads to sales", detail: "Assigned by region and deal-band; median time to owner 3m 40s." },
      { time: "10:13", tag: "RECOVERED", title: "Recovered 74 failed form submissions", detail: "Hidden-field validation was silently rejecting 6% of submissions — re-injected into the CRM." },
      { time: "10:14", tag: "SUPPRESSED", title: "Suppressed 291 low-fit leads from sales queues", detail: "Students, competitors and free-mail signups kept for nurture, not routed." },
      { time: "10:15", tag: "NEEDS APPROVAL", title: "Flagged 9 borderline leads for your review", detail: "Strong intent but no firmographic match — the model won't guess these." },
      { time: "10:16", tag: "BLOCKED", title: "Raised a fix request for the demo form", detail: "Hidden-field validation needs a developer — handed to the Coding agent." },
    ],
  },
  "google-ads": {
    entries: [
      { time: "14:02", tag: "OK", title: "Agent started", detail: "Configuration inherited from strategy — 9 fields pre-filled, 0 asked." },
      { time: "14:03", tag: "PAUSED", title: "Paused Search — Broad match (all services)", detail: "₹96,400/mo released — CPA was ₹7,415 against a ₹2,600 target." },
      { time: "14:03", tag: "PAUSED", title: "Paused Performance Max — Catch-all", detail: "Brand cannibalisation confirmed in the search-terms report." },
      { time: "14:04", tag: "SHIPPED", title: "Raised brand budget to ₹52,000/mo", detail: "Closes a 46-point impression-share gap at 6.4x ROAS." },
      { time: "14:05", tag: "SHIPPED", title: "Built 9 ad groups from 31 exact-intent terms", detail: "Sourced from the GEO scan's uncovered high-intent queries." },
      { time: "14:06", tag: "NEEDS APPROVAL", title: "Drafted 36 RSAs in NovaFlow's brand voice", detail: "3 flagged for your review — pricing claims need sign-off." },
    ],
  },
  writer: {
    entries: [
      { time: "08:15", tag: "PUBLISHED", title: "Published /compare/novaflow-vs-hubspot", detail: "1,840 words · answers 4 of the 12 GEO seed prompts directly." },
      { time: "08:26", tag: "PUBLISHED", title: "Published /glossary/marketing-automation", detail: "First 8 of 24 glossary entries · definitional citation play." },
      { time: "08:27", tag: "NEEDS APPROVAL", title: "Sent \"SEO automation for lean teams\" for review", detail: "Draft complete, awaiting your approval before publish." },
    ],
  },
  coding: {
    entries: [
      { time: "15:12", tag: "AWAITING REVIEW", title: "Opened PR #421 — unblock 3 pages in robots.txt", detail: "Blocks 12 queued schema fixes from the On-Page SEO agent." },
      { time: "15:13", tag: "MERGED", title: "Merged PR #418 — Organization + Product schema sitewide", detail: "Shipped to production by CI · validated in Rich Results." },
      { time: "15:14", tag: "AWAITING REVIEW", title: "Opened PR #422 — defer animation bundle, serve AVIF hero", detail: "Targets mobile LCP 4.6s → est. 2.4s on 12 templates." },
    ],
  },
  "on-page-seo": {
    entries: [
      { time: "09:01", tag: "SHIPPED", title: "Rewrote 14 missing meta descriptions", detail: "Templated from page intent, kept under 155 characters." },
      { time: "09:04", tag: "NEEDS APPROVAL", title: "Proposed Organization schema for the homepage", detail: "One field needs a human answer: registered legal entity name." },
    ],
  },
  "social-media": {
    entries: [
      { time: "11:02", tag: "SHIPPED", title: "Scheduled 5 LinkedIn posts from the SEO-automation article", detail: "Split into a 3-post carousel and 2 standalone hooks." },
    ],
  },
  "meta-ads": { entries: [] },
  "off-page-seo": { entries: [] },
  "linkedin-ads": {
    entries: [
      { time: "11:40", tag: "SHIPPED", title: "Built a Matched Audience from 41 closed-won accounts", detail: "Uploaded via CRM export, matched at 68% — LinkedIn's ceiling for list size this small." },
      { time: "11:42", tag: "SHIPPED", title: "Launched a single-image campaign against 3 target job titles", detail: "VP Marketing, Head of Growth, Marketing Ops Lead — the titles behind 68% of closed-won deals." },
      { time: "11:43", tag: "NEEDS APPROVAL", title: "Drafted ad copy referencing the category comparison page", detail: "Pending: confirm the claim against 2 named competitors is safe to publish." },
    ],
  },
};

const activeState = devGlobal<Record<string, Record<string, AgentState>>>(
  "agent_active_state",
  () => ({}),
);

// Seeded initial status/history only applies to the one business that has
// actually been analysed in this mock phase ("novaflow"). Any other
// business starts with a genuinely clean slate — no runs, nothing
// recommended — because it hasn't been analysed yet. Applying NovaFlow's
// fixture data to every business was a real bug, caught by testing a
// second business rather than assuming the seed was already scoped.
const SEEDED_BUSINESS_ID = "novaflow";

function initialStateFor(businessId: string, agentId: string): AgentState {
  // Seeded business AND no backend. With a backend configured every agent
  // starts empty, whoever is signed in — a real account must never be shown
  // demo activity as its own.
  if (businessId !== SEEDED_BUSINESS_ID || !fixturesAllowed()) {
    return { agentId, status: "needs-setup", runs: [] };
  }
  const initialStatus = INITIAL_STATUS[agentId] ?? "needs-setup";
  // A blocked agent has never run — even if RUN_CONTENT has fixture
  // entries for it to use once activated (LinkedIn Ads' content exists
  // for the activate() call below, not for pre-seeded history it hasn't
  // earned yet). Seeding history for a still-blocked agent was itself a
  // real bug, caught by testing the connect-then-activate flow end to end
  // rather than assuming the fixture data was scoped correctly.
  const seeded = initialStatus === "blocked" ? undefined : RUN_CONTENT[agentId];
  const runs: AgentRun[] =
    seeded && seeded.entries.length > 0
      ? [{ runId: `${agentId}-01`, date: "25 Aug 2026", entries: seeded.entries }]
      : [];
  return {
    agentId,
    status: initialStatus,
    blockedReason:
      agentId === "linkedin-ads"
        ? "Connect the LinkedIn Ads account to unblock this agent."
        : undefined,
    runs,
  };
}

function stateFor(businessId: string, agentId: string): AgentState {
  activeState[businessId] ??= {};
  activeState[businessId][agentId] ??= initialStateFor(businessId, agentId);
  return activeState[businessId][agentId];
}

/**
 * Agents that exist but are not part of the product yet.
 *
 * Writer and Coding have definitions, fixture content and working detail pages,
 * and none of that is being deleted — they are simply not offered. The list
 * lives HERE, at the repo, because it used to be a `const` inside the Agents
 * page, which meant only that page knew about it: the page listed seven agents
 * while the tab badge counted nine, and on any account other than the seeded
 * demo (where every agent starts `needs-setup`) the badge read 9 against a
 * screen showing 7.
 *
 * Anything that LISTS agents must therefore go through the repo, which filters
 * them out once. Anything that addresses an agent BY ID — a detail page, an
 * activation — still finds them in `AGENT_DEFINITIONS`, so the routes keep
 * working and nothing is lost when they are unhidden again.
 */
export const HIDDEN_AGENT_IDS: readonly string[] = ["writer", "coding"];

export function isHiddenAgent(agentId: string): boolean {
  return HIDDEN_AGENT_IDS.includes(agentId);
}

/** Every agent the product currently offers. */
export function visibleAgentDefinitions(): AgentDefinition[] {
  return AGENT_DEFINITIONS.filter((def) => !isHiddenAgent(def.id));
}

class MockAgentRepo implements AgentRepo {
  listDefinitions(): AgentDefinition[] {
    return visibleAgentDefinitions();
  }

  async getState(businessId: string, agentId: string): Promise<AgentState> {
    // By id, so a hidden agent's own page still works.
    return stateFor(businessId, agentId);
  }

  async listStates(businessId: string): Promise<AgentState[]> {
    return visibleAgentDefinitions().map((def) => stateFor(businessId, def.id));
  }

  async activate(businessId: string, agentId: string): Promise<AgentRun> {
    const current = stateFor(businessId, agentId);
    // Fixture activity belongs to the seeded demo business and nobody else.
    // Without this check, activating an agent on a REAL account wrote
    // NovaFlow's log into it — "Scored 612 inbound leads", "Routed 148 A-grade
    // leads" — and the screen presented that as the customer's own work. The
    // same rule `initialStateFor` already follows two functions up; activation
    // was the hole in it, and it is the more damaging half, because a seeded
    // empty state merely looks unfinished while a seeded RUN looks like a lie.
    //
    // A real account therefore gets an activation with no entries until the
    // agent's own backend reports what it did.
    const content =
      businessId === SEEDED_BUSINESS_ID && fixturesAllowed()
        ? (RUN_CONTENT[agentId] ?? { entries: [] })
        : { entries: [] };
    const run: AgentRun = {
      runId: `${agentId}-${String(current.runs.length + 1).padStart(2, "0")}`,
      date: "25 Aug 2026",
      entries: content.entries,
    };
    current.status = "ready";
    // A run with no entries is not a run. Recording one would render a run
    // header over nothing, which reads as an agent that ran and did zero work
    // rather than one that has not reported yet.
    if (run.entries.length > 0) {
      current.runs = [run, ...current.runs];
    }
    return run;
  }

  async unblock(businessId: string, agentId: string, newStatus: AgentStatus): Promise<void> {
    const current = stateFor(businessId, agentId);
    current.status = newStatus;
    current.blockedReason = undefined;
  }
}

let instance: AgentRepo | null = null;

export function getAgentRepo(): AgentRepo {
  if (!instance) instance = new MockAgentRepo();
  return instance;
}

/**
 * Re-exported so every existing caller is unchanged. The definition — and the
 * labels, and the breakdown Overview needs — now live in `agent-status.ts`,
 * because three screens were each counting this their own way and disagreeing
 * on the same account.
 */
export { agentsNeedingAttention } from "./agent-status";

