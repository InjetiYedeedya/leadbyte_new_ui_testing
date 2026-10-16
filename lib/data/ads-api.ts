import { adsCall } from "@/lib/api/ads-client";
import { AdsApiError } from "./ads-errors";
import type {
  AdsCampaignRequest,
  AdviseCampaign,
  AdviseResult,
  ConversionEventsResult,
  CreateResult,
  GenerateBrief,
  GenerateResult,
  ImageJob,
  ImageRequest,
  ImageStatus,
  PrepareResult,
  SaveKeyResult,
  UploadImageResult,
  VerifyResult,
  WebsiteRead,
  WhoAmI,
} from "./ads-types";

/**
 * One function per ChatGPT Ads action.
 *
 * SERVER ONLY — `adsCall` carries a service-scope key.
 *
 * ## The one rule that shapes this file
 *
 * **Reads never throw; writes always do.**
 *
 * A read is something a page asks while rendering. If listing the stored keys
 * fails, the connect screen should say "we couldn't check" and still draw — not
 * take the page down. So reads catch, log, and return `null` or `[]`, and the
 * caller treats an empty answer and a failed one the same way, because for a
 * read they mean the same thing to the reader.
 *
 * A write is something a person pressed a button to do, and the caller has to
 * tell a 422 (fix your form) from a 409 (a campaign half exists) from a 400
 * (our bug). Flattening those into `null` would throw away the only
 * information the screen needs. So writes let `AdsApiError` through.
 */

/**
 * Is the service reachable and is our key good?
 *
 * Costs nothing and touches no customer data, so this is the health check —
 * and the first thing to run when anything else starts answering 401.
 *
 * `scope` is worth reading, not just `authenticated`: a `client`-scope key is
 * pinned to ONE advertiser account and ignores the `user_id` we send, which
 * would quietly file every customer's campaigns under the same account. That
 * is a misconfiguration no other call would report — everything would appear to
 * work.
 */
export async function whoAmI(): Promise<WhoAmI | null> {
  try {
    return await adsCall("whoami", {});
  } catch (error) {
    const detail = error instanceof AdsApiError ? `${error.status} ${error.detail}` : String(error);
    console.error(`[ads-api] whoami failed: ${detail}`);
    return null;
  }
}

/** Whether `whoami` came back authenticated with a key that can act for anyone. */
export function isServiceScoped(who: WhoAmI | null): boolean {
  return who?.authenticated === true && who.caller?.scope === "service";
}

/**
 * Fetch and summarise the customer's website.
 *
 * The service does the fetching, not the browser, so a site that blocks scripts
 * still works. It also stores what it read under this customer's `user_id`,
 * which is what later steps mean by `brief_source: "stored"`.
 *
 * A write, so it throws: an unreachable site comes back 422 with a message that
 * names the actual DNS or TLS problem, and that sentence is worth more to the
 * customer than anything we would write in its place.
 */
export async function readWebsite(url: string, brandName?: string): Promise<WebsiteRead> {
  return adsCall("read_website", brandName ? { url, brand_name: brandName } : { url });
}

/**
 * Ask for a recommendation about the campaign as it stands.
 *
 * `history` is opaque and must be sent back unchanged on a follow-up, or the
 * model starts over and repeats its first answer. It is deliberately NOT stored
 * server-side: it grows every round, and the draft cookie has a ceiling.
 */
export async function askAdvise(
  campaign: AdviseCampaign,
  { feedback, history }: { feedback?: string; history?: unknown[] } = {},
): Promise<AdviseResult> {
  return adsCall("advise", {
    campaign,
    ...(feedback ? { feedback } : {}),
    ...(history && history.length > 0 ? { history } : {}),
  });
}

/**
 * Write the advert.
 *
 * Two briefs, one call. Full automation writes from the stored website; semi
 * passes `image_url` as well so the copy is written to match the picture the
 * customer supplied — `matched_to_image` in the reply says whether the model
 * actually saw it.
 *
 * Note this does NOT need the customer's advertiser key: it runs our own
 * language model. So copy can be written and edited before an account is
 * connected, and only `prepare` and `create` require one.
 */
export async function generateCopy(brief: GenerateBrief): Promise<GenerateResult> {
  const result = await adsCall("generate", { brief });

  // The ONE reply we log, and only this object out of it.
  //
  // `ads-client.ts` logs outbound bodies only, which is why a failed link mint
  // was unreadable without a debugger: `missing`, `error` and `dynamic_url`
  // are the three values that explain this whole class of failure, and none of
  // them reached the terminal. The advert itself is not logged — it is long,
  // it changes every run, and it explains nothing.
  //
  // No secrets here: destinations are URLs the customer typed or the service
  // looked up, and `error` is its own prose. Server-side console in a BFF whose
  // logs never reach a browser.
  if (result.destination) {
    console.log("[ads-api] <- generate.destination", JSON.stringify(result.destination));
  } else {
    console.log("[ads-api] <- generate.destination absent");
  }

  return result;
}

