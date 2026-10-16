import type { BusinessProfile } from "@/lib/data/types";
import { absoluteUrl } from "@/lib/data/profile-display";

/**
 * The body the campaign executor actually expects.
 *
 * Taken from a live `adsreceiver` execution (2026-09-04). It is much larger
 * than the chat payload and much less tidy, and the untidiness is the contract:
 *
 * - **The same facts appear under several names.** `email` AND `email_address`,
 *   `userId` AND `user_id`, `sessionId` AND `session_id`,
 *   `businessDetails` AND `business_details`, `requirements` AND
 *   `aiSuggestion`. Different nodes in the n8n flow read different ones; send
 *   only your favourite spelling and some branch silently gets nothing.
 * - **`campaignFormData` is the merged view** — the campaign the agent planned,
 *   PLUS every answer from the details form, PLUS a nested copy of the business
 *   details. `user_details` is the planned campaign alone, unmerged.
 * - **Two flags are constants** in every observed run: `user_decision:
 *   "approved"` and `audienceType: "new"`. `selectionMode` was a third until
 *   the customer was given the choice on the details form — it defaults to
 *   `"ask"` here, which is the value every launch sent before then, so an
 *   omitted answer cannot change what an existing campaign does.
 *
 * ## The chosen creative prompt
 *
 * `selected_prompt`, `selected_prompt_index`, `selected_prompt_model` and
 * `prompt_job_id` come from the 3-model creative pipeline
 * (`lib/data/creative-prompts.ts`). They are included ONLY when the customer
 * actually picked one, and omitted entirely otherwise — an empty prompt is a
 * value the flow may act on, an absent one is plainly nothing. Every campaign
 * launched before that pipeline was wired went out without them, so absent is
 * a shape the flow already handles.
 *
 * `selected_prompt_index` is the pipeline's own index, not a position in our
 * list: see the note in `creative-prompts.ts`.
 */

import type { CampaignField } from "./ads-chat-payload";
import type { SemiAutomationMedia } from "./meta-semi-media";
import type { GoogleSemiAutomationMedia } from "@/lib/data/ads-creatives";
import type { SelectionMode } from "./selection-mode";

export interface LaunchContext {
  email: string;
  userId?: string;
  sessionId: string;
  /** The agent's written plan, verbatim. */
  plan: string;
  /** The campaign as the agent understood it, by its own labels. */
  userDetails: Record<string, string>;
  /**
   * The SETUP campaign, under the labels the setup form used.
   *
   * Needed because `userDetails` is the agent's own echo and it is routinely
   * near-empty — the captured receiver body shows `user_details` as
   * `{ business_name: "", interests: [], … }` while its `campaignFormData`
   * carries the full "Business name" / "Interests and behaviors" /
   * "Selected interests" / "Other interest (optional)" set. Those come from
   * the setup form, not from the agent, and merging only `userDetails` left
   * every one of them out of the launch.
   */
  campaign?: readonly CampaignField[];
  /** The answers to the campaign-details form, by the agent's labels. */
  formData: Record<string, string>;
  /** Uploaded creative, when the customer supplied it. */
  creatives?: Record<string, string>;
  /**
   * Meta Ads semi only: the customer's own image/video/carousel, already in S3.
   * Rides the payload at the top level AND inside `campaignFormData`, matching
   * the legacy body — different n8n branches read one or the other.
   */
  semiAutomationMedia?: SemiAutomationMedia | GoogleSemiAutomationMedia;
  /**
   * LinkedIn Ads semi only: the uploaded creative as `{ images: [...] }`, the
   * shape its workflow reads (LINKEDIN_ADS_FLOW.md 6.2). Top level AND inside
   * `campaignFormData`, the same double placement `semiAutomationMedia` has.
   */
  mediaAssets?: { images: string[]; videoUrl?: string };
  automationMode: "full" | "semi";
  /**
   * The customer's answer from the details form. Defaults to `"ask"` — the old
   * constant — when the campaign predates the question or the value could not
   * be read.
   */
  selectionMode?: SelectionMode;
  /**
   * The placements this platform buys, as `businessInfo.platforms`. Meta sends
   * "Facebook Ads, Instagram Ads"; the others send nothing, so it is omitted
   * rather than blank.
   */
  platforms?: string;
  profile: BusinessProfile | null;
  /**
   * The setup's structured answers (`Suggestion.launchExtras`): audience type
   * and audiences, lead form id, `locationData`, `budget_amount` and
   * `budget_currency`. Top level, where the legacy body carried them.
   */
  extras?: Record<string, unknown>;
  /** The creative prompt the customer chose, when they were offered a choice. */
  selectedPrompt?: {
    jobId: string;
    index: number;
    model: string;
    prompt: string;
  };
}

