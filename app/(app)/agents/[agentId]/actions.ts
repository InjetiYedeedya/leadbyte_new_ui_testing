"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { getSession } from "@/lib/auth/session";
import { getAdsLeads, leadsToCsv } from "@/lib/data/ads-leads";
import { getSelectedLeadIds } from "@/lib/data/lead-selection";
import { conversionEvents, saveKey, verifyKey } from "@/lib/data/ads-api";
import { keyIsUsable, refusalReason } from "@/lib/data/openai-key-connect";
import { numericRowId } from "@/lib/api/row-id";
import {
  AgentSetupError,
  askAgent,
  getAgentSetupRow,
  requestSocialActivation,
  saveAgentSetup,
  triggerAgent,
  type AgentBackendId,
} from "@/lib/data/agent-setup";
import {
  SOCIAL_POST_PLATFORMS,
  buildSocialRow,
  buildSocialWebhook,
  readSocialForm,
  socialDefaultsFromRow,
  validateSocial,
} from "@/lib/data/social-media-setup";
import { absoluteUrl, isFilled } from "@/lib/data/profile-display";
import {
  clearSuggestion,
  getSuggestion,
  readSuggestion,
  setSuggestion,
  type Suggestion,
} from "@/lib/data/ads-suggestion";
import {
  creativesFor,
  missingCreatives,
  readGoogleSemiMedia,
  type CreativeUrls,
  type GoogleSemiAutomationMedia,
} from "@/lib/data/ads-creatives";
import { readSelectionMode } from "@/lib/data/selection-mode";
import { reportAgentFailure, withReference } from "@/lib/admin/agent-failure-log";
import { keepLinkedInDraft } from "@/lib/data/linkedin-setup-draft";
import {
  LINKEDIN_SEMI_INPUT,
  linkedInMediaAssets,
  parseLinkedInSemiMedia,
  validateLinkedInSemiMedia,
  type LinkedInSemiMedia,
} from "@/lib/data/linkedin-semi-media";
import { asksMode, modeLast } from "@/lib/data/campaign-steps";
import { existingPostOf } from "@/lib/data/engagement-post";
import { markLaunched } from "@/lib/data/launch-marker";
import { encodeBlockingCard } from "@/lib/data/ads-blocking-error";
import { isRedirectError } from "@/lib/auth/session-expired";
import {
  parseSemiAutomationMedia,
  validateSemiAutomationMedia,
  type SemiAutomationMedia,
} from "@/lib/data/meta-semi-media";
import { buildApprovePayload } from "@/lib/data/ads-approve-payload";
import { buildRevisePayload } from "@/lib/data/ads-revise-payload";
import { checkBusinessDetails } from "@/lib/data/business-details-check";
import { campaignFromPayload } from "@/lib/data/ads-chat-payload";
import { buildLaunchPayload } from "@/lib/data/ads-launch-payload";
import {
  adTypeFromAnswers,
  expandLocationAnswers,
  semiFormProblems,
  adjustSemiFields,
  holdDropdownsToOptions,
  missingSemiAnswers,
  parseSemiFields,
  readSemiAnswers,
  withLocationField,
} from "@/lib/data/semi-form";
import {
  googleAdsLaunchExtras,
  googleAdsPayload,
  readGoogleAdsForm,
  validateGoogleAds,
} from "@/lib/data/google-ads-setup";
import {
  metaAdsLaunchExtras,
  metaAdsPayload,
  readMetaAdsForm,
  validateMetaAds,
} from "@/lib/data/meta-ads-setup";
import { adsConnectionFor } from "@/lib/data/agent-ads-gate";
import { launchTarget } from "@/lib/data/ads-launch-target";
import { chosenAccountCurrency } from "@/lib/api/oauth-status";
import { leadQualificationPayload } from "@/lib/data/lead-qualification";
import {
  findSeoService,
  offPageSeoPayload,
  onPageSeoPayload,
  type SeoBusinessContext,
} from "@/lib/data/seo-setup";
import { UploadError, uploadFile } from "@/lib/data/uploads";
import { getBusinessProfileRepo } from "@/lib/data/business-profile-repo";
import { getConnectedMailbox } from "@/lib/data/email-callback";
import { beginAction, guardMessage } from "@/lib/data/action-guard";
import { checkAgentRun } from "@/lib/data/agent-run-check";
import { connectedSocialPlatforms } from "@/lib/data/social-connections";
import { generateEmailTemplate, emailTemplateToHtml } from "@/lib/data/email-template-api";
import {
  fetchPrompts,
  selectPrompt,
  startPromptGeneration,
} from "@/lib/data/creative-prompts-api";
import type { PromptChoice } from "@/lib/data/creative-prompts";
import {
  clearPick,
  currentPick,
  setChosenPrompt,
  setPickJob,
} from "@/lib/data/creative-pick";
import { TEMPLATE_MODES, type TemplateMode } from "@/lib/data/email-template";
import { agentJobId } from "@/lib/data/agent-payload";
import type { CampaignAction, ControlResult } from "@/lib/data/campaign-controls";
import {
  cancelActiveCampaigns,
  cancelRecipients,
  controlCampaign,
} from "@/lib/data/campaign-controls-api";
import { readCampaignReply } from "@/lib/data/campaign-reply";
import {
  clearCampaign,
  currentCampaign,
  setCampaign,
  setCampaignState,
} from "@/lib/data/campaign-job";
import {
  linkedInAdsPayload,
  readLinkedInAdsForm,
  validateLinkedInAds,
} from "@/lib/data/linkedin-ads-setup";
import {
  openAiAdsPayload,
  readOpenAiAdsForm,
  validateOpenAiAds,
} from "@/lib/data/openai-ads-setup";
import { CONVERSION_GOALS, readAdsSetupForm, validateAdsSetup } from "@/lib/data/chatgpt-ads-setup";
import { toLocationLabels, type AdsCopy } from "@/lib/data/ads-campaign-request";
import { readDestinationFields } from "@/lib/data/ads-destination";
import { askAdvise, generateCopy, readWebsite } from "@/lib/data/ads-api";
import { adsUserMessage } from "@/lib/data/ads-errors";
import {
  MAX_RECOMMENDATIONS,
  clearAdsDraft,
  setAdsDraft,
  type AdviceSummary,
  type AdsDraft,
} from "@/lib/data/ads-draft";
import {
  clearOpenAiKey,
  getOpenAiKey,
  readApiKeyForm,
  setOpenAiKey,
} from "@/lib/data/openai-key";
import {
  accountFromVerify,
  clearOpenAiAccount,
  getOpenAiAccount,
  setOpenAiAccount,
} from "@/lib/data/openai-account";
import { currentBusinessId } from "@/components/page-shell";
import { getAgentRepo } from "@/lib/data/agent-repo";
import { getWriterRepo } from "@/lib/data/writer-repo";
import { getCodingRepo } from "@/lib/data/coding-repo";
import { signText } from "@/lib/signed-text";
import { buildLaunchSummary } from "@/lib/data/launch-summary";
import { rememberLaunchSummary } from "@/lib/data/launch-summary-cookie";

/**
 * A `?problems=` value only our code can write. The pages show it through
 * `readSignedText`, so a crafted link cannot put its own "error" wording on
 * a real LeadByte page (audit, 2026-09-29).
 */
function problemParam(text: string): string {
  return encodeURIComponent(signText(text));
}

/**
 * The refusal card for a redirect, as `&blocked=…`, or "" when the failure was
 * not a refusal (`BlockingErrorCardView`). Signed, so only our own code can
 * set what the card says or where its link goes.
 */
function blockedParam(error: unknown): string {
  return error instanceof AgentSetupError && error.card
    ? `&blocked=${encodeURIComponent(encodeBlockingCard(error.card))}`
    : "";
}


export async function activateAgent(agentId: string): Promise<void> {
  const businessId = await currentBusinessId();
  const session = await getSession();
  const email = session?.businessId ?? businessId;

  // Purchase, then (Social Media) a connected social account — enforced here
  // as well as on the page, which explains it instead of showing a button
  // that will refuse. `agent-run-gate.ts` holds the rule.
  const gate = await checkAgentRun(agentId, email);
  if (!gate.ok) {
    redirect(`/agents/${agentId}?problems=${problemParam(gate.message)}`);
  }

  // Social Media posts through its own form now (`runSocialMedia`,
  // 2026-10-01). This button used to send only the legacy ACTIVATION call,
  // which never created a post; a stale tab posting here is sent back to the
  // form instead.
  if (agentId === "social-media") {
    redirect(`/agents/${agentId}`);
  }

  await getAgentRepo().activate(businessId, agentId);
  revalidatePath("/", "layout");
}

/** Approves a Writer draft, moving it from review into the published list. */
export async function approveWriterDraft(draftId: string): Promise<void> {
  const businessId = await currentBusinessId();
  await getWriterRepo().approveDraft(businessId, draftId);
  revalidatePath("/", "layout");
}

/** Merges a Coding agent pull request and updates the open/merged counters. */
export async function approveAndShipPr(prId: string): Promise<void> {
  const businessId = await currentBusinessId();
  await getCodingRepo().approveAndShip(businessId, prId);
  revalidatePath("/", "layout");
}

/**
 * Configures and launches one of the ad agents.
 *
 * Three hops, in the live app's own order: the chat webhook opens the
 * conversation, the receiver executes the campaign, and the setup is saved
 * last. Order matters — saving first would leave a stored setup for a campaign
 * that never launched, which reads as configured and does nothing.
 *
 * Validation problems come back through the URL rather than as an exception:
 * the customer has just filled in fifteen fields and needs to see all the
 * problems at once, on the form, not a 500.
 *
 * The three platforms differ only in how their form is read, validated and
 * shaped — so that is all each one passes in. Adding the fourth ad agent is a
 * call to this, not a copy of it.
 */