/* ── Stage 4: conversion events ──────────────────────────────────────── */

/**
 * The conversions this account can optimise for.
 *
 * `save_key` already returns these — read on the same trip, while the key was
 * in hand — so this is the refresh, not the first read. Both were unused until
 * 2026-09-21: the events arrived and `saveOpenAiKey` discarded the whole
 * result, so a leads campaign ran as a clicks campaign and only a warning in a
 * reply nobody read said so.
 *
 * **Gate the picker on `has_events` / `events[]`, never on a `usable` flag.**
 * Tracking stays unusable until a pixel is installed AND firing, so eight real,
 * selectable events sit behind a false there.
 *
 * A read, so it answers null rather than throwing — a page that cannot list
 * the events should still render.
 *
 * **`null` means "we could not read them", and callers must NOT collapse that
 * into an empty list.** Doing exactly that is what told an account with eight
 * conversions it had none: the call timed out, this returned null, and
 * `?? []` made unreadable and empty identical on screen.
 */
export async function conversionEvents(): Promise<ConversionEventsResult | null> {
  try {
    return await adsCall("conversion_events", {});
  } catch (error) {
    console.warn("[openai-ads] could not read the conversion events:", error);
    return null;
  }
}


/* ── Stage 5: the picture ────────────────────────────────────────────── */

/**
 * Semi automation: the customer's own PNG or JPEG.
 *
 * The bytes travel base64 in the body, so this is the one call whose request
 * can be megabytes. `image_url` is good for SIX HOURS — long enough to review
 * and create, not a permanent home — while `output_key` is what `create`
 * needs, so both are kept.
 */
export async function uploadImage(base64: string): Promise<UploadImageResult> {
  return adsCall("upload_image", { image_base64: base64 });
}

/**
 * Full automation: start a render.
 *
 * Returns immediately with a job id — the image does not exist yet. There is
 * no push when it does; `imageStatus` polling is the only signal.
 */
export async function startImage(request: ImageRequest): Promise<ImageJob> {
  return adsCall("generate_image", request);
}

/** Poll until `state` is `ready`. Can take up to fifteen minutes. */
export async function imageStatus(outputKey: string, jobId?: string): Promise<ImageStatus> {
  return adsCall("image_status", jobId ? { output_key: outputKey, job_id: jobId } : { output_key: outputKey });
}

/* ── Stage 7: check, then build ──────────────────────────────────────── */

/**
 * The dry run. Creates nothing and charges nothing.
 *
 * Always called before `create`: a 422 here is every field problem at once, on
 * a screen where fixing them is free.
 */
export async function prepareCampaign(request: AdsCampaignRequest): Promise<PrepareResult> {
  return adsCall("prepare", { request });
}

/**
 * The one call that spends money.
 *
 * Never retried — `adsCall` enforces that, because a second attempt is a
 * second campaign rather than a second try. On a 409 the service reports what
 * it DID create; that is for the customer to act on, not for us to paper over.
 */
export async function createCampaign(
  request: AdsCampaignRequest,
  outputKey?: string,
): Promise<CreateResult> {
  return adsCall("create", outputKey ? { request, output_key: outputKey } : { request });
}

/* ── Stage 1: the customer's advertiser key ──────────────────────────── */

/**
 * Check a key before storing it.
 *
 * `usable` is the one that gates the next step — a key can be `valid` (the
 * service recognises it) and still unusable, and the `checks` list says which
 * requirement failed. Never store a key this refuses.
 */
export async function verifyKey(apiKey: string): Promise<VerifyResult> {
  const result = await adsCall("verify", { api_key: apiKey });

  // Logged because a refusal is otherwise a single word on screen with nothing
  // behind it: `checks[]` is what decided, and until 2026-09-22 only the
  // OUTBOUND body was logged, so "rejected" could not be traced to the check
  // that said it.
  //
  // No secret here — the key went out, it does not come back. `account` is the
  // customer's own advertiser account and `checks` is the service's verdict on
  // it. Server-side console in a BFF whose logs never reach a browser.
  console.log(
    "[ads-api] <- verify",
    JSON.stringify({
      valid: result.valid,
      usable: result.usable,
      account: result.account,
      checks: result.checks,
      country_suggested: result.country_suggested,
    }),
  );

  return result;
}

/**
 * Store it, encrypted, against this customer.
 *
 * The LAST call that ever carries the key: everything afterwards sends only
 * `user_id`, and the service looks the key up, decrypts it for that one
 * request and throws it away. It re-verifies internally, so a bad key is never
 * stored.
 *
 * Comes back with `last_four`, the `account`, and the `conversion_events` read
 * while the key was in hand — worth keeping, because stage 4 needs that list
 * and asking again costs another decrypt.
 */
export async function saveKey(
  email: string,
  apiKey: string,
  label?: string,
): Promise<SaveKeyResult> {
  return adsCall("save_key", label ? { email, api_key: apiKey, label } : { email, api_key: apiKey });
}
