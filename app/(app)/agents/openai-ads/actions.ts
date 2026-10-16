"use server";

import { getSession } from "@/lib/auth/session";
import { checkAgentRun } from "@/lib/data/agent-run-check";
import { beginAction, guardMessage } from "@/lib/data/action-guard";
import { isRedirectError } from "@/lib/auth/session-expired";
import { redirect } from "next/navigation";
import { currentBusinessId } from "@/components/page-shell";
import {
  askAdvise,
  createCampaign,
  generateCopy,
  prepareCampaign,
  startImage,
  uploadImage,
} from "@/lib/data/ads-api";
import { adsUserMessage } from "@/lib/data/ads-errors";
import { buildCampaignRequest, requestProblems, toLocationLabels } from "@/lib/data/ads-campaign-request";
import { parseGenerated, readCopyForm } from "@/lib/data/ads-copy";
import {
  MAX_RECOMMENDATIONS,
  getAdsDraft,
  setAdsDraft,
  type AdsDraft,
  type AdviceSummary,
} from "@/lib/data/ads-draft";
import type { AdsAdType } from "@/lib/data/ads-types";
import type { ChatGptAdsSetup } from "@/lib/data/chatgpt-ads-setup";
import type { GenerateBrief } from "@/lib/data/ads-types";
import {
  mergeDestinations,
  needsDestinations,
  readDestinationFields,
} from "@/lib/data/ads-destination";
import { signText } from "@/lib/signed-text";


/**
 * The Plan screen's actions.
 *
 * Its own file rather than `[agentId]/actions.ts`, because none of this is the
 * n8n agent flow: no chat webhook, no suggestion cookie, no receiver. Keeping
 * them apart means a change to one flow cannot quietly alter the other.
 *
 * Every one of these is free. `advise` and `generate` run on our own model key
 * and never touch the customer's advertiser account, so the customer can edit,
 * argue and re-draft as often as they like before anything can be charged.
 */

const PLAN = "/agents/openai-ads/plan";

function withProblem(message: string, step: string = PLAN): never {
  redirect(`${step}?problem=${encodeURIComponent(signText(message))}`);
}

/**
 * The bid off the form, or null when this form never asked for one.
 *
 * The distinction is load-bearing and its absence was a live bug. The Plan
 * page renders the bid input only when the campaign needs one, so on every
 * other save the key is simply ABSENT — and a reader that answered `0` there
 * made "this form had no bid field" indistinguishable from "the customer
 * cleared it to zero". Saving the edited copy then wrote a 0 over the amount
 * entered back on the setup form, silently, on a screen with no bid on it.
 *
 * Null means "leave what is stored alone". Zero and blank still mean "not
 * set", but only when the field was actually on screen to be blanked.
 */
function readBid(form: FormData): number | null {
  if (!form.has("bidAmount")) return null;
  const raw = form.get("bidAmount");
  return Number(typeof raw === "string" ? raw.trim() : "") || 0;
}

/** The setup with the bid applied only if this form carried one. */
function withBid(setup: ChatGptAdsSetup, bid: number | null): ChatGptAdsSetup {
  return bid === null ? setup : { ...setup, bidAmount: bid };
}

function readAdType(form: FormData): AdsAdType {
  return form.get("adType") === "full" ? "full" : "semi";
}

/**
 * Save the edited advert.
 *
 * The copy `generate` returns is a first draft and is presented as one, so this
 * is the step where the customer's version replaces the model's. Their edits
 * are stored verbatim — `copyProblems` runs on the screen to warn about the 50
 * and 100 character limits, but nothing is silently trimmed here: the service
 * trims what it is given and reports the trim as a note, which means a headline
 * cut on the way out is one the customer never saw.
 */
export async function saveAdsPlan(formData: FormData): Promise<void> {
  const businessId = await currentBusinessId();
  const draft = await getAdsDraft(businessId);
  if (!draft) redirect("/agents/openai-ads");

  const stored = await setAdsDraft(businessId, {
    copy: readCopyForm(formData),
    adType: readAdType(formData),
    setup: withBid(draft.setup, readBid(formData)),
  });
  if (!stored) withProblem("We couldn't save those edits. Try shortening the description.");

  redirect(`${PLAN}?saved=1`);
}

/**
 * Push back on the advice, and get an answer rather than a repeat.
 *
 * `history` is sent back exactly as it came. Without it the model has no memory
 * between calls — it would answer round two as though it were round one and
 * repeat itself, which reads as the product ignoring what was just typed.
 *
 * The customer's edits ride along in the same submit, so arguing never costs
 * them the headline they just rewrote.
 */
