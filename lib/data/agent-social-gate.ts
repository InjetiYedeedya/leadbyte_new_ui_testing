/**
 * Which agents cannot run until the account has connected a social platform.
 *
 * ## Why the Social Media agent is gated
 *
 * It drafts and schedules posts, and a post needs somewhere to go. Activating
 * it with no Facebook, Instagram or YouTube account connected produces drafts
 * that cannot be published — the same shape of failure the email gate exists
 * for, where the work is done and nobody receives it.
 *
 * Until 2026-09-11 the agent had no gate at all and its Activate button only
 * flipped a badge in process memory: no webhook, no table write, and the
 * activity list still read "Never run yet." So there was nothing for a
 * connection to be required *by*.
 *
 * ## Why the ad agents are not gated on this
 *
 * Meta Ads reaches Facebook and Instagram through an ad account, not a page
 * login — a different OAuth grant and a different table. Requiring a social
 * connection to run Meta Ads would block someone who has finished the only
 * step there is, which is the mistake the email gate made with Google Ads and
 * had to be corrected for (see `agent-email-gate.ts`).
 *
 * ## Why this is a module and not a check inside the action
 *
 * The same rule is enforced twice — in the Server Action, which is the real
 * gate, and on the page, which explains it instead of showing a button that
 * will refuse. One list, so the two cannot disagree.
 *
 * Client-safe: ids and a sentence, no cookie reads and no API imports. The
 * page and the action both import it directly.
 */

import type { OAuthPlatform } from "@/lib/api/oauth-status";

const GATED = new Set(["social-media"]);

/**
 * The platforms that satisfy the gate.
 *
 * Any ONE of them is enough: an account that posts only to YouTube is a
 * legitimate setup, and demanding all three would block it.
 */
export const SOCIAL_PLATFORMS: readonly OAuthPlatform[] = ["facebook", "instagram", "youtube"];

/** True when this agent needs a connected social account before it can run. */
export function requiresSocialConnection(agentId: string): boolean {
  return GATED.has(agentId);
}

/**
 * What to tell someone who has not connected one.
 *
 * Names the platforms and the page, because "no social account connected"
 * leaves the reader hunting through Connections for which of eight cards it
 * means — the same reason `EMAIL_GATE_MESSAGE` spells it out.
 */
export const SOCIAL_GATE_MESSAGE =
  "Connect a social account first — this agent schedules posts, and it needs somewhere to " +
  "publish them. Connect Facebook, Instagram or YouTube on the Connections page.";