async function launchAdAgent<T>(
  agentId: AgentBackendId,
  formData: FormData,
  {
    read,
    validate,
    toPayload,
    extras,
  }: {
    read: (form: FormData) => T;
    validate: (setup: T) => string[];
    toPayload: (
      setup: T,
      context: {
        email: string;
        userId?: string;
        sessionId: string;
        /**
         * Only OpenAI Ads takes one. The other three are connected by OAuth
         * and n8n holds the token, so their payloads carry no credential.
         */
        apiKey: string;
      },
    ) => Record<string, unknown>;
    /** The structured answers the LAUNCH body carries (`Suggestion.launchExtras`). */
    extras?: (setup: T) => Record<string, unknown>;
  },
): Promise<void> {
  const businessId = await currentBusinessId();
  const session = await getSession();

  // Bought, then the ad account connected — before anything is planned. The
  // real half of the lock the page explains (`agent-run-gate.ts`).
  const gate = await checkAgentRun(agentId, session?.businessId ?? businessId);
  if (!gate.ok) {
    redirect(`/agents/${agentId}?problems=${problemParam(gate.message)}`);
  }

  const setup = read(formData);
  const problems = validate(setup);
  if (problems.length > 0) {
    redirect(`/agents/${agentId}?problems=${problemParam(problems.join("|"))}`);
  }

  const email = session?.businessId ?? businessId;
  // One id for this sitting, so the agent's chat turns can be tied together.
  const sessionId = randomUUID();

  // Read from the httpOnly cookie, never from the form: a credential that can
  // arrive in a POST body is a credential an attacker can set. Empty for every
  // platform but OpenAI Ads, which has no other way to be authorised.
  const apiKey = agentId === "openai-ads" ? ((await getOpenAiKey()) ?? "") : "";
  if (agentId === "openai-ads" && apiKey === "") {
    redirect(
      `/agents/${agentId}?problems=` +
        problemParam("Add your OpenAI API key before launching a campaign."),
    );
  }

  // The budget as a NUMBER with the ad account's currency, beside the display
  // strings the chat fields carry ("$50" alone is a budget in no currency —
  // legacy flow guide §10). The currency is the chosen ad account's, when known.
  const adsPlatform = adsConnectionFor(agentId);
  const budgetAmount = (setup as { budgetAmount?: unknown }).budgetAmount;
  const currency = adsPlatform ? await chosenAccountCurrency(adsPlatform, email) : "";
  const budget =
    typeof budgetAmount === "number" && budgetAmount > 0
      ? { budget_amount: budgetAmount, ...(currency ? { budget_currency: currency } : {}) }
      : {};
  const payload = {
    ...toPayload(setup, { email, userId: session?.userId, sessionId, apiKey }),
    ...budget,
  };
  const launchExtras = { ...(extras ? extras(setup) : {}), ...budget };

  // ASK, do not launch. This step ends with a plan on screen, not a live
  // campaign — the customer approves it on the next page. Firing the receiver
  // here made "see what the agent suggests" and "spend money" the same button.
  let reply: unknown;
  try {
    reply = await askAgent(agentId, payload);
  } catch (error) {
    const message = await failureMessage(
      agentId,
      "get suggestion",
      error,
      "We couldn't reach this agent. Please try again.",
    );
    redirect(`/agents/${agentId}?problems=${problemParam(message)}${blockedParam(error)}`);
  }

  const { output, userDetails, semiAllowed } = readSuggestion(reply);
  if (output === "") {
    console.error(`[${agentId}] the agent answered with nothing readable:`, reply);
    redirect(
      `/agents/${agentId}?problems=` +
        problemParam("The agent didn't return a plan. Please try again."),
    );
  }

  // The campaign travels with the plan: the approval two pages from here has to
  // send this same brief back, and the form will be long gone.
  const { intro, fields } = campaignFromPayload(payload);
  await setSuggestion(businessId, agentId, {
    output,
    userDetails,
    sessionId,
    revisions: 0,
    intro,
    fields,
    ...(semiAllowed ? {} : { semiAllowed: false as const }),
    ...(Object.keys(launchExtras).length > 0 ? { launchExtras } : {}),
  });

  // The setup is stored so the form remembers it, and a failure here is not the
  // customer's problem: they have a suggestion to read either way.
  //
  // `id` is the partition key on these tables, not `email` — DynamoDB answered
  // "Missing the key id in the item" until it was sent.
  //
  // NOT for LinkedIn Ads: its row is the submission record, written by
  // `launchCampaign` only once a campaign has actually launched
  // (LINKEDIN_ADS_FLOW.md 6.6). Saving it here described campaigns that were
  // planned and then abandoned as though they had been submitted.
  if (agentId !== "linkedin-ads") {
    try {
      await saveAgentSetup(agentId, {
        // A NUMBER. `id: email` was sent here and DynamoDB answered "Type
        // mismatch for key id expected: N actual: S" — the same shape as the
        // Frontend Check tables, and the same fix. Derived from the email so
        // saving again updates this account's row instead of adding another.
        session_id: sessionId,
        ...setup,
        // The key and the account LAST: a form field called `id` or `email`
        // (a contact address on the setup form) used to overwrite them, and a
        // row saved under another email is one this account never finds again
        // — the agent then read "not set up" (audit, 2026-09-29).
        id: numericRowId(email),
        email,
      });
    } catch (error) {
      console.error(`[${agentId}] the setup could not be saved:`, error);
    }
  }

  revalidatePath("/", "layout");
  redirect(`/agents/${agentId}/suggestion`);
}

/**
 * The business-details check, again on the server: the page shows it in place
 * of the form, and a page check does not protect a POST
 * (`business-details-check.ts`). Meta and Google Ads.
 */
async function requireBusinessDetails(agentId: "meta-ads" | "google-ads"): Promise<void> {
  const details = await checkBusinessDetails(await currentBusinessId());
  if (details.kind === "ok") return;
  const message =
    details.kind === "missing"
      ? `Complete your business details first: ${details.missing.join(", ")}.`
      : "We couldn't load your business details. Please try again.";
  redirect(`/agents/${agentId}?problems=${problemParam(message)}`);
}

export async function launchGoogleAds(formData: FormData): Promise<void> {
  await requireBusinessDetails("google-ads");
  await launchAdAgent("google-ads", formData, {
    read: readGoogleAdsForm,
    validate: validateGoogleAds,
    toPayload: googleAdsPayload,
    extras: googleAdsLaunchExtras,
  });
}

export async function launchMetaAds(formData: FormData): Promise<void> {
  await requireBusinessDetails("meta-ads");
  await launchAdAgent("meta-ads", formData, {
    read: readMetaAdsForm,
    validate: validateMetaAds,
    toPayload: metaAdsPayload,
    extras: metaAdsLaunchExtras,
  });
}

export async function launchLinkedInAds(formData: FormData): Promise<void> {
  // Kept first, so EVERY way back to the form — a validation error, n8n busy,
  // a plan that never came — finds it filled in (`linkedin-setup-draft.ts`).
  await keepLinkedInDraft(readLinkedInAdsForm(formData));
  await launchAdAgent("linkedin-ads", formData, {
    read: readLinkedInAdsForm,
    validate: validateLinkedInAds,
    toPayload: linkedInAdsPayload,
  });
}

/**
 * Step 1 of the ChatGPT Ads flow: take the setup form to the ads service.
 *
 * ## Why this does not go through `launchAdAgent`
 *
 * That helper is built for the n8n agents: one POST to a chat webhook, one
 * reply, one stored suggestion. This service is a sequence — read the website,
 * ask for advice, write the copy — over its own endpoint with its own key.
 * Forcing it through would mean a `toPayload` that returns something
 * `askAgent` cannot send to a `chatPath` that does not exist.
 *
 * ## The order, and why nothing here spends
 *
 * `read_website` gives the copywriter something real to work from, `advise`
 * reports what the campaign will actually buy, and `generate` drafts the ad.
 * None of the three touches the customer's advertiser account — the first two
 * run on our own model key — so this whole step is free and reversible. The
 * money starts at `prepare`, two screens later.
 *
 * A failure in the website read is NOT fatal: the copywriter falls back to its
 * own fetch (`brief_source: "fetched"`), and refusing to continue because one
 * optional enrichment failed would be worse than continuing without it.
 */
export async function launchOpenAiAds(formData: FormData): Promise<void> {
  const businessId = await currentBusinessId();
  const gate = await checkAgentRun("openai-ads", (await getSession())?.businessId ?? businessId);
  if (!gate.ok) {
    redirect(`/agents/openai-ads?problems=${problemParam(gate.message)}`);
  }
  const setup = readAdsSetupForm(formData);

  // The account's currency (from `verify`) decides the budget floor — $25/$100
  // on USD. Read here so `validateAdsSetup` can check the amount against it.
  const account = await getOpenAiAccount();
  const problems = validateAdsSetup(setup, account?.currency);
  // Leads and App installs optimise for a conversion event; the form offers
  // them only when the account has one, and a forged post is held here too —
  // asked live only when the stored summary says none.
  if (CONVERSION_GOALS.includes(setup.goal) && (account?.conversionEventCount ?? 0) === 0) {
    const live = await conversionEvents();
    if ((live?.events?.length ?? 0) === 0) {
      problems.push("Leads and App installs need a conversion event on your OpenAI ad account. Choose another goal, or add one first.");
    }
  }
  if (problems.length > 0) {
    redirect(`/agents/openai-ads?problems=${problemParam(problems.join(" | "))}`);
  }

  // A submitted setup form IS a new campaign. The draft is merged, not replaced,
  // so without this the previous run's `created` (and its `imageUrl` / `image`)
  // survives into the new draft — Review then shows the OLD campaign as already
  // created and `createAdCampaign` short-circuits, so a genuinely new campaign
  // is never built. Start clean.
  await clearAdsDraft();

  const locations = toLocationLabels(setup.locations);
  // One URL per platform, asked on the step before the advert. Sent with the
  // FIRST brief, so a multi-platform campaign gets its link straight away
  // rather than being told a screen later that a store listing is missing.
  const destinations = readDestinationFields(formData);
  let site: AdsDraft["site"];
  let advice: AdviceSummary | undefined;
  let copy: AdsCopy | undefined;
  let destination: AdsDraft["destination"];

  try {
    // Best effort. A site that cannot be reached is a worse advert, not a
    // stopped campaign.
    try {
      const read = await readWebsite(setup.destinationUrl, setup.brandName);
      site = {
        url: read.final_url ?? read.url ?? setup.destinationUrl,
        title: read.title ?? "",
        brief: read.brief ?? read.meta_description ?? "",
      };
    } catch (error) {
      console.warn(`[openai-ads] could not read ${setup.destinationUrl}:`, error);
    }

    const advised = await askAdvise({
      goal: setup.goal,
      budget_type: setup.budgetType || "daily", // never "" here: validateAdsSetup refused it
      budget_amount: setup.budgetAmount,
      locations,
      start_date: setup.startDate,
      end_date: setup.endDate,
      // Not guessed: it decides whether a leads campaign optimises for
      // enquiries or runs as clicks. Until the connect step reads it for real,
      // false is the honest answer — and the one that under-promises.
      tracking_connected: false,
    });

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

    const written = await generateCopy({
      brand_name: setup.brandName,
      website_url: setup.destinationUrl,
      goal: setup.goal,
      locations,
      // Omitted rather than sent empty: an empty list is a campaign running
      // nowhere, which is a different statement to "not specified".
      ...(setup.platforms.length > 0 ? { platforms: setup.platforms } : {}),
      ...destinations,
    });

    copy = {
      title: written.title ?? "",
      description: written.description ?? "",
      topics: Array.isArray(written.topics) ? written.topics : [],
    };
    // Where the advert will send people, and what the service still needs to
    // build that. The Plan screen asks for anything `missing` names.
    destination = written.destination;
  } catch (error) {
    console.error("[openai-ads] setup failed:", error);
    redirect(`/agents/openai-ads?problems=${problemParam(adsUserMessage(error))}`);
  }

  // Attempted with the conversation, retried without. `history` is the one
  // field that grows per round, so when the draft will not fit it is the thing
  // to lose: the campaign survives and only the ability to argue with round one
  // goes with it.
  let stored = await setAdsDraft(businessId, {
    setup,
    site,
    advice,
    copy,
    destination,
    destinations,
  });
  if (!stored && advice?.history) {
    console.warn("[openai-ads] draft too large with advise history — storing without it");
    stored = await setAdsDraft(businessId, {
      setup,
      site,
      advice: { ...advice, history: undefined },
      copy,
      destination,
      destinations,
    });
  }
  if (!stored) {
    // Said plainly rather than letting the next page's redirect be the only
    // symptom — that reads as a routing bug and sends nobody to the fix.
    redirect(
      `/agents/openai-ads?problems=${problemParam(
        "We couldn't hold on to that campaign. Try a shorter business description.",
      )}`,
    );
  }

  redirect("/agents/openai-ads/plan");
}

/**
 * Stores the customer's OpenAI API key and returns them to the setup form.
 *
 * A Server Action because a cookie is only writable from one — and httpOnly is
 * the whole point, so the value must never be handled by page JavaScript.
 *
 * The key is not validated against OpenAI here. We have no endpoint to ask
 * with, and a "check" that only confirms the string looks like a key would be
 * theatre: the first real campaign is what proves it, and that is where the
 * error belongs.
 */
/**
 * Connect the customer's advertiser key: check it, then store it.
 *
 * ## Why this talks to the backend at all
 *
 * It did not. It wrote the key to an httpOnly cookie and stopped — so the
 * service never received it, had nothing filed under this customer, and fell
 * through to its own `OPENAI_ADS_API_KEY` env var. With that unset, every
 * `prepare` came back 400 saying so, which read as a backend misconfiguration
 * and was in fact a call we had never made (2026-09-16).
 *
 * ## Two calls, in this order
 *
 *   verify   — is it usable? `usable`, not `valid`: a recognised key with no
 *              advertiser account behind it fails much later otherwise.
 *   save_key — stored encrypted against this customer. It re-verifies
 *              internally, so a bad key is never stored.
 *
 * This is the LAST time the key is sent. Everything after it carries only
 * `user_id`, and the service decrypts the stored key for that one request.
 */