export async function refineAdsPlan(formData: FormData): Promise<void> {
  const businessId = await currentBusinessId();
  const draft = await getAdsDraft(businessId);
  if (!draft) redirect("/agents/openai-ads");

  const feedback = String(formData.get("feedback") ?? "").trim();
  if (feedback === "") withProblem("Type what you'd like changed.");

  const copy = readCopyForm(formData);
  const setup = withBid(draft.setup, readBid(formData));

  let advice: AdviceSummary;
  try {
    const advised = await askAdvise(
      {
        goal: setup.goal,
        budget_type: setup.budgetType || "daily", // never "" here: validateAdsSetup refused it
        budget_amount: setup.budgetAmount,
        locations: toLocationLabels(setup.locations),
        start_date: setup.startDate,
        end_date: setup.endDate,
        tracking_connected: false,
      },
      { feedback, history: draft.advice?.history },
    );

    advice = {
      objective: advised.objective,
      billingBasis: advised.billing_basis,
      downgraded: advised.downgraded,
      risks: Array.isArray(advised.risks) ? advised.risks : [],
      bidding: advised.bidding,
      recommendations: Array.isArray(advised.recommendations)
        ? advised.recommendations.slice(0, MAX_RECOMMENDATIONS)
        : [],
      reply: advised.reply,
      round: advised.round,
      history: Array.isArray(advised.history) ? advised.history : undefined,
    };
  } catch (error) {
    console.error("[openai-ads] advise round failed:", error);
    withProblem(adsUserMessage(error));
  }

  // Same degradation as step one: the conversation is the thing to lose when
  // the draft will not fit, never the campaign.
  let stored = await setAdsDraft(businessId, { advice, copy, setup, adType: readAdType(formData) });
  if (!stored && advice.history) {
    stored = await setAdsDraft(businessId, { advice: { ...advice, history: undefined } });
  }
  if (!stored) withProblem("We couldn't save that answer. Try a shorter message.");

  redirect(`${PLAN}?replied=1`);
}

/**
 * The brief every `generate` round sends, from the draft as it stands.
 *
 * One builder rather than two call sites, because the destination round and
 * the redraft must send the SAME brief: a round that dropped `platforms` would
 * get a destination worked out for the wrong set of surfaces, and one that
 * dropped the stored links would be asked for them again forever.
 */
function briefFor(draft: AdsDraft): GenerateBrief {
  return {
    brand_name: draft.setup.brandName,
    website_url: draft.setup.destinationUrl,
    goal: draft.setup.goal,
    locations: toLocationLabels(draft.setup.locations),
    // Omitted rather than sent empty: an empty list is a campaign running
    // nowhere, which is a different statement to "not specified".
    ...(draft.setup.platforms.length > 0 ? { platforms: draft.setup.platforms } : {}),
    // Everything the customer has already supplied. Absent on the first round.
    ...(draft.destinations ?? {}),
    ...(draft.adType === "semi" && draft.imageUrl ? { image_url: draft.imageUrl } : {}),
  };
}

/**
 * Answer what `generate` said it was missing, and ask it again.
 *
 * The links are stored on the draft BEFORE the call, not after, so a service
 * that is down does not also lose what the customer just typed — they would
 * have to find their App Store listing a second time to retry.
 */
export async function supplyAdsDestinations(formData: FormData): Promise<void> {
  const businessId = await currentBusinessId();
  const draft = await getAdsDraft(businessId);
  if (!draft) redirect("/agents/openai-ads");

  const answers = readDestinationFields(formData);
  if (Object.keys(answers).length === 0) {
    withProblem("Add at least one link before sending it.");
  }

  const destinations = mergeDestinations(draft.destinations, answers);
  if (!(await setAdsDraft(businessId, { destinations }))) {
    withProblem("We couldn't save those links.");
  }

  try {
    const written = await generateCopy(briefFor({ ...draft, destinations }));
    // The copy is rewritten too — `generate` answers both, and keeping the old
    // advert beside a new destination would show a page assembled from two
    // different runs.
    const stored = await setAdsDraft(businessId, {
      copy: parseGenerated(written),
      destination: written.destination,
    });
    if (!stored) withProblem("We couldn't save that answer.");
  } catch (error) {
    // `withProblem` above redirects, and a redirect is a throw: without this
    // the specific message was swallowed and replaced with a generic one.
    if (isRedirectError(error)) throw error;
    console.error("[openai-ads] destination round failed:", error);
    withProblem(adsUserMessage(error));
  }

  redirect(`${PLAN}?linked=1`);
}

