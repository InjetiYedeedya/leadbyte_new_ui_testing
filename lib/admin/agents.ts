import { AGENT_PLANS, resolveAgentId } from "@/lib/entitlements";

/**
 * Display names for the agent ids stored on user records and orders.
 *
 * The ids themselves come from `AGENT_PLANS` — the list entitlements resolve
 * against — so a grant written from the admin panel is always one the rest of
 * the app will honour. Only the words shown on screen live here.
 */
const LABELS: Readonly<Record<string, string>> = {
  "lead-qualification": "Lead Qualification",
  "meta-ads": "Meta Ads",
  "google-ads": "Google Ads",
  "linkedin-ads": "LinkedIn Ads",
  "openai-ads": "OpenAI Ads",
  "social-media": "Social Media",
  "on-page-seo": "On-Page SEO",
  "off-page-seo": "Off-Page SEO",
  podcast: "Podcast",
  custom: "Custom AI",
};

/** Every agent that can be granted, in the order the grant form lists them. */
export const GRANTABLE_AGENTS: readonly { id: string; label: string }[] = AGENT_PLANS.map(
  (plan) => ({ id: plan.id, label: LABELS[plan.id] ?? plan.id }),
);

/**
 * The name to show for a stored agent value — an id or a legacy title.
 *
 * Something unrecognised is shown as it was stored rather than dropped: on an
 * admin screen, "this row holds a value we do not know" is itself worth seeing.
 */
export function agentLabel(value: unknown): string {
  const id = resolveAgentId(value);
  if (id !== null) return LABELS[id] ?? id;
  return typeof value === "string" ? value.trim() : "";
}
