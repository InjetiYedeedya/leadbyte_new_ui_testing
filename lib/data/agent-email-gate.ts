/**
 * Which agents cannot run until the account has connected a mailbox.
 *
 * ## Why these two
 *
 * Off-Page SEO and Lead Qualification reach out by email — the address is who
 * the outreach is sent as. Starting one of them with no mailbox produces work
 * nobody receives. On-Page SEO was in this list until 2026-09-25; the product
 * rule for it is purchase only (it publishes through a WordPress login its
 * own form asks for).
 *
 * ## Why Google Ads and Meta Ads were removed (2026-09-08)
 *
 * They were in this list and should not have been. Connecting an ads platform
 * is an OAuth login and nothing else: the agent restructures campaigns inside
 * Google Ads and Meta, where the work lands in the ad account itself, not in
 * anybody's inbox. Requiring a mailbox first blocked a customer who had
 * finished the only step there is — the screen said "Google Ads needs a
 * connected mailbox" to someone who had just connected Google Ads.
 *
 * LinkedIn Ads was never in this list, for the same reason, and stays out.
 *
 * ## Why this is a module and not a check inside each action
 *
 * The same rule is enforced in two places — the Server Action, which is the
 * real gate, and the form, which explains it before someone fills in fifteen
 * fields. A UI-only block is bypassable; a server-only block is a wasted five
 * minutes. One list, so the two can never disagree about which agents are
 * gated.
 *
 * Client-safe: a list of ids and a sentence, no cookie reads. The popups
 * import it directly.
 */

// On-Page SEO left on 2026-09-25: it publishes through the WordPress login
// its own form asks for, and the product rule for it is purchase only.
const GATED = new Set(["off-page-seo", "lead-qualification"]);

/** True when this agent needs a connected mailbox before it can run. */
export function requiresConnectedEmail(agentId: string): boolean {
  return GATED.has(agentId);
}

/** The gated agents, for a screen that wants to mark them all at once. */
export function emailGatedAgents(): readonly string[] {
  return [...GATED];
}

/**
 * What to tell someone who has not connected one.
 *
 * Names the thing to do and where, because "email not connected" alone leaves
 * the reader hunting through Connections for which of eight cards it means.
 */
export const EMAIL_GATE_MESSAGE =
  "Connect your email first — this agent reports back and sends from your mailbox. " +
  "You can connect it on the Connections page.";