/**
 * Write the advert again, from scratch.
 *
 * Offered because `generate` is not deterministic and costs nothing: a customer
 * who does not like the draft has no other way to get a different one, and
 * rewriting by hand is a worse use of the feature than pressing a button.
 *
 * It overwrites their edits, which is why the button says so.
 */
export async function redraftAdsCopy(): Promise<void> {
  const businessId = await currentBusinessId();
  const draft = await getAdsDraft(businessId);
  if (!draft) redirect("/agents/openai-ads");

  try {
    const written = await generateCopy(briefFor(draft));
    const stored = await setAdsDraft(businessId, {
      copy: parseGenerated(written),
      destination: written.destination,
    });
    if (!stored) withProblem("We couldn't save the new draft.");
  } catch (error) {
    // `withProblem` above redirects, and a redirect is a throw: without this
    // the specific message was swallowed and replaced with a generic one.
    if (isRedirectError(error)) throw error;
    console.error("[openai-ads] redraft failed:", error);
    withProblem(adsUserMessage(error));
  }

  redirect(`${PLAN}?redrafted=1`);
}

const REVIEW = "/agents/openai-ads/review";

/**
 * Save the advert and move ON, rather than back to the same screen.
 *
 * `saveAdsPlan` redirected to `?saved=1`, which left the flow with no way
 * forward at all — the Plan step was a dead end with a green banner on it.
 */
export async function continueToReview(formData: FormData): Promise<void> {
  const businessId = await currentBusinessId();
  const draft = await getAdsDraft(businessId);
  if (!draft) redirect("/agents/openai-ads");

  const stored = await setAdsDraft(businessId, {
    copy: readCopyForm(formData),
    adType: readAdType(formData),
    setup: withBid(draft.setup, readBid(formData)),
  });
  if (!stored) withProblem("We couldn't save those edits. Try shortening the description.");

  redirect(REVIEW);
}

/**
 * Semi automation: take the customer's own picture.
 *
 * PNG and JPEG only, and checked here rather than trusted from `accept` — a
 * file input's filter is a convenience, and a POST is not a browser. The bytes
 * go to the service as base64 and come back as a URL; nothing is stored here.
 */
export async function uploadAdImage(formData: FormData): Promise<void> {
  const businessId = await currentBusinessId();
  const draft = await getAdsDraft(businessId);
  if (!draft) redirect("/agents/openai-ads");

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    withProblem("Choose a PNG or JPEG to use as the advert's picture.", REVIEW);
  }
  const image = file as File;
  if (!["image/png", "image/jpeg"].includes(image.type)) {
    withProblem("The picture must be a PNG or a JPEG.", REVIEW);
  }

  try {
    const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
    const result = await uploadImage(base64);
    if (!result.image_url) {
      withProblem("That upload did not come back with a picture. Please try again.", REVIEW);
    }
    await setAdsDraft(businessId, {
      imageUrl: result.image_url,
      // `output_key` is what `create` needs; the URL only lasts six hours.
      ...(result.output_key
        ? { image: { jobId: "", outputKey: result.output_key, startedAt: Date.now() } }
        : {}),
    });
  } catch (error) {
    // `withProblem` above redirects, and a redirect is a throw: without this
    // the specific message was swallowed and replaced with a generic one.
    if (isRedirectError(error)) throw error;
    console.error("[openai-ads] the upload failed:", error);
    withProblem(adsUserMessage(error), REVIEW);
  }

  redirect(REVIEW);
}

/**
 * Full automation: start the render.
 *
 * Returns as soon as the job is queued — the picture does not exist yet, and
 * there is no push when it does. The Review screen polls `image_status`.
 */
export async function generateAdImage(): Promise<void> {
  const businessId = await currentBusinessId();
  const draft = await getAdsDraft(businessId);
  if (!draft) redirect("/agents/openai-ads");

  try {
    const job = await startImage({
      product_description: draft.setup.businessDescription,
      business_name: draft.setup.brandName,
      ratio: "1:1",
    });
    if (!job.output_key) {
      withProblem("The render did not start. Please try again.", REVIEW);
    }
    await setAdsDraft(businessId, {
      image: {
        jobId: job.job_id ?? "",
        outputKey: job.output_key!,
        startedAt: Date.now(),
      },
    });
  } catch (error) {
    // `withProblem` above redirects, and a redirect is a throw: without this
    // the specific message was swallowed and replaced with a generic one.
    if (isRedirectError(error)) throw error;
    console.error("[openai-ads] the render could not be started:", error);
    withProblem(adsUserMessage(error), REVIEW);
  }

  redirect(REVIEW);
}