export async function saveOpenAiKey(formData: FormData): Promise<void> {
  const key = readApiKeyForm(formData);
  if (key === "") {
    redirect(
      "/agents/openai-ads?problems=" + problemParam("Paste your OpenAI API key to continue."),
    );
  }

  const session = await getSession();
  const email = session?.businessId ?? (await currentBusinessId());

  // Both calls run inside the try; every `redirect()` happens after it. Rule
  // 4's shape: `redirect()` throws NEXT_REDIRECT, and a catch around it
  // reports a successful hop as "we couldn't reach the service".
  let problem: string | null = null;
  // The account facts `verify` read while the key was in hand — currency,
  // country and status — kept for the setup form, which bills in that currency
  // and prefills that country and never sends the key again to ask.
  let account: ReturnType<typeof accountFromVerify> | null = null;
  try {
    const checked = await verifyKey(key);
    if (!keyIsUsable(checked)) {
      // Refused, so nothing is stored — and the service's own reason is used,
      // because it names what to fix where ours would only paraphrase.
      problem = refusalReason(checked);
    } else {
      const saved = await saveKey(email, key, "Main account");
      // The save reply carries the account and its conversion events too
      // (read on the same trip); it wins where both answered.
      account = accountFromVerify({
        country_suggested: checked.country_suggested,
        account: { ...checked.account, ...saved?.account },
        conversion_events: saved?.conversion_events,
        checks: saved?.checks ?? checked.checks,
      });
    }
  } catch (error) {
    console.error("[openai-ads] the key could not be connected:", error);
    problem = adsUserMessage(error);
  }

  if (problem !== null) {
    redirect(`/agents/openai-ads?problems=${problemParam(problem)}`);
  }

  // Kept so the screen knows a key is connected without asking the service on
  // every render. The service holds the real one; this is the local record.
  await setOpenAiKey(key);
  if (account) await setOpenAiAccount(account);
  redirect("/agents/openai-ads");
}
/** Forgets the stored key, so a different one can be used. */
export async function forgetOpenAiKey(): Promise<void> {
  await clearOpenAiKey();
  // The account summary belongs to that key — a different key may be a
  // different account with a different currency, so it must not linger.
  await clearOpenAiAccount();
  redirect("/agents/openai-ads");
}

/**
 * The one thing that decides where the leads file comes from.
 *
 * "Use my ads leads" must not change the agent's contract at all: the backend
 * still gets a `leadDatabaseUrl` pointing at an uploaded file, exactly as it
 * always has. So this fetches `leadbyte-leads`, turns it into the same CSV
 * shape a customer's own file would be (`leadsToCsv`), and returns a real
 * `File` — the upload step downstream cannot tell the difference between
 * this and something picked from a computer.
 *
 * Throws rather than returning null on "nothing to qualify": both callers
 * already have a single catch block that turns any failure here into the
 * same user-facing message a missing file gets, so a distinct error type
 * would duplicate that handling for no benefit.
 *
 * "Ads leads" is a SELECTION, made on its own page
 * (`/agents/[agentId]/leads`) and read back from `lib/data/lead-selection.ts`
 * — not from this submission's own `formData`, because the picker is a
 * separate page visit, not a field inside this form. `null` from
 * `getSelectedLeadIds` means nobody has ever narrowed the list, which uses
 * every lead; an explicit empty array means someone chose zero on purpose,
 * which refuses to run rather than silently falling back to the full table.
 */
async function resolveLeadDatabase(
  formData: FormData,
  email: string,
  businessId: string,
): Promise<File> {
  if (formData.get("leadSource") === "ads") {
    const saved = await getSelectedLeadIds(businessId);
    if (saved !== null && saved.length === 0) {
      throw new AgentSetupError(
        "no ads leads selected",
        "Select at least one lead to qualify, or switch to uploading a file.",
      );
    }
    const allLeads = await getAdsLeads(email);
    const leads = saved === null ? allLeads : allLeads.filter((lead) => saved.includes(lead.id));
    if (leads.length === 0) {
      throw new AgentSetupError(
        "no ads leads found",
        "No leads found from your ad campaigns yet. Try uploading a file instead.",
      );
    }
    return new File([leadsToCsv(leads)], "ads-leads.csv", { type: "text/csv" });
  }

  const leadDatabase = formData.get("leadDatabase");
  if (!(leadDatabase instanceof File) || leadDatabase.size === 0) {
    throw new AgentSetupError("no lead database file", "Choose a lead database file to qualify.");
  }
  return leadDatabase;
}

/**
 * Configures and runs the Lead Qualification agent.
 *
 * Two steps, in this order and no other: upload the files, then run. A run that
 * starts before its leads file has landed has nothing to qualify, and the agent
 * cannot tell the difference between "not uploaded yet" and "empty".
 *
 * The business fields are read from the profile rather than asked for again —
 * the agent needs company name, website and business type, and the customer
 * has already given all three.
 */
export async function runLeadQualification(formData: FormData): Promise<void> {
  const businessId = await currentBusinessId();
  const session = await getSession();
  const email = session?.businessId ?? businessId;

  // Bought, then a mailbox — checked before the upload: a leads file in S3
  // for a run that cannot start is an orphan, and this agent emails the leads.
  const gate = await checkAgentRun("lead-qualification", email);
  if (!gate.ok) {
    redirect(`/agents/lead-qualification?problems=${problemParam(gate.message)}`);
  }

  // Every run EMAILS the leads it scores, so a second submit emailed the same
  // people twice. One run per two minutes per account.
  const leadGuard = beginAction(email, "lead-run", { staleAfterMs: 120_000, minIntervalMs: 120_000 });
  // Already running is not a problem: land on the same green "launched" view
  // the first submit did, rather than a red notice for a run that is sending.
  if (!leadGuard.ok) {
    redirect("/agents/lead-qualification?launched=1");
  }

  const companyDoc = formData.get("companyDoc");
  const profile = await getBusinessProfileRepo().get(businessId);
  let warnings: string[] = [];

  try {
    // Either the file someone picked, or `leadbyte-leads` turned into the
    // same shape — see `resolveLeadDatabase`. Uploaded first, and awaited:
    // the run payload carries the URLs.
    const leadDatabase = await resolveLeadDatabase(formData, email, businessId);
    const leads = await uploadFile(leadDatabase, { folder: "lead-qualification", email, kind: "lead-database" });
    const document =
      companyDoc instanceof File && companyDoc.size > 0
        ? await uploadFile(companyDoc, { folder: "lead-qualification", email, kind: "pdf-document" })
        : null;

    // The envelope's job_id is n8n's tracking id only (the backend records it
    // as `external_job_id`). The handle pause / resume / cancel need is the
    // mail service's OWN id, read from the reply — see `campaign-reply.ts`.
    const reply = await triggerAgent(
      "lead-qualification",
      leadQualificationPayload({
        jobId: agentJobId(),
        email,
        userId: session?.userId,
        emailTemplate: String(formData.get("emailTemplate") ?? "").trim(),
        leadDatabaseUrl: leads.fileUrl,
        attachedDocument: document?.fileUrl ?? "",
        companyName: profile?.businessName ?? "",
        websiteUrl: profile?.websiteUrl ?? "",
        // `businessType` is the profile's own field; `specialization` is what
        // the business actually does, which is the description. Both are read
        // with `??` rather than `isFilled` because the backend takes an empty
        // string here — the agent asks its own follow-up when it needs more.
        businessType: profile?.businessType ?? profile?.industry ?? "",
        specialization: profile?.description ?? "",
        brandLogoUrl: profile?.brand?.logo ?? "",
        isUpdate: await isReconfigure(businessId, "lead-qualification"),
      }),
    );
    warnings = await rememberLeadCampaign(reply);
  } catch (error) {
    const message = await failureMessage(
      "lead-qualification",
      "start run",
      error,
      "We couldn't start the Lead Qualification agent. Please try again.",
    );
    redirect(`/agents/lead-qualification?problems=${problemParam(message)}`);
  }

  await getAgentRepo().activate(businessId, "lead-qualification");
  revalidatePath("/", "layout");
  redirect(`/agents/lead-qualification?launched=1${warnParam(warnings)}`);
}

/** The outcome of an in-place (popup) agent run — used by every Configure modal. */
export interface AgentConfigureResult {
  ok: boolean;
  message: string;
  /** What the mail service flagged about the run (a truncated list, say). */
  warnings?: string[];
}

/** A second submit while the first run is still sending — told as good news. */
const LEAD_RUN_IN_PROGRESS =
  "Your leads are already being qualified and the emails are going out. There's no need to start it again.";

/** Kept as the original name the Lead Qualification popup imports. */
export type LeadQualResult = AgentConfigureResult;

/**
 * The popup variant of `runLeadQualification`.
 *
 * Same two steps in the same order — upload the files, then trigger the agent —
 * but it RETURNS its outcome instead of redirecting, because it runs from the
 * "Configure" modal on the agents list and must not navigate the page away.
 * Kept as a sibling of `runLeadQualification` rather than folded into it: the
 * detail-page form still wants the redirecting version (it lands on the
 * activity view), and mixing return-or-redirect in one action reads worse than
 * the small duplication.
 */
export async function configureLeadQualification(formData: FormData): Promise<LeadQualResult> {
  const businessId = await currentBusinessId();
  const session = await getSession();
  const email = session?.businessId ?? businessId;

  const gate = await checkAgentRun("lead-qualification", email);
  if (!gate.ok) return { ok: false, message: gate.message };

  // The same guard as `runLeadQualification`: both email the leads.
  const leadGuard = beginAction(email, "lead-run", { staleAfterMs: 120_000, minIntervalMs: 120_000 });
  // A run started moments ago IS the run the customer wants — its emails are
  // going out. Said as the success it is: in red it read as a failure.
  if (!leadGuard.ok) return { ok: true, message: LEAD_RUN_IN_PROGRESS };

  const companyDoc = formData.get("companyDoc");
  const profile = await getBusinessProfileRepo().get(businessId);
  let warnings: string[] = [];

  try {
    // Either the file someone picked, or `leadbyte-leads` turned into the
    // same shape — see `resolveLeadDatabase`. Uploaded first, and awaited:
    // the run payload carries the URLs.
    const leadDatabase = await resolveLeadDatabase(formData, email, businessId);
    const leads = await uploadFile(leadDatabase, { folder: "lead-qualification", email, kind: "lead-database" });
    const document =
      companyDoc instanceof File && companyDoc.size > 0
        ? await uploadFile(companyDoc, { folder: "lead-qualification", email, kind: "pdf-document" })
        : null;

    // The envelope's job_id is n8n's tracking id only (the backend records it
    // as `external_job_id`). The handle pause / resume / cancel need is the
    // mail service's OWN id, read from the reply — see `campaign-reply.ts`.
    const reply = await triggerAgent(
      "lead-qualification",
      leadQualificationPayload({
        jobId: agentJobId(),
        email,
        userId: session?.userId,
        emailTemplate: String(formData.get("emailTemplate") ?? "").trim(),
        leadDatabaseUrl: leads.fileUrl,
        attachedDocument: document?.fileUrl ?? "",
        companyName: profile?.businessName ?? "",
        websiteUrl: profile?.websiteUrl ?? "",
        businessType: profile?.businessType ?? profile?.industry ?? "",
        specialization: profile?.description ?? "",
        brandLogoUrl: profile?.brand?.logo ?? "",
        isUpdate: await isReconfigure(businessId, "lead-qualification"),
      }),
    );
    warnings = await rememberLeadCampaign(reply);
  } catch (error) {
    const message = await failureMessage(
      "lead-qualification",
      "configure run",
      error,
      "We couldn't start the Lead Qualification agent. Please try again.",
    );
    return { ok: false, message };
  }

  await getAgentRepo().activate(businessId, "lead-qualification");
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: "Lead Qualification started. It reports what it does on the agent's page as it goes.",
    warnings,
  };
}

/**
 * The creative prompt pick: start, poll, choose.
 *
 * ## Why this is offered rather than done for them
 *
 * `selectionMode: "ask"` is a constant in every observed launch — the pipeline
 * writes three candidates because somebody is meant to choose. Picking on the
 * customer's behalf spends their ad budget on a creative direction they never
 * saw, so the whole flow is optional: skipping it launches exactly the way
 * every campaign did before this existed.
 *
 * Each one returns a plain result. A creative suggestion that cannot be written
 * must never take down the form the customer is halfway through.
 */
