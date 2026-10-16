import { buildChatPayload, type CampaignField } from "@/lib/data/ads-chat-payload";
import { businessDetailsOf } from "@/lib/data/ads-launch-payload";
import type { SemiAutomationMedia } from "@/lib/data/meta-semi-media";
import type { GoogleSemiAutomationMedia } from "@/lib/data/ads-creatives";
import type { BusinessProfile } from "@/lib/data/types";

/**
 * The body "Yes, proceed" sends.
 *
 * Taken from a live `metaads` execution (2026-09-04). It goes to the SAME chat
 * webhook the setup form posted to, not to the semi endpoint — the approval is
 * the next turn of one conversation, and the workflow triggers the campaign
 * executor downstream itself.
 *
 * ## What it repeats, and why that is not redundant
 *
 * The whole page-one campaign goes out again, twice over: as `chatInput` prose
 * and as the `campaign_data` object. The agent has been told all of it once
 * already, but n8n's branches read from the body in front of them rather than
 * from the session, so an approval carrying only "approved" arrives at a node
 * that has no campaign to act on.
 *
 * `chatInput` is the SETUP SUMMARY, not the plan the agent wrote back. That is
 * the observed contract and it reads oddly the first time: the plan is what the
 * customer approved, so sending it feels right. The flow does not want it — it
 * wants the same brief it was given, with the decision attached.
 *
 * ## Three names for one decision
 *
 * `action_type: "approved"`, `user_decision: "approved"` and `automationMode`
 * all say what happened, and different nodes read different ones. Sending only
 * the tidiest of the three leaves a branch believing nothing was decided.
 *
 * `selectionMode` is `null` here — explicitly, not by omission. The receiver's
 * own payload sends `"ask"`; on this hop the observed value is null, and a
 * missing key is a different message to a null one.
 */
export interface ApproveContext {
  /** The sentence the setup form opened its prompt with. */
  intro: string;
  /** The page-one campaign, by our own labels. */
  fields: readonly CampaignField[];
  email: string;
  /** The Firebase uid. Omitted from the body when the session predates it. */
  userId?: string;
  /** The conversation's id — the same one every turn has used. */
  sessionId: string;
  /**
   * `null` for Google and Meta (2026-10-06): they approve BEFORE the customer
   * chooses Full or Semi — this hop only fetches the details questions — and
   * the choice rides the launch instead. Sent as an explicit null, not left
   * out: a missing key and a null are different messages to n8n.
   */
  automationMode: "full" | "semi" | null;
  /** What the agent understood the setup to be, by ITS labels. */
  userDetails: Record<string, string>;
  profile: BusinessProfile | null;
  /**
   * Meta semi only: the creative the customer uploaded before approving. It
   * rides THIS hop as well as the launch, because the captured body carries it
   * here — the workflow answering with the details form has to know the ad
   * already has its asset.
   */
  semiAutomationMedia?: SemiAutomationMedia | GoogleSemiAutomationMedia;
}

export function buildApprovePayload({
  intro,
  fields,
  email,
  userId,
  sessionId,
  automationMode,
  userDetails,
  profile,
  semiAutomationMedia,
}: ApproveContext): Record<string, unknown> {
  return buildChatPayload({
    intro,
    fields,
    email,
    userId,
    sessionId,
    actionType: "approved",
    extras: {
      user_decision: "approved",
      automationMode,
      selectionMode: null,
      business_details: businessDetailsOf(profile, email),
      // Our labels and the agent's are NOT interchangeable: `campaign_data`
      // holds "Budget display", `user_details` holds `budget_type`. Sending one
      // in place of the other leaves whichever node reads the missing spelling
      // with nothing.
      user_details: userDetails,
      ...(semiAutomationMedia === undefined ? {} : { semiAutomationMedia }),
    },
  });
}
