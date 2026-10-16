/**
 * The public pricing page's catalog and price math.
 *
 * ## Why per-agent, not tiered
 *
 * There were two candidate models to build against: the live production
 * site's per-agent pricing ($10/month each, via Stripe) and a tiered
 * ₹0/₹4,999/₹14,999 design that used to be mocked in this app and was deleted
 * (`app/(app)/upgrade`, removed 2026-09-04). `docs/superpowers/specs/
 * 2026-08-26-backend-integration-map.md` flags the two as a genuine, unresolved
 * conflict — the tiered model would need a tier→agent mapping, and
 * `lib/entitlements/index.ts`'s `TIER_AGENTS` is deliberately left empty
 * because guessing that mapping is explicitly called out as risky in both
 * directions. Per-agent needs no such guess: it is what the backend already
 * charges, today, for real.
 *
 * ## Why the ids matter more than they look like they should
 *
 * Every id here MUST be one already declared in `lib/entitlements/agents.ts`'s
 * `AGENT_PLANS` — checked by a test in `pricing-catalog.test.ts`, not just by
 * convention. Nothing wires this catalog to the entitlement engine yet (there
 * is no real purchase flow), but the day one exists, a mismatched id here
 * would be the same "typo in stored data silently loses an entitlement" bug
 * that engine's own `resolveAgentId()` was written to prevent.
 *
 * ## Why "custom" has no price
 *
 * It is the one row this catalog cannot quote — "Custom Pricing" is a
 * conversation, not a number. `monthlyPrice: null` (rather than `0`, which
 * would silently be free) is what keeps it out of every total in this file:
 * every summing function filters on it explicitly.
 */

export type BillingPeriod = "monthly" | "yearly";

export interface PricingAgent {
  id: string;
  title: string;
  /** Sentence case, shown as a small tag — "Popular", "New", not "POPULAR". */
  tag: string;
  description: string;
  features: string[];
  /** Null only for the one row with no fixed price ("custom"). */
  monthlyPrice: number | null;
  /** The struck-through reference price shown beside the real one. */
  wasPrice: number | null;
  isCustom: boolean;
}

/**
 * The yearly discount, as the BACKEND applies it — which is what matters,
 * because the backend works the charge out itself. It rounds the discounted
 * monthly rate to a whole dollar BEFORE multiplying by twelve
 * (`round(price × 0.85) × 12`, PAYMENT_FLOW.md §4 step 3), so a $10/mo agent
 * is $9 × 12 = $108/yr, saving $12 — not the $102 this page used to show.
 * Showing $102 and charging $108 is the one mistake a price page cannot make,
 * so the page follows the backend's rounding, and the toggle no longer claims
 * "save 15%": after rounding, it is not 15%.
 */
export const YEARLY_DISCOUNT = 0.15;