/**
 * The place the campaign targets, read from the details form first.
 *
 * `businessInfo` used to take these from the agent's PLAN alone, which never
 * carries them — every observed run went out with `location: "Not provided"`.
 * The cascade on the details form is where the customer actually names the
 * place, so those answers win, and the plan stays the fallback.
 *
 * The keys are found by suffix rather than by a fixed label, because the label
 * is the agent's: Google calls it "Location Type", and an agent that renames
 * it tomorrow should keep working.
 */
function locationOf(
  formData: Record<string, string>,
  userDetails: Record<string, string>,
  setup: Record<string, string> = {},
): Record<"location" | "country" | "state" | "city", string> {
  const bySuffix = (suffix: string) =>
    Object.entries(formData).find(([key]) => key.endsWith(`_${suffix}`))?.[1] ?? "";

  // The display string the expansion built: "Newark, New Jersey, United States".
  const display =
    Object.entries(formData).find(([key, value]) => key.endsWith("Location Type") && value)?.[1] ??
    "";

  // The setup form's own answers are the last resort before "Not provided".
  // LinkedIn asks City / State / Country on page one and its agent does not
  // echo them back, so without this every LinkedIn launch said "Not provided"
  // for a place the customer had typed.
  const city = bySuffix("city") || userDetails["City"] || setup["City"] || "";
  const state = bySuffix("state") || userDetails["State"] || setup["State"] || "";
  const country = bySuffix("country") || userDetails["Country"] || setup["Country"] || "";
  const composed = [city, state, country].filter((part) => part !== "").join(" > ");

  return {
    location: display || userDetails["Location"] || setup["Location"] || composed || "Not provided",
    country: country || "Not provided",
    state: state || "Not provided",
    city: city || "Not provided",
  };
}

/**
 * The block the flow reads business identity from, under three names.
 *
 * Exported because the approve hop sends it too, under `business_details` —
 * one mapping, so the receiver and the chat webhook cannot describe the same
 * business differently.
 */
export function businessDetailsOf(profile: BusinessProfile | null, email: string) {
  return {
    companyName: profile?.businessName ?? "",
    // WITH its scheme (2026-10-02). The n8n owner confirmed the ad workflows
    // do not add `https://` themselves, so a bare host ("leadbyte.ai") reached
    // them as-is. `absoluteUrl` adds it only when missing, so a stored
    // `https://…` is never doubled, and drops anything that is not a web link.
    // (An earlier attempt, 2026-09-30, was reverted on a suspicion that the
    // workflow prefixed it — now ruled out.)
    websiteUrl: absoluteUrl(profile?.websiteUrl),
    reportEmail: email,
    businessType: profile?.businessType ?? profile?.industry ?? "",
    businessTypeOther: "",
    specialization: profile?.description ?? "",
    brandLogoUrl: profile?.brand?.logo ?? "",
  };
}

/** `{ key: value }` when there is a value, `{}` when there is not. */
function optional(key: string, value: string): Record<string, string> {
  return value === "" ? {} : { [key]: value };
}

