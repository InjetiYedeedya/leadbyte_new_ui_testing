import { buildChatPayload, type CampaignField } from "@/lib/data/ads-chat-payload";

/**
 * The body "Revise suggestion" and "I have a suggestion" send.
 *
 * Both used to send only the ids and the action, and the customer's own words
 * went out AS `chatInput` — replacing the brief. The legacy flow, which is the
 * contract n8n was built against (META_ADS_AGENT_SPEC §9.1), sends the same
 * base body as Get Suggestion every time: the setup summary as `chatInput`,
 * the campaign as `campaign_data`, and the turn's own fields beside them. n8n's
 * branches read the body in front of them rather than the session, so a turn
 * without the campaign reached a node with nothing to rethink.
 *
 * ## Several names for the customer's text
 *
 * Meta's page sent it as `suggestion`; Google's as `user_suggestion` with the
 * plan being changed as `previous_suggestion` (spec §9.1, note). Both are sent,
 * for every platform, for the reason this codebase sends every fact under each
 * spelling a branch reads: send only the tidiest and some node gets nothing.
 */
export interface ReviseContext {
  kind: "revise" | "suggestion";
  /** The sentence the setup form opened its prompt with. */
  intro: string;
  /** The page-one campaign, by our own labels — the frozen brief. */
  fields: readonly CampaignField[];
  email: string;
  userId?: string;
  /** The conversation's id — the same one every turn has used. */
  sessionId: string;
  /** What the agent understood the setup to be, by ITS labels. */
  userDetails: Record<string, string>;
  /** The plan on screen now, which this turn asks the agent to change. */
  previousPlan: string;
  /** The customer's words. Only for `kind: "suggestion"`. */
  suggestion?: string;
}

export function buildRevisePayload({
  kind,
  intro,
  fields,
  email,
  userId,
  sessionId,
  userDetails,
  previousPlan,
  suggestion,
}: ReviseContext): Record<string, unknown> {
  const text = (suggestion ?? "").trim();
  return buildChatPayload({
    intro,
    fields,
    email,
    userId,
    sessionId,
    actionType: kind === "revise" ? "revise" : "user_suggestion",
    extras: {
      user_decision: kind,
      ...(Object.keys(userDetails).length > 0 ? { user_details: userDetails } : {}),
      // The plan being changed, on BOTH turns — the Google spec sends it on a
      // plain revise too (GA §9.1).
      previous_suggestion: previousPlan,
      ...(kind === "suggestion" ? { suggestion: text, user_suggestion: text } : {}),
    },
  });
}