/**
 * Looks a setup field up by the label it was stored under.
 *
 * `Suggestion.fields` is a list of `[label, value]` tuples because that is the
 * order the payload sends them in, and order is part of that contract. Reading
 * one by name needs this rather than an object, and a missing label returns ""
 * — the same "absent is empty" rule the payload builders follow.
 */
function fieldValue(fields: readonly (readonly [string, string])[] | undefined) {
  const map = new Map(fields ?? []);
  return (label: string): string => map.get(label) ?? "";
}

async function startCreativePrompts(
  agentId: AgentBackendId,
): Promise<{ ok: boolean; message?: string; busy?: boolean }> {
  const businessId = await currentBusinessId();
  const session = await getSession();
  const current = await getSuggestion(businessId, agentId);

  if (!session?.userId) {
    return { ok: false, message: "We can't identify this account to the creative service." };
  }
  if (!current) {
    return { ok: false, message: "This campaign's plan is no longer in memory." };
  }

  // Three paid model runs per start; not again within half a minute.
  const promptGuard = beginAction(session.businessId, `prompts:${agentId}`, {
    staleAfterMs: 30_000,
    minIntervalMs: 30_000,
  });
  // `busy`, not a failure: the prompts from the last 30 seconds are already
  // being written (Back and Continue again, or a double submit). Callers send
  // the customer to /creative for them. Treated as "the writer is down", this
  // fell through to `launchCampaign` and launched a paid campaign with no
  // creative picked (review, 2026-10-08).
  if (!promptGuard.ok) return { ok: false, busy: true, message: guardMessage(promptGuard.reason) };

  const profile = await getBusinessProfileRepo().get(businessId);

  // From the SETUP fields, not `userDetails`. Three separate reasons, all
  // found the same way — by comparing these against a real payload:
  //
  // - `userDetails` is the agent's own echo and is routinely near-empty, so
  //   every one of these fell through to its fallback.
  // - The labels were wrong anyway. This asked for "Product or service" and
  //   "Offer"; the payload's labels are "Service or product", "Offer value"
  //   and "Offer type". A `??` chain of labels that do not exist looks like
  //   careful fallback handling and is three dead reads.
  // - `ad_format` was hardcoded to "image", so a customer who asked for video
  //   got three image prompts. The Meta form now asks, and this reads it.
  const setup = fieldValue(current.fields);

  const job = await startPromptGeneration({
    // The campaign's own session id, so the pipeline's record lines up with the
    // launch that follows.
    jobId: current.sessionId,
    userId: session.userId,
    productDescription:
      setup("Service or product") || profile?.description || "",
    offerDetails: setup("Offer value") || setup("Offer type") || setup("Ad goal") || "",
    // From the details form the customer just submitted — that is where the
    // agent asks "Ad Type" (Image / Video / Carousel), and it is the reason
    // generation runs AFTER the form rather than before it.
    adFormat: adTypeFromAnswers(current.answers ?? {}),
    whichAds: agentId.replace("-ads", ""),
  });

  if (job === null) {
    return {
      ok: false,
      message: "We couldn't start the creative writer. You can launch without it.",
    };
  }

  await setPickJob(job.jobId, job.token);
  return { ok: true };
}

/** One poll. `ready: false` covers both "still writing" and a failed read. */
export async function pollCreativePrompts(): Promise<{
  ready: boolean;
  prompts: PromptChoice[];
}> {
  const pick = await currentPick();
  if (pick === null) return { ready: false, prompts: [] };

  return fetchPrompts(pick.jobId, pick.token);
}

/**
 * Records the pick — with the pipeline first, then with us.
 *
 * If the pipeline refuses, nothing is stored: launching with a prompt it does
 * not know it produced is worse than asking the customer to choose again.
 */
async function chooseCreativePrompt(
  choice: PromptChoice,
): Promise<{ ok: boolean; message?: string }> {
  const pick = await currentPick();
  if (pick === null) {
    return { ok: false, message: "That creative session has expired. Start it again." };
  }

  const accepted = await selectPrompt(pick.jobId, pick.token, choice.index);
  if (!accepted) {
    return { ok: false, message: "We couldn't record that choice. Please try again." };
  }

  await setChosenPrompt(choice);
  return { ok: true };
}

/**
 * The pick, and then the launch.
 *
 * One action because they are one decision from the customer's side: choosing
 * a creative direction IS the last thing standing between a completed form and
 * a running campaign. Two buttons would let someone choose a prompt and then
 * wander off, leaving a campaign that is fully specified and never launched.
 *
 * `redirect()` throws, so it is called outside anything that catches — rule 4.
 * A failed pick returns instead, because the prompts are still on screen and
 * retrying is a click.
 */
export async function chooseAndLaunch(
  agentId: AgentBackendId,
  choice: PromptChoice,
): Promise<{ ok: boolean; message?: string }> {
  const chosen = await chooseCreativePrompt(choice);
  if (!chosen.ok) return chosen;

  await launchCampaign(agentId);
  return { ok: true };
}

/**
 * Writes an outreach template for the customer.
 *
 * The mode is validated against `TEMPLATE_MODES` rather than trusted: it comes
 * from a client island, and the backend switches on the string — an unknown
 * value there is the `"custom"` bug again, one layer down.
 *
 * Returns a message instead of throwing. This sits beside a textarea the
 * customer can always fill in themselves, so the worst outcome must be "write
 * it yourself", not a popup that dies with their leads file inside it.
 */
export async function writeOutreachTemplate(
  mode: TemplateMode,
  instructions: string,
): Promise<{ template: string | null; message?: string }> {
  if (!TEMPLATE_MODES.includes(mode)) {
    return { template: null, message: "That isn't a way we can write a template." };
  }

  const businessId = await currentBusinessId();
  const session = await getSession();
  const profile = await getBusinessProfileRepo().get(businessId);

  return generateEmailTemplate(
    mode,
    {
      email: session?.businessId ?? businessId,
      websiteUrl: profile?.websiteUrl ?? "",
      companyName: profile?.businessName ?? "",
      businessType: profile?.businessType ?? profile?.industry ?? "",
      specialization: profile?.description ?? "",
    },
    { instructions },
  );
}

/**
 * Formats the outreach template as an HTML email.
 *
 * Sits beside the same textarea `writeOutreachTemplate` fills, and degrades the
 * same way: a failure returns a message and the plain text still sends, rather
 * than throwing inside a popup that holds the customer's leads file. The
 * `/to-html` route keys on the Firebase uid, so an account with none cannot use
 * it — said plainly rather than sent an empty `user_id`.
 */
export async function templateToHtml(
  template: string,
): Promise<{ html: string | null; message?: string }> {
  const text = template.trim();
  if (text === "") {
    return { html: null, message: "Write or type a template first." };
  }

  const session = await getSession();
  if (!session?.userId) {
    return {
      html: null,
      message: "We couldn't identify your account to format this. Sign out and back in.",
    };
  }

  const html = await emailTemplateToHtml(session.userId, text);
  if (html === null) {
    return {
      html: null,
      message: "We couldn't format that as HTML just now — the plain text will still send.",
    };
  }
  return { html };
}

/**
 * Pausing, resuming and cancelling the running outreach campaign.
 *
 * ## Why the state is written only on success
 *
 * The button reads its label from the stored state. Flipping that before the
 * backend confirms would show "Resume" over a campaign that is still sending —
 * the customer then believes they have stopped it and stops watching. So the
 * record moves only after the backend says it moved.
 *
 * `tenant_id` is the Firebase uid. Without one there is nothing to send, and
 * saying so is better than a request that cannot match a job.
 */
export async function controlLeadCampaign(action: CampaignAction): Promise<ControlResult> {
  const session = await getSession();
  const campaign = await currentCampaign();

  if (campaign === null) {
    return { ok: false, message: "There is no campaign running for this account." };
  }
  if (!session?.userId) {
    return {
      ok: false,
      message: "We can't identify this account to the campaign service. Please sign in again.",
    };
  }

  const result = await controlCampaign(action, campaign.jobId, session.userId);
  if (result.ok) {
    if (action === "cancel") {
      await clearCampaign();
    } else {
      await setCampaignState(action === "pause" ? "paused" : "running");
    }
    revalidatePath("/agents/lead-qualification");
  }
  return result;
}

/** Stops sending to specific people, leaving the rest of the run going. */
export async function stopLeadRecipients(emails: string[]): Promise<ControlResult> {
  const session = await getSession();
  const campaign = await currentCampaign();

  if (campaign === null) {
    return { ok: false, message: "There is no campaign running for this account." };
  }
  if (!session?.userId) {
    return {
      ok: false,
      message: "We can't identify this account to the campaign service. Please sign in again.",
    };
  }

  const result = await cancelRecipients(campaign.jobId, session.userId, { emails });
  if (result.ok) revalidatePath("/agents/lead-qualification");
  return result;
}

/**
 * Remembers the campaign a Lead Qualification run created, by the mail
 * service's own id, and hands back its warnings. With no id in the reply
 * nothing is stored — an id the service never issued can control nothing —
 * and the live list and "Stop all" still reach the run by tenant.
 */
async function rememberLeadCampaign(reply: unknown): Promise<string[]> {
  const { jobId, warnings } = readCampaignReply(reply);
  if (jobId !== null) {
    await setCampaign(jobId);
  } else {
    console.warn("[lead-qualification] the run's reply carried no campaign job_id");
    await clearCampaign();
  }
  return warnings;
}

/**
 * Up to three warnings for the launched page, short enough for a URL, and
 * SIGNED — the page shows only text our own code wrote (see `signed-text.ts`).
 */
function warnParam(warnings: string[]): string {
  return warnings
    .slice(0, 3)
    .map((line) => `&warn=${encodeURIComponent(signText(line.slice(0, 200)))}`)
    .join("");
}

/** Who the campaign service knows this account as, or a sentence saying we can't tell. */
async function campaignTenant(): Promise<{ ok: true; uid: string } | { ok: false; result: ControlResult }> {
  const session = await getSession();
  if (!session?.userId) {
    return {
      ok: false,
      result: {
        ok: false,
        message: "We can't identify this account to the campaign service. Please sign in again.",
      },
    };
  }
  return { ok: true, uid: session.userId };
}

/** Pause, resume or cancel one campaign from the live list, by its own id. */
export async function controlLeadCampaignById(
  jobId: string,
  action: CampaignAction,
): Promise<ControlResult> {
  const tenant = await campaignTenant();
  if (!tenant.ok) return tenant.result;
  if (jobId.trim() === "") return { ok: false, message: "That campaign has no id to act on." };

  const result = await controlCampaign(action, jobId, tenant.uid);
  if (result.ok) {
    // Keep the remembered campaign in step when it is the one acted on.
    const remembered = await currentCampaign();
    if (remembered?.jobId === jobId) {
      if (action === "cancel") await clearCampaign();
      else await setCampaignState(action === "pause" ? "paused" : "running");
    }
    revalidatePath("/agents/lead-qualification");
    revalidatePath("/agents");
  }
  return result;
}

/** Stops every campaign this account has sending — no job id needed. */
export async function stopAllLeadCampaigns(): Promise<ControlResult> {
  const tenant = await campaignTenant();
  if (!tenant.ok) return tenant.result;

  const result = await cancelActiveCampaigns(tenant.uid);
  if (result.ok) {
    await clearCampaign();
    revalidatePath("/agents/lead-qualification");
    revalidatePath("/agents");
  }
  return { ok: result.ok, message: result.message };
}

/**
 * On-Page SEO's popup run: the WordPress answer plus the chosen service bundle.
 *
 * No file upload — it takes a plain object, not FormData. Business fields
 * (company, website, type, specialisation) ride along from the profile, the
 * same as every other agent. Returns its outcome so the modal stays open.
 */