export const PRICING_AGENTS: PricingAgent[] = [
  {
    id: "lead-qualification",
    title: "Lead Qualification Agent",
    tag: "High conversion",
    description: "Scores every inbound lead and routes the ones worth a reply first.",
    features: [
      "AI lead scoring",
      "Filters qualifying conversations",
      "Auto cold-email outreach",
      "Follow-up reminders",
      "Lead-form performance stats",
    ],
    monthlyPrice: 10,
    wasPrice: 100,
    isCustom: false,
  },
  {
    id: "meta-ads",
    title: "AI Automation for Meta Ads",
    tag: "Popular",
    description: "Runs and tunes Meta campaigns for personal and business accounts alike.",
    features: [
      "Campaign & asset set parameters",
      "Audience discovery & targeting",
      "Creative and copy suggestions",
      "Budget & bid control",
      "Performance monitoring & alerts",
      "CPA & conversion improvements",
      "Weekly reports",
    ],
    monthlyPrice: 10,
    wasPrice: 100,
    isCustom: false,
  },
  {
    id: "google-ads",
    title: "AI Automation for Google Ads",
    tag: "Popular",
    description: "Builds, tunes and reports on Google Ads campaigns end to end.",
    features: [
      "AI-driven campaign & ad group setup",
      "Keyword discovery & organization",
      "Ad copy building & budget optimization",
      "Conversion & quality-score tracking",
      "Monitoring & alerts",
      "Weekly reports",
    ],
    monthlyPrice: 10,
    wasPrice: 100,
    isCustom: false,
  },
  {
    id: "linkedin-ads",
    title: "AI Automation for LinkedIn Ads",
    tag: "New",
    description: "Sets up and manages LinkedIn campaigns for B2B reach.",
    features: [
      "Campaign & ad group setup",
      "Audience discovery & targeting",
      "Ad copy building & budget optimization",
      "Conversion & performance tracking",
      "Monitoring & alerts",
      "Weekly reports",
    ],
    monthlyPrice: 10,
    wasPrice: 100,
    isCustom: false,
  },
  {
    id: "openai-ads",
    title: "AI Automation for OpenAI Ads",
    tag: "New",
    description: "Plans and launches campaigns on OpenAI's ad surfaces, budget-aware from the start.",
    features: [
      "Campaign & budget setup",
      "Currency-aware bidding",
      "Draft review before anything launches",
      "Performance monitoring & alerts",
    ],
    monthlyPrice: 10,
    wasPrice: 100,
    isCustom: false,
  },
  {
    id: "social-media",
    title: "AI Social Media Agent",
    tag: "Popular",
    description: "Drafts, schedules and publishes posts in your brand's own voice.",
    features: [
      "Trending hashtag & topic discovery",
      "AI post & caption generation",
      "Auto scheduling",
      "Multi-platform publishing",
      "Post-frequency planning",
    ],
    monthlyPrice: 10,
    wasPrice: 100,
    isCustom: false,
  },
  {
    id: "on-page-seo",
    title: "On-Page SEO Agent",
    tag: "Traffic builder",
    description: "Rewrites metadata and fixes on-page issues on your highest-traffic pages.",
    features: [
      "Competitive analysis",
      "Keyword research & gap detection",
      "AI-generated blog text",
      "Internal linking plan",
      "Meta title & description rewrites",
      "Readability improvements",
    ],
    monthlyPrice: 10,
    wasPrice: 100,
    isCustom: false,
  },
  {
    id: "off-page-seo",
    title: "Off-Page SEO Agent",
    tag: "Authority builder",
    description: "Finds backlink opportunities and tracks your domain's authority over time.",
    features: [
      "Backlink opportunity discovery",
      "Competitor analysis",
      "Anchor-text strategy",
      "Domain rating tracking",
      "Outreach suggestions",
      "Monthly authority report",
    ],
    monthlyPrice: 10,
    wasPrice: 100,
    isCustom: false,
  },
  {
    id: "aeo",
    title: "AEO Agent",
    tag: "New",
    description: "Audits how AI answer engines read your site, then writes the fixes to raise your score.",
    features: [
      "AI answer-engine readability score",
      "Page-by-page audit",
      "Ready-to-use fixes",
      "GitHub pull request or copy-paste delivery",
      "Downloadable full report",
    ],
    monthlyPrice: 10,
    wasPrice: 100,
    isCustom: false,
  },
  {
    id: "podcast",
    title: "AI Podcast Agent",
    tag: "Content multiplier",
    description: "Turns one recording into transcripts, summaries and posts across formats.",
    features: [
      "Audio & blog-based production",
      "Auto transcripts",
      "Episode summaries",
      "Title & description writing",
      "Multi-format repurposing",
    ],
    monthlyPrice: 10,
    wasPrice: 100,
    isCustom: false,
  },
  {
    id: "custom",
    title: "Custom AI",
    tag: "Premium",
    description: "A workflow built around what you actually need, not a fixed catalog.",
    features: [
      "Tailored automations",
      "Cross-platform workflows",
      "API integrations",
      "Dedicated strategist",
      "Priority support",
    ],
    monthlyPrice: null,
    wasPrice: null,
    isCustom: true,
  },
];

/** `$10` for a whole number, `$8.50` for one that isn't — used everywhere a
    price from this catalog reaches the screen, so a rounding change here is
    the only place it needs making. */
export function formatPrice(value: number): string {
  return value % 1 === 0 ? `$${value}` : `$${value.toFixed(2)}`;
}

export function findAgent(id: string): PricingAgent | undefined {
  return PRICING_AGENTS.find((agent) => agent.id === id);
}

/**
 * What one agent costs for the period actually being billed — one month, or
 * twelve months at the yearly-discounted rate. Null passes straight through:
 * "custom" has no number to discount.
 */
export function billedPrice(agent: PricingAgent, period: BillingPeriod): number | null {
  if (agent.monthlyPrice === null) return null;
  if (period === "monthly") return agent.monthlyPrice;
  return Math.round(agent.monthlyPrice * (1 - YEARLY_DISCOUNT)) * 12;
}

/**
 * Sums `billedPrice` over a selection. Unknown ids are dropped rather than
 * thrown on — the same "resolve or drop, never guess" idiom
 * `resolveAgentId()` uses — and "custom" is excluded because its price is
 * null, not because it is special-cased by id: this is what actually makes
 * it impossible for a "Custom Pricing" row to be added into a number.
 */
export function totalForSelection(agentIds: readonly string[], period: BillingPeriod): number {
  return agentIds.reduce((sum, id) => {
    const agent = findAgent(id);
    if (!agent) return sum;
    const price = billedPrice(agent, period);
    return price === null ? sum : sum + price;
  }, 0);
}

/**
 * How much a selection saves by choosing yearly over paying that same
 * selection monthly for twelve months. Always the monthly total's headline
 * number, not the yearly one — "$18/yr" reads as a saving; "you paid $102"
 * does not.
 */
export function yearlySavingsForSelection(agentIds: readonly string[]): number {
  const monthlyOverYear = totalForSelection(agentIds, "monthly") * 12;
  const yearly = totalForSelection(agentIds, "yearly");
  return Math.round((monthlyOverYear - yearly) * 100) / 100;
}
