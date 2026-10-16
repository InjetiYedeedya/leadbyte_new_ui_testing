/**
 * Which steps a campaign flow has, as plain data.
 *
 * ## Why this is not in `components/agents/campaign-steps.tsx`
 *
 * That file is `"use client"`, which makes every one of its exports a client
 * reference — not just the component. A Server Component importing the list
 * gets a stub, and calling a helper from one throws outright: *"Attempted to
 * call adsApiSteps() from the server but adsApiSteps is on the client."*
 * Measured 2026-09-15, when the plan page asked which steps to draw.
 *
 * So the data and the pure helper live here, where both sides can read them,
 * and the component that renders them stays a client island because its sliding
 * pill needs layout animation.
 */

export interface CampaignStep {
  id: string;
  label: string;
}

/** The four the n8n ad agents share — Google, Meta and LinkedIn. */
export const CAMPAIGN_STEPS = [
  { id: "setup", label: "Campaign" },
  { id: "plan", label: "Plan" },
  { id: "details", label: "Details" },
  { id: "creative", label: "Creative" },
] as const;

/**
 * The ChatGPT Ads flow's own steps.
 *
 * A second list rather than an edit to the one above: adding "Copy" and "Image"
 * to the shared four would put them in Google's and Meta's strips, where
 * neither step exists.
 */
export const ADS_API_STEPS = [
  { id: "connect", label: "Connect" },
  { id: "campaign", label: "Campaign" },
  { id: "plan", label: "Plan" },
  { id: "copy", label: "Copy" },
  { id: "image", label: "Image" },
  { id: "review", label: "Review" },
] as const;

/**
 * Google's and Meta's order since 2026-10-06 (product owner): the automation
 * mode is asked AFTER the campaign details, not in a dialog on the plan. So
 * their strip has its own step for it, between Details and Creative.
 * LinkedIn keeps the four above — its semi flow collects creative on the
 * details form, so its mode still has to be known before that form.
 */
export const MODE_LAST_STEPS = [
  { id: "setup", label: "Campaign" },
  { id: "plan", label: "Plan" },
  { id: "details", label: "Details" },
  { id: "mode", label: "Automation" },
  { id: "creative", label: "Creative" },
] as const;

/**
 * A Meta Engagement campaign that promotes an existing post (LBS-1253): no
 * automation mode and no creative to make, so the details are the last step.
 */
export const EXISTING_POST_STEPS = [
  { id: "setup", label: "Campaign" },
  { id: "plan", label: "Plan" },
  { id: "details", label: "Details" },
] as const;

export type CampaignStepId =
  | (typeof CAMPAIGN_STEPS)[number]["id"]
  | (typeof MODE_LAST_STEPS)[number]["id"]
  | (typeof ADS_API_STEPS)[number]["id"];

/**
 * Agents that ask Full or Semi after the details form (see `MODE_LAST_STEPS`).
 * LinkedIn joined Google and Meta on 2026-10-08 — one order for all three —
 * once its semi creative moved from the details form to the automation step
 * (`linkedin-semi-media.ts`).
 */
export function modeLast(agentId: string): boolean {
  return agentId === "google-ads" || agentId === "meta-ads" || agentId === "linkedin-ads";
}

/**
 * Whether this campaign actually asks Full or Semi.
 *
 * Not when the agent said semi is unavailable (`semiAllowed: false` — an
 * Engagement campaign, for one): the page offered one live choice and one
 * greyed out, which is a click, not a question (2026-10-07). Those campaigns
 * are full automation, and the details form's submit asks the delivery-mode
 * question the step would have. `undefined` — not known yet — keeps the step.
 */
export function asksMode(agentId: string, semiAllowed: false | undefined, existingPost = ""): boolean {
  // Promoting a post that already exists: there is no ad to make, by the
  // agent or by the customer, so Full or Semi is not a question (LBS-1253).
  return modeLast(agentId) && semiAllowed !== false && existingPost === "";
}

/** The steps an n8n ad agent's strip shows. */
export function campaignStepsFor(
  agentId: string,
  semiAllowed?: false,
  existingPost = "",
): readonly CampaignStep[] {
  if (existingPost !== "") return EXISTING_POST_STEPS;
  return asksMode(agentId, semiAllowed) ? MODE_LAST_STEPS : CAMPAIGN_STEPS;
}

/**
 * The steps that actually apply, given who is making the picture.
 *
 * Semi automation supplies its own image, so Image is not one of its steps at
 * all. Showing it anyway mis-states how many steps are left, which is the one
 * thing the strip exists to say.
 */
export function adsApiSteps(adType: "full" | "semi" | undefined): readonly CampaignStep[] {
  return adType === "full" ? ADS_API_STEPS : ADS_API_STEPS.filter((step) => step.id !== "image");
}