export async function configureOnPageSeo(input: {
  isWordPress: boolean;
  serviceId: string;
  wpUsername?: string;
  wpPassword?: string;
  /** Local-SEO targeting, both optional. Forwarded to n8n untouched. */
  city?: string;
  zipcode?: string;
}): Promise<AgentConfigureResult> {
  // Purchase only — no mailbox (`agent-run-gate.ts`).
  const gate = await checkAgentRun("on-page-seo", (await getSession())?.businessId ?? (await currentBusinessId()));
  if (!gate.ok) return { ok: false, message: gate.message };

  if (!findSeoService(input.serviceId)) {
    return { ok: false, message: "Choose which services you need." };
  }

  // A WordPress site must supply the admin login the agent publishes through;
  // a non-WordPress one is never asked, so this only gates the WordPress path.
  const wpUsername = input.wpUsername?.trim() ?? "";
  const wpPassword = input.wpPassword ?? "";
  if (input.isWordPress && (!wpUsername || !wpPassword)) {
    return { ok: false, message: "Enter your WordPress username and password." };
  }

  const businessId = await currentBusinessId();
  const session = await getSession();
  const email = session?.businessId ?? businessId;
  const profile = await getBusinessProfileRepo().get(businessId);

  // Each submit starts an n8n run; a double press started two.
  const guard = beginAction(email, "configure:on-page-seo", { staleAfterMs: 120_000, minIntervalMs: 60_000 });
  if (!guard.ok) return { ok: false, message: guardMessage(guard.reason) };

  try {
    await triggerAgent(
      "on-page-seo",
      onPageSeoPayload(
        seoContext(email, session?.userId, profile, {
          isUpdate: await isReconfigure(businessId, "on-page-seo"),
          city: input.city?.trim() ?? "",
          zipcode: input.zipcode?.trim() ?? "",
        }),
        {
          isWordPress: input.isWordPress,
          serviceId: input.serviceId,
          wpUsername,
          wpPassword,
        },
      ),
    );
  } catch (error) {
    // A timeout most likely started the run anyway — see `AgentSetupError.timedOut`.
    if (!(error instanceof AgentSetupError && error.timedOut)) {
      guard.release();
      return { ok: false, message: await failureMessage("on-page-seo", "configure run", error, SEO_FALLBACK) };
    }
    console.warn("[on-page-seo] configure run timed out — treating it as started:", error);
  }
  guard.release();

  await getAgentRepo().activate(businessId, "on-page-seo");
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: "On-Page SEO started. It reports what it does on the agent's page as it goes.",
  };
}

/**
 * Off-Page SEO's popup run: an optional product/service document, nothing else.
 *
 * The document is uploaded first (when supplied) so the payload can carry its
 * URL, the same order Lead Qualification uses. Returns its outcome so the modal
 * stays open.
 */
export async function configureOffPageSeo(formData: FormData): Promise<AgentConfigureResult> {
  const businessId = await currentBusinessId();
  const session = await getSession();
  const email = session?.businessId ?? businessId;

  // Bought, then a mailbox: Off-Page sends outreach AS that mailbox. The
  // purchase check was missing here — it had been pasted into On-Page's
  // action instead, so Off-Page ran for anyone with a mailbox.
  const gate = await checkAgentRun("off-page-seo", email);
  if (!gate.ok) return { ok: false, message: gate.message };
  const profile = await getBusinessProfileRepo().get(businessId);

  // Off-Page sends outreach email, so a double press emailed people twice.
  const guard = beginAction(email, "configure:off-page-seo", { staleAfterMs: 120_000, minIntervalMs: 60_000 });
  if (!guard.ok) return { ok: false, message: guardMessage(guard.reason) };

  const companyDoc = formData.get("companyDoc");

  try {
    const document =
      companyDoc instanceof File && companyDoc.size > 0
        ? await uploadFile(companyDoc, { folder: "off-page-seo", email, kind: "pdf-document" })
        : null;

    await triggerAgent(
      "off-page-seo",
      offPageSeoPayload(
        seoContext(email, session?.userId, profile, {
          // The captured body sends an outreach address. The connected Gmail
          // mailbox is the honest one when there is one; the account email is
          // the fallback, because blank would leave the agent nowhere to send
          // from.
          // `||`, not `??`: a connected mailbox with no address on record has
          // an EMPTY address, and a blank outreach address is not one.
          outreachEmail: (await getConnectedMailbox())?.address || email,
          isUpdate: await isReconfigure(businessId, "off-page-seo"),
        }),
        {
          attachedDocument: document?.fileUrl ?? "",
          documentName:
            companyDoc instanceof File && companyDoc.size > 0 ? companyDoc.name : "",
        },
      ),
    );
  } catch (error) {
    if (!(error instanceof AgentSetupError && error.timedOut)) {
      guard.release();
      return { ok: false, message: await failureMessage("off-page-seo", "configure run", error, SEO_FALLBACK) };
    }
    console.warn("[off-page-seo] configure run timed out — treating it as started:", error);
  }
  guard.release();

  await getAgentRepo().activate(businessId, "off-page-seo");
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: "Off-Page SEO started. It reports what it does on the agent's page as it goes.",
  };
}

/** The business context both SEO agents send, read once from the profile. */
function seoContext(
  email: string,
  userId: string | undefined,
  profile: Awaited<ReturnType<ReturnType<typeof getBusinessProfileRepo>["get"]>>,
  extra: {
    outreachEmail?: string;
    isUpdate?: boolean;
    city?: string;
    zipcode?: string;
  } = {},
): SeoBusinessContext {
  return {
    // The backend's own `job_<ms>_<random>` shape, not a UUID. The captured
    // On-Page body uses it, and the workflows correlate their logs on it.
    jobId: agentJobId(),
    email,
    userId,
    companyName: profile?.businessName ?? "",
    websiteUrl: profile?.websiteUrl ?? "",
    businessType: profile?.businessType ?? profile?.industry ?? "",
    specialization: profile?.description ?? "",
    brandLogoUrl: profile?.brand?.logo ?? "",
    ...extra,
  };
}

/**
 * Has this account configured this agent before?
 *
 * The captured bodies carry `isUpdate`, and a first configure is genuinely a
 * different event from a reconfigure. `needs-setup` is the only status that
 * means "never been set up".
 */
async function isReconfigure(businessId: string, agentId: string): Promise<boolean> {
  const state = await getAgentRepo().getState(businessId, agentId);
  return state.status !== "needs-setup";
}

const SEO_FALLBACK = "We couldn't start this agent just now. Please try again.";

/**
 * The customer's sentence for a failed agent call, with a reference to the
 * row it wrote on the admin Errors screen (`reportAgentFailure`), so "it said
 * something went wrong" can be traced to the real reason (2026-10-08).
 *
 * A file the customer chose that we refused (`UploadError`) is their answer
 * to fix, not an agent fault: its own sentence, and nothing recorded.
 */
async function failureMessage(
  agentId: string,
  step: string,
  error: unknown,
  fallback: string,
): Promise<string> {
  if (error instanceof UploadError && error.userMessage) {
    console.warn(`[${agentId}] ${step}: refused upload — ${error.userMessage}`);
    return error.userMessage;
  }
  const base = (error instanceof AgentSetupError ? error.userMessage : undefined) ?? fallback;
  const session = await getSession();
  const reference = await reportAgentFailure({
    agentId,
    step,
    email: session?.businessId ?? "",
    error,
  });
  return withReference(base, reference);
}

/**
 * One more turn of the conversation, on the SAME session id.
 *
 * A new id would restart the conversation and the agent would re-ask what it
 * already knows — the lesson `marketing-strategy.ts` records, applying equally
 * here.
 */
async function nextTurn(
  agentId: AgentBackendId,
  kind: "revise" | "suggestion",
  suggestion?: string,
): Promise<void> {
  const actionType = kind === "revise" ? "revise" : "user_suggestion";
  const businessId = await currentBusinessId();
  const session = await getSession();
  const current = await getSuggestion(businessId, agentId);

  if (!current) {
    redirect(`/agents/${agentId}`);
  }

  // Each turn is a paid agent run, so it needs the same purchase check as the
  // setup form that started the conversation.
  const gate = await checkAgentRun(agentId, session?.businessId ?? businessId);
  if (!gate.ok) {
    redirect(`/agents/${agentId}?problems=${problemParam(gate.message)}`);
  }

  let answered = true;
  try {
    // The whole brief again, with the turn's own fields beside it
    // (`ads-revise-payload.ts`). This sent only the ids and the action, and
    // the customer's words replaced `chatInput` — the brief itself.
    const reply = await askAgent(
      agentId,
      buildRevisePayload({
        kind,
        intro: current.intro,
        fields: current.fields,
        email: session?.businessId ?? businessId,
        userId: session?.userId,
        sessionId: current.sessionId,
        userDetails: current.userDetails,
        previousPlan: current.output,
        suggestion,
      }),
    );

    const { output, userDetails, semiAllowed } = readSuggestion(reply);
    answered = output !== "";
    if (answered) {
      // A turn that says nothing about the mode keeps the earlier verdict.
      const fullOnly =
        !semiAllowed || (Object.keys(userDetails).length === 0 && current.semiAllowed === false);
      await setSuggestion(businessId, agentId, {
        // The rest of the brief rides along. This object was rebuilt from six
        // fields, so a revised plan silently lost `launchExtras` — the budget
        // as a number, the chosen audiences, the lead form — and launched
        // without them.
        ...current,
        semiAllowed: fullOnly ? false : undefined,
        output,
        // Keep the previous understanding when a turn returns none: a revision
        // is about the plan, and blanking the setup would look like it forgot.
        userDetails: Object.keys(userDetails).length > 0 ? userDetails : current.userDetails,
        sessionId: current.sessionId,
        revisions: current.revisions + 1,
        // The campaign itself is untouched by a rethink — it is what page one
        // asked for, and the approval still has to send it back. Dropping it
        // here would approve an empty brief.
        intro: current.intro,
        fields: current.fields,
      });
    }
  } catch (error) {
    console.error(`[${agentId}] ${actionType} failed:`, error);
    redirect(
      `/agents/${agentId}/suggestion?problems=` +
        problemParam("The agent couldn't be reached. Your plan is unchanged."),
    );
  }

  // Reached, but nothing readable came back. The old plan stays — and the
  // screen says so, or the button looks like it did nothing.
  if (!answered) {
    console.warn(`[${agentId}] ${actionType} answered with no plan`);
    redirect(
      `/agents/${agentId}/suggestion?problems=` +
        problemParam("The agent didn't send a new plan. Your plan is unchanged."),
    );
  }

  revalidatePath("/", "layout");
  redirect(`/agents/${agentId}/suggestion`);
}

/** "Revise suggestion" — the agent rethinks it on its own. */
export async function reviseSuggestion(agentId: AgentBackendId): Promise<void> {
  await nextTurn(agentId, "revise");
}

/** "I have a suggestion" — the customer says what to change, in their words. */
export async function sendUserSuggestion(
  agentId: AgentBackendId,
  formData: FormData,
): Promise<void> {
  const text = String(formData.get("suggestion") ?? "").trim();
  if (text === "") {
    redirect(`/agents/${agentId}/suggestion`);
  }
  await nextTurn(agentId, "suggestion", text);
}

/**
 * Full automation's approval: one more turn of the conversation, and done.
 *
 * The observed `metaads` execution (2026-09-04) sends the approval to the SAME
 * chat webhook the setup form used, carrying the campaign again plus the
 * decision — and the workflow triggers the campaign executor downstream itself.
 * We do NOT post `adsreceiver` here; doing both would launch twice.
 *
 * Never returns: every path ends in a redirect.
 */
/**
 * Approve with full automation.
 *
 * Named for the mode, not for "launches immediately". The chat webhook can
 * answer with a form schema — observed live 2026-09-08, twelve fields
 * including Daily Budget, Start/End Date and Seed Keywords — and when it does,
 * the campaign is waiting on those answers rather than running. Reporting a
 * launch there is a false success about money, which is the one outcome this
 * file must never produce.
 */
