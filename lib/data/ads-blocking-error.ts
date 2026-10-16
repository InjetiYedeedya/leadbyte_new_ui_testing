/**
 * n8n answering "OK" with a refusal inside.
 *
 * The legacy campaign-flow guide (§7, 2026-09-30): sometimes n8n replies
 * SUCCESSFULLY but the content says the campaign cannot run until the
 * customer fixes their setup — the known case is Meta with no Instagram
 * account linked to the Facebook Page. It can arrive on the suggestion reply
 * or the create-campaign reply, as an array, a bare object, a JSON string, or
 * wrapped by the Lambda as `{ success: true, "0": { … } }`. Any record with
 * `status: "error"` or an `error_code` is a refusal.
 *
 * Missing this is the worst outcome the ad flow has: the screen says "we are
 * creating your campaign" and no campaign exists. So every agent reply is
 * checked for it before anything else is read from it (`agent-setup.ts`).
 *
 * Only the top level is searched — the reply itself, array items, a parsed
 * JSON string, and the Lambda's numeric keys — not deep inside a campaign
 * plan, where a field called `status` can mean something else entirely.
 */

import { readSignedText, signText } from "@/lib/signed-text";

export interface AdsBlockingError {
  code: string;
  title: string;
  message: string;
  hint: string;
}

type Rec = Record<string, unknown>;

function record(value: unknown): Rec | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The candidate records a reply can hold its refusal in. */
function candidates(reply: unknown, depth = 0): Rec[] {
  if (depth > 3) return [];
  if (typeof reply === "string") {
    const trimmed = reply.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return [];
    try {
      return candidates(JSON.parse(trimmed), depth + 1);
    } catch {
      return [];
    }
  }
  if (Array.isArray(reply)) return reply.flatMap((item) => candidates(item, depth + 1));
  const rec = record(reply);
  if (!rec) return [];
  const found: Rec[] = [rec];
  // The Lambda's wrapper: `{ success: true, "0": {…}, "1": {…} }`, and the
  // usual envelopes a workflow's own answer sits in.
  for (const [key, value] of Object.entries(rec)) {
    if (/^\d+$/.test(key) || key === "data" || key === "output" || key === "body") {
      found.push(...candidates(value, depth + 1));
    }
  }
  return found;
}

/** Plain-language wording for the codes we know; anything else uses n8n's own. */
const KNOWN: Record<string, { title: string; hint: string }> = {
  INSTAGRAM_NOT_CONNECTED: {
    title: "Link an Instagram account to your Facebook Page",
    hint: "Open Meta Business Settings (business.facebook.com/settings/pages), link your Instagram account to the Page, then try again.",
  },
};

/** The record holding the refusal, or null. Shared by the detector and the card. */
function refusalRecord(reply: unknown): Rec | null {
  for (const rec of candidates(reply)) {
    const status = text(rec.status).toLowerCase();
    if (status === "error" || text(rec.error_code) !== "" || text(rec.errorCode) !== "") return rec;
  }
  return null;
}

function refusalCode(rec: Rec): string {
  return text(rec.error_code) || text(rec.errorCode) || text(rec.code);
}

/** What n8n itself said went wrong, or "" when it said nothing. */
function refusalMessage(rec: Rec): string {
  return text(rec.message) || text(rec.error) || text(rec.error_message) || text(rec.reason);
}

/** The refusal in this reply, or null when there is none. Pure, so it is tested. */
export function detectAdsBlockingError(reply: unknown): AdsBlockingError | null {
  const rec = refusalRecord(reply);
  if (!rec) return null;
  const code = refusalCode(rec);
  const known = KNOWN[code.toUpperCase()];
  return {
    code: code || "ERROR",
    title: text(rec.title) || known?.title || "The campaign can't be created yet",
    message: refusalMessage(rec) || "The ad platform can't create this campaign yet.",
    hint: text(rec.hint) || known?.hint || "",
  };
}

/* ------------------------------------------------------------- the card -- */

/**
 * The refusal as the legacy spec's error card: a title, what happened, what
 * to do about it, and where to go. `hint` and `link` are null when there is
 * nothing honest to say — an unknown code gets no invented advice.
 */
export interface BlockingErrorCard {
  code: string;
  title: string;
  message: string;
  hint: string | null;
  link: string | null;
}

/**
 * The only place a card may send someone. The card can travel in a URL (see
 * `encodeBlockingCard`), and a link on our own error screen is exactly what a
 * phishing page would want to control.
 */
const CARD_LINK_PREFIX = "https://business.facebook.com/";

function allowedLink(link: unknown): string | null {
  return typeof link === "string" && link.startsWith(CARD_LINK_PREFIX) ? link : null;
}

/**
 * The card for this reply, or null when the reply is not a refusal.
 *
 * Known codes get the spec's fixed wording — not n8n's, which is written for
 * whoever built the workflow. Unknown codes keep n8n's message, because it is
 * the only account of what went wrong that exists.
 */
export function blockingErrorCard(payload: unknown): BlockingErrorCard | null {
  const rec = refusalRecord(payload);
  if (!rec) return null;
  const code = refusalCode(rec) || "ERROR";

  if (code.toUpperCase() === "INSTAGRAM_NOT_CONNECTED") {
    const page = text(rec.page_name) || text(rec.pageName) || text(rec.facebook_page_name);
    return {
      code,
      title: "Instagram account not connected",
      message:
        `No Instagram account is connected to your Facebook Page${page === "" ? "" : ` "${page}"`}. ` +
        "A connected Instagram Business account is required to run Meta (Facebook & Instagram) ads.",
      hint: "Link an Instagram Business account to this Page in Meta Business Settings, then try again.",
      link: "https://business.facebook.com/settings/pages",
    };
  }

  return {
    code,
    title: "We couldn't start your campaign",
    message: refusalMessage(rec) || "The campaign could not be created. Please review your setup and try again.",
    hint: null,
    link: null,
  };
}

/**
 * The card as one URL-safe, SIGNED string, for a redirect to carry.
 *
 * Signed with `signText` for the reason that module exists: a card shown from
 * the address bar would otherwise let anyone put their own words — and their
 * own link — in our error box.
 */
export function encodeBlockingCard(card: BlockingErrorCard): string {
  const safe: BlockingErrorCard = { ...card, link: allowedLink(card.link) };
  return signText(Buffer.from(JSON.stringify(safe), "utf8").toString("base64url"));
}

/** The card back, or null for anything unsigned, tampered with or malformed. */
export function decodeBlockingCard(raw: string | null | undefined): BlockingErrorCard | null {
  const verified = readSignedText(raw);
  if (verified === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(verified, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const rec = record(parsed);
  if (!rec) return null;
  const code = text(rec.code);
  const title = text(rec.title);
  const message = text(rec.message);
  if (code === "" || title === "" || message === "") return null;
  return { code, title, message, hint: text(rec.hint) || null, link: allowedLink(rec.link) };
}

/** One sentence for the problems list: title, what happened, what to do. */
export function blockingErrorSentence(error: AdsBlockingError): string {
  return [`${error.title}.`, error.message, error.hint]
    .map((part) => part.trim())
    .filter((part, index, all) => part !== "" && all.indexOf(part) === index)
    .join(" ");
}
