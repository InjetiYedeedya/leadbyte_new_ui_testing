import type { OAuthStatus } from "@/lib/api/oauth-status";

/**
 * Whether to ask for ad accounts on the strategy screen.
 *
 * The strategy agent plans paid acquisition. Without Google Ads and Meta Ads it
 * is planning blind — it cannot see what a click costs, which campaigns already
 * convert, or what the customer is currently spending.
 *
 * ## The rule, as of 2026-09-03
 *
 * Arriving at the strategy screen with an ad platform unconnected raises the
 * ask. Every visit, until it is connected — there is no "asked once" state and
 * no remembered dismissal.
 *
 * That is deliberate and it was a decision, not a default: an earlier version
 * asked only before the first message and remembered a "not now" for a year,
 * which meant that in practice almost nobody saw it twice, and anyone who had
 * dismissed it once could never find it again. The cost of this version is
 * real — someone who genuinely does not run ads gets the same modal on every
 * visit — and it is the trade that was chosen.
 *
 * `gate` is the second half of the rule: before the first message the ask
 * stands IN FRONT of starting, because a plan built without ad data is the
 * thing being prevented. Once a conversation exists there is nothing left to
 * gate, so the ask is only an offer and closing it costs nothing.
 */

export interface AdsPromptInput {
  /** True once the conversation has any turns. */
  started: boolean;
  googleAds: OAuthStatus;
  metaAds: OAuthStatus;
}

export interface AdsPromptDecision {
  /** Open the ask on arrival. */
  show: boolean;
  /** Which platforms are still missing, for the copy. */
  missing: ("googleAds" | "metaAds")[];
  /**
   * Whether the ask also blocks starting. True only before the first message —
   * dismissing it there must not leave a working start button behind, which is
   * how the ask used to be skippable without answering it.
   */
  gate: boolean;
}

/**
 * `error` counts as connected for this purpose.
 *
 * A status check that could not reach the backend must not produce a modal
 * telling someone to connect an account they may already have. Nagging on the
 * strength of a failed lookup is worse than staying quiet: the customer cannot
 * tell our outage from their missing connection.
 */
function needsConnecting(status: OAuthStatus): boolean {
  return status === "not-connected" || status === "expired" || status === "pending";
}

export function adsPromptDecision(input: AdsPromptInput): AdsPromptDecision {
  const missing: ("googleAds" | "metaAds")[] = [];
  if (needsConnecting(input.googleAds)) missing.push("googleAds");
  if (needsConnecting(input.metaAds)) missing.push("metaAds");

  return {
    show: missing.length > 0,
    missing,
    gate: missing.length > 0 && !input.started,
  };
}