async function approveFullAutomation(
  agentId: AgentBackendId,
  businessId: string,
  email: string,
  userId: string | undefined,
  current: Suggestion,
): Promise<never> {
  let reply: unknown;
  try {
    reply = await askAgent(
      agentId,
      buildApprovePayload({
        intro: current.intro,
        fields: current.fields,
        email,
        userId,
        sessionId: current.sessionId,
        automationMode: "full",
        userDetails: current.userDetails,
        profile: await getBusinessProfileRepo().get(businessId),
      }),
    );
  } catch (error) {
    // Only a genuine transport failure reaches here — `redirect()` is called
    // outside this try precisely so its `NEXT_REDIRECT` cannot be caught and
    // reported as an unreachable agent.
    const message = await failureMessage(
      agentId,
      "approve plan",
      error,
      "We couldn't reach the agent. Your plan is unchanged.",
    );
    redirect(`/agents/${agentId}/suggestion?problems=${problemParam(message)}${blockedParam(error)}`);
  }

  // The full path is DOCUMENTED as launching without asking anything further,
  // and it does not always do that. Observed live 2026-09-08: approving with
  // full automation answered with a twelve-field form schema — Status, Budget
  // Type, Daily Budget, Start/End Date, Seed Keywords, Location Type and the
  // rest. The reply was being discarded and the customer was redirected to
  // `?launched=1`, so a campaign that was waiting on answers was reported as
  // running. That is the worst shape of failure this file can produce: a false
  // success about money.
  //
  // So the reply is read. If the workflow asked for details, they are shown —
  // the same form the semi path uses, because it is the same schema — and the
  // mode is recorded as what the workflow actually did, not what was clicked.
  const asked = withLocationField(parseSemiFields(reply));
  if (asked.length > 0) {
    console.log(
      `[${agentId}] full automation returned ${asked.length} field(s) to fill — ` +
        "showing the details form instead of reporting a launch",
    );
    await setSuggestion(businessId, agentId, {
      ...current,
      semiFields: asked,
      semiAsked: true,
      // `full`, because that is what the customer chose and it is what
      // `submitSemiForm` branches on: no creative-upload fields, and the
      // completed answers go to the CHAT webhook rather than the semi one.
      // `Suggestion.mode` has said all along that both modes collect campaign
      // details and the mode only decides the creative and the endpoint — the
      // short-circuit above, which sent full straight to a launch, was the
      // half that disagreed.
      mode: "full",
    });
    revalidatePath("/", "layout");
    redirect(`/agents/${agentId}/semi`);
  }

  // No questions asked. Unreachable today — `withLocationField` always adds the
  // location question — but this branch used to report `?launched=1` with no
  // `adsreceiver` call and no submission record: Google and Meta campaigns are
  // CREATED by the receiver (`ads-launch-target.ts`), so that was a launch
  // reported and never made. It now continues exactly as the details form
  // does, with nothing to answer: prompts, a pick, then `launchCampaign`.
  // The delivery-mode question rides the details form, so here it is
  // unanswered and reads as "ask" — never a silent "auto".
  await setSuggestion(businessId, agentId, { ...current, mode: "full", answers: {} });
  const started = await startCreativePrompts(agentId);
  if (started.busy) redirect(`/agents/${agentId}/creative`);
  if (!started.ok) {
    console.error(`[${agentId}] creative prompts unavailable: ${started.message ?? "no reason"}`);
    await launchCampaign(agentId);
  }
  revalidatePath("/", "layout");
  redirect(`/agents/${agentId}/creative`);
}

/**
 * Google and Meta's "Yes, proceed" (product owner, 2026-10-06).
 *
 * The order is Plan → Details → Full or Semi. So this hop approves the plan
 * with NO automation mode (`automationMode: null`, as agreed) and its only
 * job is to bring back the details questions n8n asks for — the same schema
 * the mode-specific approvals returned. The customer's Full/Semi choice, and
 * a Semi creative, are collected after the details and ride the launch
 * (`chooseAutomationMode` → `launchCampaign`), which already carries both.
 *
 * Never returns: every path ends in a redirect.
 */
async function approveForDetails(
  agentId: AgentBackendId,
  businessId: string,
  email: string,
  userId: string | undefined,
  current: Suggestion,
): Promise<never> {
  let reply: unknown;
  try {
    reply = await askAgent(
      agentId,
      buildApprovePayload({
        intro: current.intro,
        fields: current.fields,
        email,
        userId,
        sessionId: current.sessionId,
        automationMode: null,
        userDetails: current.userDetails,
        profile: await getBusinessProfileRepo().get(businessId),
      }),
    );
  } catch (error) {
    // `redirect()` stays outside this try so its NEXT_REDIRECT is not caught
    // and reported as an unreachable agent.
    const message = await failureMessage(
      agentId,
      "fetch campaign details",
      error,
      "We couldn't reach the agent. Your plan is unchanged.",
    );
    redirect(`/agents/${agentId}/suggestion?problems=${problemParam(message)}${blockedParam(error)}`);
  }

  const returned = parseSemiFields(reply);
  if (returned.length === 0) {
    console.log(`[${agentId}] the approval returned no campaign-detail fields`);
  }
  await setSuggestion(businessId, agentId, {
    ...current,
    // Every campaign has to run somewhere: the location question is added
    // when the agent did not ask it (`withLocationField`).
    semiFields: withLocationField(returned),
    semiAsked: true,
    // Not chosen yet — asked after the details (`/mode`). A mode left over
    // from an earlier attempt must not decide this one.
    mode: undefined,
    selectionMode: undefined,
    semiAutomationMedia: undefined,
    creatives: undefined,
    // A new approval means new details: answers left from an earlier pass
    // told /mode and /creative the form was done, and the NEW plan launched
    // with the OLD details (review, 2026-10-08). They come back as the
    // details form's starting values instead, so nothing has to be retyped.
    answers: undefined,
    semiDraft: current.semiDraft ?? current.answers,
  });
  revalidatePath("/", "layout");
  redirect(`/agents/${agentId}/semi`);
}

/**
 * The automation mode, asked LAST for Google and Meta (2026-10-06): after the
 * campaign details, before the creative step (Full) or the launch (Semi).
 *
 * Takes over what the plan's dialog used to do for them: Full also answers
 * whether the agent may act unattended (`selectionMode`, from the
 * `SelectionModeGate` dialog this page's Full submit opens); Semi brings the
 * creative already uploaded to S3, re-checked here because a post is
 * forgeable.
 */
export async function chooseAutomationMode(
  agentId: AgentBackendId,
  formData: FormData,
): Promise<void> {
  const businessId = await currentBusinessId();
  const current = await getSuggestion(businessId, agentId);
  if (!current?.answers) {
    redirect(`/agents/${agentId}/semi`);
  }

  const back = (message: string): never =>
    redirect(`/agents/${agentId}/mode?problems=${problemParam(message)}`);

  // Anything but an explicit `semi` is full, and never semi when the agent
  // said this campaign needs full automation.
  const semi =
    String(formData.get("automationMode") ?? "full") === "semi" && current.semiAllowed !== false;

  if (!semi) {
    await setSuggestion(businessId, agentId, {
      ...current,
      mode: "full",
      // `readSelectionMode`: anything but an explicit "auto" is "ask".
      selectionMode: readSelectionMode(formData.get("selectionMode")),
      semiAutomationMedia: undefined,
      creatives: undefined,
    });
    const started = await startCreativePrompts(agentId);
    if (started.busy) redirect(`/agents/${agentId}/creative`);
    if (!started.ok) {
      // An enhancement, not a gate: a creative writer that cannot be reached
      // must not strand a finished campaign.
      console.error(`[${agentId}] creative prompts unavailable: ${started.message ?? "no reason"}`);
      return launchCampaign(agentId);
    }
    revalidatePath("/", "layout");
    redirect(`/agents/${agentId}/creative`);
  }

  let semiMedia: SemiAutomationMedia | GoogleSemiAutomationMedia | null = null;
  let creativeUrls: CreativeUrls | null = null;
  let linkedInSemiMedia: LinkedInSemiMedia | null = null;
  if (agentId === "linkedin-ads") {
    // Optional: Semi may launch with no file (an Event ad needs none). The
    // uploader's rules are checked again — a post is forgeable.
    linkedInSemiMedia = parseLinkedInSemiMedia(formData.get(LINKEDIN_SEMI_INPUT));
    const mediaProblem = validateLinkedInSemiMedia(linkedInSemiMedia);
    if (mediaProblem) back(mediaProblem);
  } else if (agentId === "meta-ads") {
    semiMedia = parseSemiAutomationMedia(formData.get("semiAutomationMedia"));
    const mediaProblem = validateSemiAutomationMedia(semiMedia);
    if (mediaProblem) back(mediaProblem);
  } else if (agentId === "google-ads") {
    const google = readGoogleSemiMedia(formData);
    if (!google.ok) back(google.problems.join(" "));
    else {
      creativeUrls = google.creatives;
      semiMedia = google.media;
    }
  }

  await setSuggestion(businessId, agentId, {
    ...current,
    mode: "semi",
    // Semi supplies its own creative; there is nothing for the agent to pick.
    selectionMode: undefined,
    ...(semiMedia ? { semiAutomationMedia: semiMedia } : {}),
    ...(creativeUrls ? { creatives: creativeUrls } : {}),
    ...(linkedInSemiMedia ? { linkedInSemiMedia } : {}),
  });
  return launchCampaign(agentId);
}

/**
 * "Yes, proceed" — approve the plan, then take the path the mode requires.
 *
 * The two modes are NOT one call with a flag (AGENTS-INTEGRATION.md §4):
 *
 *   full → POST chat (approved), and n8n runs the campaign from there
 *   semi → POST semi, which answers with the extra fields to complete
 *
 * The chat hop is the agent being told its plan was accepted; skipping it
 * launched a campaign the agent had not been told to build.
 */