export function buildLaunchPayload(context: LaunchContext): Record<string, unknown> {
  const {
    email,
    userId,
    sessionId,
    plan,
    userDetails,
    campaign,
    formData,
    creatives,
    semiAutomationMedia,
    mediaAssets,
    automationMode,
    selectionMode,
    platforms,
    profile,
  } = context;

  const businessDetails = businessDetailsOf(profile, email);

  // The merged view, in the order the captured body shows: the SETUP campaign
  // first under its own labels, then the agent's own echo, then the details
  // form on top.
  //
  // Form answers win because they are what the customer just typed. The setup
  // is underneath rather than absent — it holds "Interests and behaviors",
  // "Selected interests" and "Other interest (optional)", which the agent
  // does not echo back and which were therefore missing from every launch.
  const campaignFormData: Record<string, unknown> = {
    ...Object.fromEntries(campaign ?? []),
    ...userDetails,
    businessDetails,
    ...formData,
    ...(creatives ?? {}),
    ...(semiAutomationMedia ? { semiAutomationMedia } : {}),
    ...(mediaAssets ? { mediaAssets } : {}),
    // The details-form answers again, boxed under their own key. The captured
    // body carries them BOTH spread across `campaignFormData` and nested here,
    // and different nodes read different ones.
    dynamicFormData: formData,
  };

  /** The first non-empty value among these labels, from the merged campaign. */
  const pick = (...labels: string[]): string => {
    for (const label of labels) {
      const value = campaignFormData[label];
      if (typeof value === "string" && value.trim() !== "") return value;
    }
    return "";
  };

  const payload: Record<string, unknown> = {
    agent_type: undefined, // set by `triggerAgent`, which owns the per-agent value
    email,
    email_address: email,
    userId,
    user_id: userId,
    sessionId,
    session_id: sessionId,

    // Read from the MERGED campaign, not from `userDetails` alone.
    //
    // The agent's echo is routinely near-empty, so every one of these went out
    // blank — the captured working body has `goal: "awareness"`,
    // `audience: "All - all - Business Owners"`, `budget: "$12 / day"` while
    // ours sent `""`. The values live under the SETUP form's labels, which
    // `campaignFormData` already carries. Schedule is tried under both
    // spellings because the setup writes "Schedule start time" and the agent
    // has been seen echoing "…(optional)".
    businessInfo: {
      ...businessDetails,
      ...locationOf(formData, userDetails, Object.fromEntries(campaign ?? [])),
      service: pick("Service or product"),
      offer: pick("Offer value"),
      goal: pick("Ad goal"),
      subGoal: pick("Sub goal") || "Not applicable",
      // "Interests and behaviors" IS the one-line audience: the setup form
      // already composed it as `ages - gender - interests`
      // (`meta-ads-setup.ts`). Re-joining it produced
      // "All - all - All - all - Business Owners", where the captured body has
      // "All - all - Business Owners". The join survives only as the fallback
      // for a campaign that never set the composed field.
      audience:
        pick("Interests and behaviors") ||
        [pick("Age range"), pick("Gender")].filter((part) => part !== "").join(" - "),
      startDate: pick("Campaign start date"),
      endDate: pick("Campaign end date"),
      schedule: `${pick("Schedule start time", "Schedule start time (optional)") || "Any time"} to ${
        pick("Schedule end time", "Schedule end time (optional)") || "Any time"
      }`,
      budget: pick("Budget display"),
      // Meta names the placements it buys; absent for the other platforms.
      ...(platforms === undefined ? {} : { platforms }),
      // LinkedIn's audience is job targeting and its creative has a format.
      // Added only when the campaign carries them, so the Google and Meta
      // bodies keep the exact shape that was captured working.
      // "Targeting details" is today's label (criteria AND their values);
      // "Targeting values" is kept for a plan stored before it. Reading only
      // the old label sent the criteria names with no values (2026-10-08).
      ...optional("targeting", pick("Targeting details", "Targeting values", "Targeting criteria")),
      ...optional("adFormat", pick("Ad format")),
    },

    businessDetails,
    business_details: businessDetails,
    campaignFormData,
    // The details-form answers, also at the top level — see the note on the
    // copy inside `campaignFormData`.
    dynamicFormData: formData,

    // The plan, under both names the flow reads. NOT `chatInput` — the
    // captured receiver body has none, and `chatInput` belongs to the approve
    // hop, where it is the setup summary (see `ads-approve-payload.ts`).
    requirements: plan,
    aiSuggestion: plan,

    action_type: "approved",
    action: "execute_campaign",
    automationMode,
    selectionMode: selectionMode ?? "ask",
    user_decision: "approved",
    audienceType: "new",

    // The agent's echo, verbatim and unmerged. It is routinely near-empty —
    // `business_name: ""`, `interests: []` — and the captured working body
    // sends it exactly that way, so it is NOT filled in here: `interests` is an
    // ARRAY there, and writing a string into it would change its type on a
    // branch that may iterate it. The real answers travel in
    // `campaignFormData` and `dynamicFormData`.
    user_details: userDetails,
    timestamp: new Date().toISOString(),
  };

  // Meta semi: the customer's own creative, top-level as well as inside
  // campaignFormData. Omitted entirely for full automation and the other
  // platforms, so absent stays the shape they already send.
  if (semiAutomationMedia) {
    payload.semiAutomationMedia = semiAutomationMedia;
  }
  if (mediaAssets) {
    payload.mediaAssets = mediaAssets;
  }

  // The setup's structured answers, on top: `audienceType` from the customer
  // replaces the "new" default above, and the rest are absent unless chosen.
  if (context.extras) {
    Object.assign(payload, context.extras);
  }

  // Only when there is a real pick. See the note at the top of this file.
  if (context.selectedPrompt) {
    payload.selected_prompt = context.selectedPrompt.prompt;
    payload.selected_prompt_index = context.selectedPrompt.index;
    payload.selected_prompt_model = context.selectedPrompt.model;
    payload.prompt_job_id = context.selectedPrompt.jobId;
  }

  // `undefined` values would be dropped by JSON.stringify anyway; removing the
  // placeholder keeps the body honest about what it carries.
  delete payload.agent_type;
  if (!userId) {
    delete payload.userId;
    delete payload.user_id;
  }

  return payload;
}