/**
 * Check, then build. The only call here that spends money.
 *
 * `prepare` runs first, always: it creates nothing, and a 422 from it is every
 * field problem at once on a screen where fixing them is free. Only once it
 * passes is `create` sent — and `adsCall` refuses to retry that one, because a
 * second attempt is a second campaign rather than a second try.
 */
export async function createAdCampaign(): Promise<void> {
  const businessId = await currentBusinessId();
  const draft = await getAdsDraft(businessId);
  if (!draft) redirect("/agents/openai-ads");
  // The paid step: only for accounts that bought or were granted this agent.
  const gate = await checkAgentRun("openai-ads", (await getSession())?.businessId ?? businessId);
  if (!gate.ok) withProblem(gate.message, PLAN);

  // Already built once. Creating again would be a second campaign for one
  // intention, so the screen shows what exists instead. ANY record counts: a
  // create that answered without a `campaign_id` stored "" here, which read as
  // "not built" and let the next press build a second one (audit, 2026-09-29).
  if (draft.created) redirect(REVIEW);

  // One create at a time. `created` above only exists once `create` has
  // answered; two presses a moment apart both got past it.
  const account = (await getSession())?.businessId ?? businessId;
  const guard = beginAction(account, "create:openai-ads", { staleAfterMs: 120_000, minIntervalMs: 120_000 });
  if (!guard.ok) withProblem(guardMessage(guard.reason), REVIEW);
  const copy = draft.copy;
  const adType = draft.adType;
  if (!copy || !adType) {
    withProblem("Finish the advert before creating the campaign.", PLAN);
  }

  // A campaign whose link is not built yet would run somewhere with nowhere to
  // send people — and the service issues no link at all while anything is
  // missing, so this is not a partial state to push through.
  if (needsDestinations(draft.destination)) {
    withProblem("Add the missing links before creating the campaign.", PLAN);
  }

  // Every problem at once, on a screen where fixing them is still free.
  const problems = requestProblems(
    draft.setup,
    copy,
    adType,
    { imageUrl: draft.imageUrl, outputKey: draft.image?.outputKey },
    draft.advice?.bidding,
  );
  if (problems.length > 0) {
    withProblem(problems.map((p) => p.message).join(" | "), REVIEW);
  }

  const request = buildCampaignRequest(draft.setup, copy, adType, {
    imageUrl: draft.imageUrl,
    bidding: draft.advice?.bidding,
    // The per-platform links and the link `generate` already minted. Without
    // these the request described one surface and the service never built a
    // smart link — see the note in `ads-types.ts`.
    destinations: draft.destinations,
    // `dynamic_url` ONLY. `?? url` sent the website as `smart_link_url`
    // whenever the mint had failed — a "smart link" that is one destination,
    // keyed as though it covered three. Absent is what makes the service mint.
    smartLinkUrl: draft.destination?.dynamic_url,
    conversionEventIds: draft.setup.conversionEventIds,
  });

  try {
    await prepareCampaign(request);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    // Nothing was created, so a corrected retry is safe straight away.
    if (guard.ok) guard.release();
    console.error("[openai-ads] prepare refused the campaign:", error);
    withProblem(adsUserMessage(error), REVIEW);
  }

  try {
    // Full automation carries the render's key; semi carries its upload's.
    const created = await createCampaign(request, draft.image?.outputKey);
    await setAdsDraft(businessId, {
      created: {
        campaignId: created.campaign_id ?? "",
        adGroupId: created.ad_group_id,
        adId: created.ad_id,
        status: created.status ?? "paused",
        // The human name and review status are what the customer reads; the
        // ids are kept only so `campaignId` can guard against a second create.
        campaignName: created.campaign_name,
        reviewStatus: created.review_status,
        targetUrl: created.target_url,
      },
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    // Past the point where a retry is safe. Rule 4's shape: never report a
    // campaign that may exist as simply failed. The guard is NOT released, so
    // an immediate second press cannot create a second campaign.
    console.error("[openai-ads] create failed:", error);
    withProblem(adsUserMessage(error), REVIEW);
  }

  redirect(REVIEW);
}