export async function approveSuggestion(
  agentId: AgentBackendId,
  formData: FormData,
): Promise<void> {
  const businessId = await currentBusinessId();
  const session = await getSession();
  const current = await getSuggestion(businessId, agentId);

  if (!current) {
    redirect(`/agents/${agentId}`);
  }

  // Anything but an explicit `semi` is full, rather than trusting the posted
  // value — a malformed post must not silently pick a mode.
  // And never semi when the agent said this campaign needs full automation —
  // the dialog disables the choice, this holds a post that skipped it.
  const semi =
    String(formData.get("automationMode") ?? "full") === "semi" && current.semiAllowed !== false;
  const email = session?.businessId ?? businessId;

  // Full automation starts the campaign from THIS hop, so it gets the same
  // checks as `launchCampaign`: purchase and ad account first, then one
  // approval at a time. It had neither, so an account that never bought the
  // agent — or a double press — could run a campaign (audit, 2026-09-29).
  const gate = await checkAgentRun(agentId, email);
  if (!gate.ok) {
    redirect(`/agents/${agentId}?problems=${problemParam(gate.message)}`);
  }

  // Google and Meta: approve now, choose Full or Semi LAST (2026-10-06).
  if (modeLast(agentId)) {
    const guard = beginAction(email, `approve:${agentId}`, { staleAfterMs: 120_000 });
    if (!guard.ok) {
      redirect(`/agents/${agentId}/suggestion?problems=${problemParam(guardMessage(guard.reason))}`);
    }
    try {
      return await approveForDetails(agentId, businessId, email, session?.userId, current);
    } finally {
      guard.release();
    }
  }

  // Full automation approves through the chat webhook rather than the semi
  // one. It does NOT mean "no form": that webhook can answer with a schema of
  // its own, and `approveFullAutomation` shows it when it does — see the note
  // there, and `Suggestion.mode`.
  if (!semi) {
    const guard = beginAction(email, `approve:${agentId}`, { staleAfterMs: 120_000 });
    if (!guard.ok) {
      redirect(
        `/agents/${agentId}/suggestion?problems=${problemParam(guardMessage(guard.reason))}`,
      );
    }
    try {
      return await approveFullAutomation(agentId, businessId, email, session?.userId, current);
    } finally {
      // Every way out of `approveFullAutomation` is a redirect, including the
      // success. Held for the redirect's own round trip is enough: a second
      // press after that finds the plan spent or the details form waiting.
      guard.release();
    }
  }

  // Meta and Google supply their creative HERE, at the Semi choice, so what the
  // browser already put in S3 rides this approve submit. It is validated and
  // stored now so it outlives the redirect to the details form, where the
  // campaign finally launches. The button that got here is disabled until the
  // upload is complete, but a form post is forgeable, so re-check.
  //
  // The two carry different things because the platforms buy different things:
  // Meta one asset as a `semiAutomationMedia` object, Google five slots as a
  // name -> URL map. Google's map is the same `creatives` shape `launchCampaign`
  // has always sent — only where it is built has moved.
  let semiMedia: SemiAutomationMedia | GoogleSemiAutomationMedia | null = null;
  if (agentId === "meta-ads") {
    semiMedia = parseSemiAutomationMedia(formData.get("semiAutomationMedia"));
    const mediaProblem = validateSemiAutomationMedia(semiMedia);
    if (mediaProblem) {
      redirect(`/agents/${agentId}/suggestion?problems=${problemParam(mediaProblem)}`);
    }
  }

  let creativeUrls: CreativeUrls | null = null;
  if (agentId === "google-ads") {
    // The five image slots, the optional video and YouTube link, checked
    // again here; `media` is the spec's `semiAutomationMedia` shape
    // (GOOGLE_ADS_AGENT_SPEC §11.2), sent on this hop and on the launch.
    const google = readGoogleSemiMedia(formData);
    if (!google.ok) {
      redirect(`/agents/${agentId}/suggestion?problems=${problemParam(google.problems.join(" "))}`);
    }
    creativeUrls = google.creatives;
    semiMedia = google.media;
  }

  // Ask what else the campaign needs. Neither endpoint launches anything —
  // both answer with a form schema, which is why the details form can be shown
  // before anything runs.
  //
  // Meta asks through the CHAT webhook, exactly as full automation does. Its
  // semi endpoint answers `{received:true}` and nothing else, so this hop came
  // back empty, the details form had no fields, and a location question was
  // being invented locally to fill the gap. The chat webhook returns the real
  // schema — Status, Start/End Date, Budget Amount, Pixel ID, Location Type,
  // Product/Service Description — so the location arrives from the backend
  // like every other field and nothing is fabricated. Confirmed against the
  // captured live bodies, 2026-09-08.
  let reply: unknown;
  try {
    // LinkedIn approves through chat as well: the legacy flow sends the semi
    // approval to `linkedin-ads-chat` with `automationMode: "semi"`, and only
    // the launch goes to `linkedin-ads-semi` (LINKEDIN_ADS_FLOW.md 4.1d, 6.4b).
    // Google too, since 2026-10-02 (GOOGLE_ADS_AGENT_SPEC §9.1): its semi
    // approval went to `google-ads-semi` with the plan as `chatInput` and none
    // of the approved body — no decision, no business details, no creative.
    // The legacy flow sends it to the chat webhook like the other two.
    reply = await askAgent(
      agentId,
      buildApprovePayload({
        intro: current.intro,
        fields: current.fields,
        email,
        userId: session?.userId,
        sessionId: current.sessionId,
        automationMode: "semi",
        userDetails: current.userDetails,
        profile: await getBusinessProfileRepo().get(businessId),
        // The creative is already in S3; the approve hop carries its URLs.
        ...(semiMedia ? { semiAutomationMedia: semiMedia } : {}),
      }),
    );
  } catch (error) {
    // ONLY a genuine transport failure lands here. `redirect()` used to be
    // called inside this try, and its `NEXT_REDIRECT` was caught here and
    // reported as "we couldn't reach the agent" — for an agent that had
    // answered perfectly well.
    const message = await failureMessage(
      agentId,
      "fetch campaign details",
      error,
      "We couldn't reach the agent. Your plan is unchanged.",
    );
    redirect(`/agents/${agentId}/suggestion?problems=${problemParam(message)}${blockedParam(error)}`);
  }

  // The chat webhook answers with a form schema, or with none — an empty
  // schema is NOT an error; it means that platform has no extra questions.
  const returned = parseSemiFields(reply);
  if (returned.length === 0) {
    console.log(`[${agentId}] no campaign-detail fields returned for semi`);
  }

  // …but every campaign has to run somewhere. Meta asked for nothing, which
  // left its campaigns with no location question on this form at all, so the
  // location is added when the agent did not ask for it. Google's own wording
  // wins when it did.
  const semiFields = withLocationField(returned);

  await setSuggestion(businessId, agentId, {
    ...current,
    semiFields,
    semiAsked: true,
    mode: "semi",
    ...(semiMedia ? { semiAutomationMedia: semiMedia } : {}),
    ...(creativeUrls ? { creatives: creativeUrls } : {}),
  });

  revalidatePath("/", "layout");
  redirect(`/agents/${agentId}/semi`);
}

/**
 * The semi form: the agent's extra fields, the creative, then the launch.
 *
 * Three steps and they must be in this order — the creative has to be in S3
 * before the semi call references it, and the semi call has to have prepared
 * the campaign before the receiver executes it.
 */
export async function submitSemiForm(
  agentId: AgentBackendId,
  formData: FormData,
): Promise<void> {
  const businessId = await currentBusinessId();
  const session = await getSession();
  const current = await getSuggestion(businessId, agentId);

  if (!current?.semiAsked) {
    redirect(`/agents/${agentId}`);
  }
  // The same fields the form showed (`adjustSemiFields`: Meta's OS without
  // "All"), and every dropdown answer held to them.
  const semiFields = adjustSemiFields(agentId, current.semiFields ?? []);

  const email = session?.businessId ?? businessId;
  const answers = holdDropdownsToOptions(semiFields, readSemiAnswers(semiFields, formData));
  // Asked in the dialog this form's submit button opens. It has to be STORED
  // rather than used here: full automation writes three creative prompts and
  // waits for a pick before launching, so the answer must outlive this submit
  // the same way the form answers do.
  const selectionMode = readSelectionMode(formData.get("selectionMode"));

  // Sent back with problems: what was posted is kept on the plan first, so the
  // form comes back filled in — eleven fields and a list of places, retyped
  // because one date was wrong, is how people give up (2026-10-01).
  const sendBack = async (message: string): Promise<never> => {
    await setSuggestion(businessId, agentId, { ...current, semiDraft: answers });
    redirect(`/agents/${agentId}/semi?problems=` + problemParam(message));
  };

  const isSemi = current.mode === "semi";
  // Meta and Google collected their creative at the Semi choice — Meta as
  // `semiAutomationMedia`, Google as `creatives` — so the generic file-creative
  // path below does not apply to them. There is nothing to upload on this form
  // and, crucially, nothing to re-check: the files are already in S3 and the
  // stored suggestion is what `launchCampaign` reads.
  const collectedEarlier = agentId === "meta-ads" || agentId === "google-ads";
  const usesMedia = isSemi && collectedEarlier;

  // Everything checked before anything is uploaded: a half-uploaded set leaves
  // orphan files in S3 and a campaign that cannot be assembled.
  const missing = [
    ...missingSemiAnswers(semiFields, answers),
    ...(isSemi && !usesMedia ? missingCreatives(agentId, formData) : []),
  ];
  if (missing.length > 0) {
    await sendBack(`Still needed: ${missing.join(", ")}.`);
  }
  // An end date before the start, or a postcode target with no postcode: the
  // browser stops both, but a post without that browser must not become a
  // campaign the ad platform then refuses (`semiFormProblems`).
  const invalid = semiFormProblems(semiFields, answers);
  if (invalid.length > 0) {
    await sendBack(invalid.join(" | "));
  }

  const creativeUrls: Record<string, string> = {};
  try {
    // Only LinkedIn semi uploads creative here — Meta's and Google's already
    // went straight to S3 from the browser, and full automation has the agent
    // write it.
    for (const field of isSemi && !usesMedia ? creativesFor(agentId) : []) {
      const file = formData.get(field.name);
      if (file instanceof File && file.size > 0) {
        // The folder the backend names for creatives, per platform. Only
        // LinkedIn reaches this now; the constant is left per-platform so the
        // branch does not become a lie if another one joins.
        //
        // LinkedIn's creative was landing in `google-ads-creatives`, because
        // the fallback branch was Google's. It has its own folder in the
        // legacy flow (LINKEDIN_ADS_FLOW.md 6.5).
        const folder = CREATIVE_FOLDERS[agentId] ?? "google-ads-creatives";
        const uploaded = await uploadFile(file, { folder, email });
        creativeUrls[field.name] = uploaded.fileUrl;
      }
    }
  } catch (error) {
    console.error(`[${agentId}] creative upload failed:`, error);
    await sendBack(
      error instanceof UploadError && error.userMessage
        ? error.userMessage
        : "We couldn't upload your creative. Nothing has launched.",
    );
  }

  // Engagement promoting a post that already exists (LBS-1253): no mode to
  // choose and no creative to make, so it launches from this submit.
  const existingPost = existingPostOf(current.launchExtras);
  const skipsMode =
    modeLast(agentId) && current.mode === undefined && !asksMode(agentId, current.semiAllowed, existingPost);

  // The answers are kept whatever happens next, because what happens next
  // differs by mode and one of the two paths does not launch yet.
  await setSuggestion(businessId, agentId, {
    ...current,
    answers,
    // Done with: the form is complete, so nothing needs refilling.
    semiDraft: undefined,
    selectionMode,
    ...(isSemi && !usesMedia ? { creatives: creativeUrls } : {}),
    // A full-only campaign (`asksMode`) skips the automation step, so its
    // mode is settled here; the delivery-mode answer came with this submit.
    ...(skipsMode ? { mode: "full" as const } : {}),
  });

  // Google and Meta: the details are in, and the automation mode is the next
  // question (`/mode`) — asked after the details since 2026-10-06.
  if (asksMode(agentId, current.semiAllowed, existingPost) && current.mode === undefined) {
    revalidatePath("/", "layout");
    redirect(`/agents/${agentId}/mode`);
  }

  // The post is the creative; there are no prompts to write or pick.
  if (existingPost !== "") return launchCampaign(agentId);

  // FULL: the form is done, so now the creative writer has everything it
  // needs — the product and offer from setup, and the ad type the agent just
  // asked for. Three prompts are written, the customer picks one, and the
  // campaign launches after that. Nothing is sent to the executor here.
  //
  // This ordering is the requirement, and it is the only one that works:
  // `ad_format` lives in THIS form, so generating before it was submitted
  // meant guessing the format, which is exactly the bug that started this.
  if (!isSemi) {
    const started = await startCreativePrompts(agentId);
    if (started.busy) redirect(`/agents/${agentId}/creative`);
    if (!started.ok) {
      // The prompts are an enhancement, not a gate. A creative writer that
      // cannot be reached must not strand a completed campaign, so the
      // customer is sent on to launch without one.
      console.error(`[${agentId}] creative prompts unavailable: ${started.message ?? "no reason"}`);
      return launchCampaign(agentId);
    }
    revalidatePath("/", "layout");
    redirect(`/agents/${agentId}/creative`);
  }

  // SEMI: the customer supplied finished creative, so there is no prompt to
  // write and nothing to wait for. It launches here, as it always did.
  return launchCampaign(agentId);
}

/**
 * The launch itself, once everything has been collected.
 *
 * Split out of `submitSemiForm` because it is no longer the same step: full
 * automation now submits the form, writes three creative prompts, waits for a
 * pick, and lands here afterwards. Semi still arrives directly.
 *
 * Reads the campaign back from the stored suggestion rather than taking it as
 * arguments — by the time a prompt has been chosen the form is a page behind,
 * the same reason `Suggestion.fields` exists at all.
 */
/** The S3 folder each platform's uploaded creative goes into. */
const CREATIVE_FOLDERS: Partial<Record<AgentBackendId, string>> = {
  "meta-ads": "meta-ads-creatives",
  "google-ads": "google-ads-creatives",
  "linkedin-ads": "linkedin-ads/semi-images",
};

