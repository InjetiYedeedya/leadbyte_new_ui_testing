/**
 * Canonical agent identifiers, and the legacy titles they used to be stored as.
 *
 * PORTED from the live app's `src/services/purchaseService.js` (2026-08-28).
 *
 * Why the titles matter: orders and `subscribed_agents[]` in production contain
 * BOTH formats. Older rows hold display titles ("AI Automation for Meta Ads");
 * newer ones hold ids ("meta-ads"). Reading only ids silently locks long-standing
 * customers out of agents they have paid for — which is the single most damaging
 * bug available on cutover day.
 */

export interface AgentPlan {
  id: string;
  /** Legacy stored value. Kept for resolution, not for display. */
  legacyTitle: string;
}

export const AGENT_PLANS: AgentPlan[] = [
  { id: "lead-qualification", legacyTitle: "Lead Qualification Agent" },
  { id: "meta-ads", legacyTitle: "AI Automation for Meta Ads" },
  { id: "google-ads", legacyTitle: "AI Automation for Google Ads" },
  { id: "linkedin-ads", legacyTitle: "AI Automation for LinkedIn Ads" },
  // New in the v1 app, so no production order or `subscribed_agents[]` row
  // holds a display title for it. The legacy title follows the three above so
  // resolution still works if one is ever written; it is not evidence that any
  // exists.
  { id: "openai-ads", legacyTitle: "AI Automation for OpenAI Ads" },
  { id: "social-media", legacyTitle: "AI Social Media Agent" },
  { id: "on-page-seo", legacyTitle: "On-Page SEO Agent" },
  { id: "off-page-seo", legacyTitle: "Off-Page SEO Agent" },
  { id: "podcast", legacyTitle: "AI Podcast Agent" },
  // Sold from 2026-09-25. New in v1, so no stored legacy title exists for it.
  { id: "aeo", legacyTitle: "AEO Agent" },
  { id: "custom", legacyTitle: "Custom AI" },
];

export const ALL_AGENT_IDS: string[] = AGENT_PLANS.map((p) => p.id);

/**
 * Resolves a stored value — id or legacy title — to a canonical id.
 * Returns null for anything unrecognised rather than passing it through, so a
 * typo in the data cannot silently become an entitlement.
 */
export function resolveAgentId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const byId = AGENT_PLANS.find((p) => p.id === trimmed);
  if (byId) return byId.id;

  const byTitle = AGENT_PLANS.find(
    (p) => p.legacyTitle.toLowerCase() === trimmed.toLowerCase(),
  );
  return byTitle ? byTitle.id : null;
}