export async function launchCampaign(agentId: AgentBackendId): Promise<void> {
  const businessId = await currentBusinessId();
  const session = await getSession();
  const current = await getSuggestion(businessId, agentId);

  if (!current?.answers) {
    redirect(`/agents/${agentId}`);
  }

  const email = session?.businessId ?? businessId;
  const answers = current.answers;
  const creativeUrls = current.creatives ?? {};
  const isSemi = current.mode === "semi";
  // LinkedIn semi launches with ONE post to `linkedin-ads-semi` — the execute
  // body below (LINKEDIN_ADS_FLOW.md 6.4b). Everything else creates through the
  // receiver; `launchTarget` owns that rule and its test.
  const linkedInSemi = isSemi && agentId === "linkedin-ads";
  // Where a refused launch sends the customer back to: the step they launched
  // from. An existing-post Engagement campaign launches from the details form
  // and has no creative step to return to (LBS-1253).
  const retryStep = existingPostOf(current.launchExtras)
    ? "semi"
    : isSemi
      ? modeLast(agentId)
        ? "mode"
        : "semi"
      : "creative";

  // The paid launch: checked again, purchase first, then the ad account.
  const gate = await checkAgentRun(agentId, email);
  if (!gate.ok) {
    redirect(`/agents/${agentId}?problems=${problemParam(gate.message)}`);
  }

  // One launch at a time, and none again for two minutes after a success: a
  // second submit that beat the button's own disabling launched a second paid
  // campaign. Released on failure, so a retry is not blocked.
  const guard = beginAction(email, `launch:${agentId}`, { staleAfterMs: 120_000 });
  if (!guard.ok) {
    redirect(
      `/agents/${agentId}/${retryStep}?problems=` +
        problemParam(guardMessage(guard.reason)),
    );
  }

  // Read BEFORE the launch, spent after it: a pick that is cleared early would
  // be lost if the receiver call failed and the customer retried.
  const pick = await currentPick();
  // One cookie serves every agent and lives an hour, and it was cleared only
  // after a successful launch — so a pick from an earlier attempt, another
  // campaign or another platform rode along, even beside a Semi creative
  // (review, 2026-10-08). It counts only for THIS plan's prompts, in Full.
  const chosenPrompt =
    pick?.chosen && pick.jobId === current.sessionId && current.mode !== "semi" ? pick : null;

  try {
    // Straight to the campaign creator — no semi hand-off first. Google used
    // to post `semi_form_submitted` to `google-ads-semi` here and then launch
    // there too, so its campaigns never reached `adsreceiver` (backend team,
    // 2026-09-30). Meta has never had that hop, the legacy flow has none
    // (campaign-flow guide §5–6), and the receiver body below already carries
    // the answers (`formData` / `dynamicFormData`) and Google's `creatives`.
    // Full automation sends NO second approval here. The only way to reach
    // this line in full mode is through `approveFullAutomation`, which already
    // posted `approved` to the chat webhook — and posting it again, then the
    // receiver as well, reached n8n two or three times for one campaign
    // (audit, 2026-09-25). The details-form answers travel in the receiver
    // body below (`dynamicFormData`), so nothing is lost by not repeating it.

    // The receiver wants a much fuller body than the chat webhook — business
    // identity under three names, the merged campaign, the plan under two
    // names. `buildLaunchPayload` owns that shape.
    await triggerAgent(
      agentId,
      buildLaunchPayload({
        email,
        userId: session?.userId,
        sessionId: current.sessionId,
        plan: current.output,
        userDetails: current.userDetails,
        // The setup campaign, under its own labels. The agent's
        // `user_details` does not echo the audience back, so without this the
        // interests the customer picked never reached the executor — see the
        // note on `LaunchContext.campaign`.
        campaign: current.fields,
        // "State" + "New Jersey" becomes the display string, the `_state`
        // single and the `_locations` array the executor reads.
        formData: { ...answers, ...(expandLocationAnswers(answers) as Record<string, string>) },
        creatives: isSemi ? creativeUrls : undefined,
        // Meta's and Google's semi creative (each in its own spec's shape),
        // carried into the executor body.
        semiAutomationMedia: isSemi ? current.semiAutomationMedia : undefined,
        // LinkedIn semi's, in the `mediaAssets` shape its workflow reads.
        mediaAssets: linkedInSemi ? linkedInMedia(current, creativeUrls) : undefined,
        automationMode: isSemi ? "semi" : "full",
        // The customer's answer from the details form. It was hard-coded
        // "ask" in every launch before this.
        selectionMode: current.selectionMode,
        // Meta names the placements it buys; the captured body carries it.
        platforms: agentId === "meta-ads" ? "Facebook Ads, Instagram Ads" : undefined,
        profile: await getBusinessProfileRepo().get(businessId),
        extras: current.launchExtras,
        // Only present when the customer actually chose one. Omitted entirely
        // otherwise — see the note in `ads-launch-payload.ts`.
        ...(chosenPrompt
          ? {
              selectedPrompt: {
                jobId: chosenPrompt.jobId,
                index: chosenPrompt.chosen!.index,
                model: chosenPrompt.chosen!.model,
                prompt: chosenPrompt.chosen!.prompt,
              },
            }
          : {}),
      }),
      // Google and Meta create through `adsreceiver`, full or semi; only
      // LinkedIn semi uses its own workflow (`ads-launch-target.ts`).
      { semi: launchTarget(agentId, isSemi ? "semi" : "full") === "semi" },
    );
  } catch (error) {
    // A timeout is not a failure here. n8n keeps building after we stop
    // waiting, so "we couldn't launch — try again" produced a second paid
    // campaign (audit, 2026-09-29). It is treated as launched: the guard stays
    // held and the submission record below is written, so the form does not
    // come back offering a relaunch. Only a real failure goes back to retry.
    if (error instanceof AgentSetupError && error.timedOut) {
      console.warn(`[${agentId}] the launch timed out — treating it as running:`, error);
    } else {
      guard.release();
      const message = await failureMessage(
        agentId,
        "launch campaign",
        error,
        "We couldn't launch the campaign. Your answers are unchanged.",
      );
      // Back to whichever step they were on — the answers survive either way.
      redirect(
        `/agents/${agentId}/${retryStep}?problems=` +
          problemParam(message) +
          blockedParam(error),
      );
    }
  }

  // The submission record, written only now that the campaign has launched
  // (LINKEDIN_ADS_FLOW.md 6.6), for EVERY ad agent. `status: "submitted"` is
  // what `agentLaunched` reads to keep the setup form from coming back after
  // a launch — it came back for Google and Meta too, and re-submitting it
  // created a second paid campaign (audit, 2026-09-25). Past the point of no
  // return, so a failure is logged and never reported as a failed launch —
  // rule 4.
  {
    const launchedAt = new Date().toISOString();
    const record = {
      launched_at: launchedAt,
      ...(session?.userId ? { userId: session.userId } : {}),
      ...Object.fromEntries(current.fields ?? []),
      // After the campaign fields, for the reason given at the setup save.
      id: numericRowId(email),
      email,
      aiSuggestion: current.output,
      status: "submitted",
      automationMode: isSemi ? "semi" : "full",
      session_id: current.sessionId,
      created_at: launchedAt,
      dynamicFormData: answers,
      ...(linkedInSemi ? { mediaAssets: linkedInMedia(current, creativeUrls) } : {}),
    };
    // Tried twice, then the browser remembers the launch itself. Only logging
    // a failure here let the setup form come back and offer the same paid
    // campaign again (META_ADS_AGENT_SPEC §15.4, `launch-marker.ts`).
    let saved = false;
    for (let attempt = 1; attempt <= 2 && !saved; attempt += 1) {
      try {
        await saveAgentSetup(agentId, record);
        saved = true;
      } catch (error) {
        // A dead session leaves as a redirect — with the launch remembered
        // first, because it did go out.
        if (isRedirectError(error)) {
          await markLaunched(agentId, launchedAt);
          throw error;
        }
        console.error(
          `[${agentId}] launched, but the submission record was not saved (attempt ${attempt}):`,
          error,
        );
      }
    }
    if (!saved) await markLaunched(agentId, launchedAt);
  }

  // What the "We are creating your campaign" dialog names — taken now,
  // because the plan it comes from is cleared on the next line (LBS-1147 d).
  await rememberLaunchSummary(agentId, buildLaunchSummary(current.fields, current.answers, current.mode));
  await clearSuggestion();
  await clearPick();
  await getAgentRepo().activate(businessId, agentId);
  revalidatePath("/", "layout");
  redirect(`/agents/${agentId}?launched=1`);
}

/**
 * LinkedIn's uploaded creative, in the `mediaAssets` shape its workflow reads:
 * from the automation step (2026-10-08), or — for a campaign begun before
 * that — from the image slot the details form used to carry.
 */
function linkedInMedia(
  current: Suggestion,
  creativeUrls: Record<string, string>,
): { images: string[]; videoUrl?: string } {
  if (current.linkedInSemiMedia) return linkedInMediaAssets(current.linkedInSemiMedia);
  return { images: Object.values(creativeUrls).filter((url) => url !== "") };
}

/**
 * The Social Media agent's run (2026-10-01): the posting form's one action.
 *
 * Gate, read, check — every problem at once — then send: full automation to
 * the shared `main` workflow, semi to `social-media-semi` (`triggerAgent`
 * routes by `semi`). The first run that includes YouTube also files the
 * legacy activation request beside it, because that channel is set up by
 * hand. The row is saved LAST and only after the send was accepted, so a
 * stored setup never describes a run that did not happen; past that point a
 * failure is logged, never reported as a failed run (rule 4).
 */
export async function runSocialMedia(formData: FormData): Promise<void> {
  const agentId = "social-media";
  const businessId = await currentBusinessId();
  const session = await getSession();
  const email = session?.businessId ?? businessId;
  const back = (message: string): never => redirect(`/agents/${agentId}?problems=${problemParam(message)}`);

  const gate = await checkAgentRun(agentId, email);
  if (!gate.ok) return back(gate.message);

  const setup = readSocialForm(formData);
  const connected = (await connectedSocialPlatforms(email)).filter(
    (platform): platform is (typeof SOCIAL_POST_PLATFORMS)[number] =>
      (SOCIAL_POST_PLATFORMS as readonly string[]).includes(platform),
  );
  const profile = await getBusinessProfileRepo().get(businessId);
  // Yesterday in UTC, not today: the date box offers "tomorrow" in the
  // customer's own time zone, and for anyone behind UTC that can be UTC's
  // today. The rule this enforces is "not in the past".
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const problems = validateSocial(setup, connected, yesterday);
  if (!isFilled(profile?.businessName) || !isFilled(profile?.websiteUrl)) {
    problems.unshift("Please fill in your business details in Settings before running the agent.");
  }
  if (problems.length > 0) return back(problems.join("|"));

  // One run at a time per account, and not again within a minute: each is a
  // real post going out on the customer's public pages.
  const guard = beginAction(email, `run:${agentId}`, { staleAfterMs: 120_000, minIntervalMs: 60_000 });
  if (!guard.ok) return back(guardMessage(guard.reason));

  const row = await getAgentSetupRow(agentId, email);
  const previous = socialDefaultsFromRow(row);
  const now = new Date();
  const ids = { email, userId: session?.userId, now };
  const logoUrl = profile?.brand?.logo ?? "";
  const body = buildSocialWebhook(
    setup,
    {
      businessName: profile?.businessName ?? "",
      websiteUrl: absoluteUrl(profile?.websiteUrl),
      businessType: profile?.businessType ?? "",
      specialization: profile?.industry ?? "",
      logoUrl,
    },
    ids,
    { isUpdate: row !== null, jobId: agentJobId(now.getTime()) },
  );

  try {
    await triggerAgent(agentId, body, { semi: setup.mode === "semi" });
  } catch (error) {
    guard.release();
    return back(
      await failureMessage(
        agentId,
        "start social media run",
        error,
        "We couldn't start the Social Media agent. Your choices are unchanged — please try again.",
      ),
    );
  }

  // YouTube is set up by the team the first time (legacy `fireActivationWebhook`).
  let youtubeActivated = previous.youtubeActivated;
  let youtubeRequested = false;
  if (setup.platforms.includes("youtube") && !youtubeActivated) {
    try {
      await requestSocialActivation({
        ...(session?.userId ? { user_id: session.userId } : {}),
        user_email: email,
        selected_platform: "youtube",
        automation_mode: setup.mode,
        timestamp: now.toISOString(),
      });
      youtubeActivated = true;
      youtubeRequested = true;
    } catch (error) {
      console.error(`[${agentId}] the YouTube activation request failed:`, error);
    }
  }

  try {
    await saveAgentSetup(agentId, buildSocialRow(setup, ids, { id: numericRowId(email), youtubeActivated, logoUrl }));
  } catch (error) {
    console.error(`[${agentId}] ran, but the setup row was not saved:`, error);
  }

  await getAgentRepo().activate(businessId, agentId);
  revalidatePath("/", "layout");
  redirect(`/agents/${agentId}?sent=${setup.mode}${youtubeRequested ? "&youtube=1" : ""}`);
}
