import { cookies } from "next/headers";
import type { LinkedInSemiMedia } from "@/lib/data/linkedin-semi-media";
import { signValue, verifyValue } from "@/lib/auth/signed-cookie";
import type { LocationPick } from "@/lib/data/location-picks";
import type { SelectionMode } from "@/lib/data/selection-mode";
import type { CampaignField } from "@/lib/data/ads-chat-payload";
import type { SemiField } from "@/lib/data/semi-form";
import type { SemiAutomationMedia } from "@/lib/data/meta-semi-media";
import type { GoogleSemiAutomationMedia } from "@/lib/data/ads-creatives";

/**
 * The campaign the agent proposed, and what the customer does with it.
 *
 * ## Why this exists
 *
 * `POST /api/webhook/{platform}-ads-chat` answers with a written campaign plan
 * — objective, campaign types, bidding strategy, risks, next actions — plus the
 * setup it understood. Until now that reply was thrown away: the agent did the
 * work and the customer never saw it.
 *
 * The reply is the middle of a conversation, not the end of a request. Three
 * things can happen to it, and they are the three `action_type` values the
 * webhook already accepts:
 *
 *   approved         → run it, at the chosen automation mode
 *   revise           → the agent tries again on its own
 *   user_suggestion  → the customer says what to change, in their words
 *
 */

export interface Suggestion {
  /** The agent's reply, verbatim. */
  output: string;
  /** What it understood the setup to be — labels exactly as it sent them. */
  userDetails: Record<string, string>;
  /**
   * The page-one campaign, kept so the approval can repeat it.
   *
   * The approve hop sends the whole setup again — as prose and as an object —
   * and by then the form is two pages behind us. The FIELDS are stored rather
   * than the two rendered halves for the same reason `buildChatPayload` builds
   * both from one list: stored separately they could drift apart, and half a
   * kilobyte of cookie is spent saying the same thing twice.
   */
  intro: string;
  fields: CampaignField[];
  /** The session the conversation belongs to; every turn reuses it. */
  sessionId: string;
  /**
   * The setup's STRUCTURED answers the launch body carries beside the prose
   * fields: `audienceType`, the chosen audiences, the lead form id, store
   * `locationData`, and the budget as a number with its currency (legacy flow
   * guide §6 and §10). Kept here because the launch is three pages away.
   */
  launchExtras?: Record<string, unknown>;
  /** How many times the customer has asked for a rethink. */
  revisions: number;
  /**
   * False when the agent said this campaign must run on full automation
   * (`user_details.automation_mode: null`, META_ADS_AGENT_SPEC MA-SUG-07).
   * Stored only as `false`; absent means Semi may be chosen.
   */
  semiAllowed?: false;
  /**
   * The extra fields a semi launch asked for, once it has been requested.
   *
   * Held beside the suggestion because it belongs to the same decision: the
   * customer approved THIS plan and is now completing the campaign around it.
   */
  semiFields?: SemiField[];
  /**
   * True once the campaign-details schema has been requested, whatever came
   * back.
   *
   * Needed because an EMPTY field list is a real answer — Meta's workflow has
   * no extra questions — and is otherwise indistinguishable from never having
   * asked.
   */
  semiAsked?: boolean;
  /**
   * Which automation the customer chose.
   *
   * BOTH modes collect the campaign details; the difference is the creative.
   * Full lets the agent write it, semi has the customer supply it — so the mode
   * decides whether the upload fields appear and which endpoint the completed
   * form is sent to, not whether a form is shown at all.
   */
  mode?: "full" | "semi";
  /**
   * How much the agent may decide for itself, chosen on the details form.
   *
   * Stored rather than used on the spot because full automation launches a
   * page later — details form, three creative prompts, a pick, THEN the
   * launch. Absent means the details form has not been submitted yet;
   * `buildLaunchPayload` falls back to "ask", which is what every launch sent
   * before this was a question at all.
   */
  selectionMode?: SelectionMode;
  /**
   * The completed details form, kept because the launch no longer happens when
   * it is submitted.
   *
   * Full automation now goes: submit the form -> write three creative prompts
   * -> pick one -> THEN launch. The answers have to outlive the submit for
   * that last step to have anything to send, and re-asking for them after the
   * pick would be asking twice for the same campaign.
   *
   * Its presence is also the step marker: answers stored means the form is
   * done and the prompt step is what the customer is looking at.
   */
  answers?: Record<string, string>;
  /** Uploaded creative URLs, semi only. Stored for the same reason. */
  creatives?: Record<string, string>;
  /**
   * Meta Ads semi only: the image/video/carousel the customer uploaded, already
   * in S3. Stored on the suggestion so it outlives the form submit and reaches
   * `launchCampaign` — the same reason `answers` and `creatives` are here.
   * Serialised as JSON in the cookie like every other field.
   */
  semiAutomationMedia?: SemiAutomationMedia | GoogleSemiAutomationMedia;
  /** LinkedIn semi: the images or video from the automation step (`linkedin-semi-media.ts`). */
  linkedInSemiMedia?: LinkedInSemiMedia;
  /**
   * Google: the places picked on the setup form (2026-10-01), so the details
   * form starts from them instead of asking again. Still editable there.
   */
  setupLocations?: LocationPick[];
  /**
   * What the details form last posted when it was sent back with problems.
   * NOT `answers`: those mean "the form is done", and `launchCampaign` acts on
   * them. This only refills the form, so a refused submit loses nothing.
   */
  semiDraft?: Record<string, string>;
}

/**
 * ## Where it is kept
 *
 * In httpOnly cookies, split into chunks. This is the fourth attempt, and each
 * previous one failed for a different reason worth recording:
 *
 * 1. **Process memory (`devGlobal`).** Lost on every dev-server restart and
 *    every serverless cold start. The flow spans three pages and minutes.
 * 2. **One cookie.** Browsers silently drop a cookie over ~4KB, and a campaign
 *    plan plus a twelve-field schema clears that. Silently: the next page just
 *    redirects to the start, with no error anywhere.
 * 3. **The agent's backend row.** Written with `id` as the key (the table
 *    demands it) but `/api/data/{table}/{email}` reads by `email` — so it wrote
 *    a row that could not be read back. Same keying mismatch as Meta's status
 *    table.
 * 4. **Chunked cookies.** No ceiling to tune against: the payload is split
 *    across as many cookies as it needs, and reassembled on read.
 *
 * A browser allows ~50 cookies per domain at ~4KB each, so a plan of any
 * realistic size fits. `MAX_CHUNKS` caps it anyway — an unbounded write could
 * evict the SESSION cookie, which would sign the customer out to save a
 * campaign draft.
 */

const CHUNK_PREFIX = "leadbyte_ads_plan_";

/**
 * Chunk size, measured on the BASE64 text that is actually stored.
 *
 * The payload is base64'd before chunking, and that is the whole trick: a
 * cookie value is percent-encoded on the way out, and JSON is full of quotes,
 * spaces and newlines that each become three bytes. A 2,754-character plan
 * encoded to well over 4KB and Chrome dropped it silently — no error, the next
 * page simply started over. Base64 is `A–Z a–z 0–9 - _`, none of which the
 * encoder touches, so 3,000 characters stored is 3,000 bytes sent, every time.
 */
const CHUNK_SIZE = 3000;

/** Refuse to spend more than this many cookies on one plan. */
const MAX_CHUNKS = 8;

/** An hour: long enough to read a plan and fill a form, short enough to expire. */
const MAX_AGE = 60 * 60;

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
};

interface StoredPlan extends Suggestion {
  /** Guards against a plan from one agent or account surfacing under another. */
  key: string;
}

function planKey(businessId: string, agentId: string): string {
  return `${businessId}::${agentId}`;
}

/**
 * Reads the plan back out of however many chunks it took.
 *
 * Never throws: a partial set — one chunk expired, or the write was truncated —
 * sends the customer back to the setup form, which is honest, rather than
 * failing the page.
 */
export async function getSuggestion(
  businessId: string,
  agentId: string,
): Promise<Suggestion | null> {
  const store = await cookies();

  let raw = "";
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const chunk = store.get(`${CHUNK_PREFIX}${i}`)?.value;
    if (chunk === undefined) break;
    raw += chunk;
  }

  if (raw === "") return null;

  // Signed, because the plan is what the approve and launch actions act on:
  // an unsigned one could be written by hand in DevTools and posted to launch
  // a campaign nobody planned (audit, 2026-09-29). A plan that fails the check
  // reads as no plan, which sends the customer back to the setup form.
  const verified = await verifyValue(CHUNK_PREFIX, raw);
  if (verified === null) return null;

  try {
    const parsed = JSON.parse(Buffer.from(verified, "base64url").toString("utf8")) as StoredPlan;
    return parsed.key === planKey(businessId, agentId) ? parsed : null;
  } catch (error) {
    console.error("[ads-suggestion] the stored plan could not be read:", error);
    return null;
  }
}

export async function setSuggestion(
  businessId: string,
  agentId: string,
  value: Suggestion,
): Promise<void> {
  const store = await cookies();
  const json = JSON.stringify({ ...value, key: planKey(businessId, agentId) } satisfies StoredPlan);
  // Base64url so the stored length IS the sent length — see `CHUNK_SIZE`.
  // Signed as a whole, then chunked — see `getSuggestion`. Base64url has no
  // `.`, so the signature's separator cannot collide with the payload.
  const raw = await signValue(CHUNK_PREFIX, Buffer.from(json, "utf8").toString("base64url"));

  const chunks: string[] = [];
  for (let i = 0; i < raw.length; i += CHUNK_SIZE) {
    chunks.push(raw.slice(i, i + CHUNK_SIZE));
  }

  if (chunks.length > MAX_CHUNKS) {
    // Better to lose the plan than the session: an oversized write could evict
    // other cookies. Logged loudly, because the customer will see the flow
    // restart and deserves an explanation in the logs.
    console.error(
      `[ads-suggestion] plan for ${agentId} needs ${chunks.length} cookies, over the ` +
        `${MAX_CHUNKS} limit — not stored`,
    );
    return;
  }

  chunks.forEach((chunk, i) => store.set(`${CHUNK_PREFIX}${i}`, chunk, COOKIE_OPTIONS));

  // Clear any chunks a longer previous plan left behind, or the leftovers would
  // be appended to this one and make it unparseable.
  for (let i = chunks.length; i < MAX_CHUNKS; i++) {
    if (store.get(`${CHUNK_PREFIX}${i}`)) store.delete(`${CHUNK_PREFIX}${i}`);
  }
}

/** Spent — the campaign is running, so the plan must not be offered again. */
export async function clearSuggestion(): Promise<void> {
  const store = await cookies();
  for (let i = 0; i < MAX_CHUNKS; i++) store.delete(`${CHUNK_PREFIX}${i}`);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** What `readSuggestion` found in the reply. */
export interface SuggestionReply {
  /**
   * The agent's reply as text. A STRUCTURED reply (see `structuredReply`) is
   * kept as its JSON — `parseSuggestion` renders it as sections, and the
   * approve and launch hops hand the agent back its own answer.
   */
  output: string;
  userDetails: Record<string, string>;
  /**
   * False only when the agent said `user_details.automation_mode: null` — the
   * key present and explicitly null, which the legacy spec reads as "this plan
   * cannot run semi-automated". A missing key, or any value, leaves it true:
   * taking a choice away from the customer needs the agent to have said so.
   */
  semiAllowed: boolean;
}

/** The text a field carries; an array answers with its first item. */
function firstText(value: unknown): string {
  const item = Array.isArray(value) ? value[0] : value;
  return typeof item === "string" ? item.trim() : "";
}

/** A JSON object or array written as a string, parsed; anything else is null. */
function parsedJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/** The keys a structured reply is rendered from; the rest is the agent's bookkeeping. */
const STRUCTURED_KEYS = ["result", "why", "reason", "recommended_campaign", "suggestions"] as const;

/**
 * The structured verdict the agent sometimes answers with instead of prose,
 * or null when this is not one.
 *
 * The legacy spec names three reply shapes besides plain text: a verdict
 * (`result`, `why`, `recommended_campaign`, maybe `suggestions`), and a list
 * of `suggestions` on its own. Either may also arrive as a JSON string inside
 * `output`.
 */
function structuredReply(value: unknown): Record<string, unknown> | null {
  const node = typeof value === "string" ? parsedJson(value) : value;
  const body = record(Array.isArray(node) ? node[0] : node);
  const verdict = "result" in body || "recommended_campaign" in body;
  if (!verdict && !Array.isArray(body.suggestions)) return null;
  const kept: Record<string, unknown> = {};
  for (const key of STRUCTURED_KEYS) {
    if (key in body) kept[key] = body[key];
  }
  return kept;
}

/**
 * Pulls the reply out of whatever n8n sent back.
 *
 * The Lambda forwards n8n's response verbatim and wraps it as
 * `{ success, ...n8n }`, and n8n itself answers with a single-element array as
 * often as an object. Both are accepted, plus a bare string — the same
 * tolerance `readOutput` needs for the strategy agent, and for the same reason.
 *
 * The text is looked for under `output`, then `data.output`, then `message`,
 * then `response` (the legacy spec's order). With no text at all, a structured
 * verdict at the top level or under `data` is kept as JSON — see
 * `SuggestionReply.output`.
 */
export function readSuggestion(payload: unknown): SuggestionReply {
  const node = Array.isArray(payload) ? payload[0] : payload;
  const body = typeof node === "string" ? { output: node } : record(node);
  const data = record(body.data);

  let output =
    firstText(body.output) || firstText(data.output) || firstText(body.message) || firstText(body.response);
  if (output === "") {
    const structured = structuredReply(body) ?? structuredReply(data);
    if (structured) output = JSON.stringify(structured);
  }

  // `{ success, ...n8n }` — the agent's own fields sit at the top level, but a
  // nested `data` has been seen too.
  const rawDetails = record("user_details" in body ? body.user_details : data.user_details);
  const details: Record<string, string> = {};
  for (const [label, value] of Object.entries(rawDetails)) {
    if (typeof value === "string" || typeof value === "number") details[label] = String(value);
  }
  // `in`, not `=== null` alone: an absent key is "the agent did not say".
  const semiAllowed = !("automation_mode" in rawDetails && rawDetails.automation_mode === null);

  return { output, userDetails: details, semiAllowed };
}

export interface SuggestionSection {
  /** The heading, or "" for the opening lines that have none. */
  title: string;
  /** Lines that are prose. */
  body: string[];
  /** Lines that were bulleted or numbered, with the marker stripped. */
  bullets: string[];
}

/**
 * Turns the agent's plain text into sections a page can render.
 *
 * The reply is markdown-ish but not markdown: headings are bare lines, bullets
 * start with `-`, and next actions are numbered. Rendering it in a `<pre>`
 * would be honest but unreadable, and running it through a markdown parser
 * would be a dependency for text that follows no spec.
 *
 * A line is a HEADING when it has no bullet marker and either ends in a colon
 * or is followed by a bullet — which is exactly how the agent writes
 * "Recommended Campaign Type(s)" above a list. Anything unrecognised stays as
 * body text rather than being dropped: an unparsed plan must still be readable.
 */
/**
 * Markdown the agent may write, removed before anything else looks at a line.
 *
 * ## Why, when the live reply has none
 *
 * The captured run this parser was written against (2026-09-04) is plain text,
 * and the header above still describes the reply as "markdown-ish but not
 * markdown". Both remain true — and the strategy agent, the other language
 * model in this app, writes real Markdown and had exactly this bug: the thread
 * showed `## Section 1` and `**Business:**` with the punctuation intact, which
 * is what `lib/agent-markdown.ts` exists to fix. The ads agent is the same kind
 * of thing behind a different webhook, and an n8n prompt can be edited without
 * telling us.
 *
 * So this is the smallest possible version of that: heading hashes off the
 * front of a line, and PAIRED emphasis markers. Paired matters — a lone `*` or
 * `-` starting a line is a BULLET, and the parser below needs it. Everything
 * else falls through untouched, because an unrecognised reply must still be
 * readable.
 */
function stripMarkdown(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .trim();
}

/** `daily_budget` / `dailyBudget` → "Daily Budget". */
function titleCase(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** A value as one line of text, or "" for nothing worth showing. */
function asLine(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(asLine).filter(Boolean).join(", ");
  return "";
}

/** One suggestion's heading and text, from whichever spellings it used. */
function suggestionParts(item: unknown): { heading: string; text: string } {
  if (typeof item === "string") return { heading: "", text: item.trim() };
  const r = record(item);
  return {
    heading: asLine(r.campaign_type) || asLine(r.title),
    text: asLine(r.reason) || asLine(r.detail) || asLine(r.description) || asLine(r.text),
  };
}

/**
 * A structured reply as the same sections the prose parser produces, so the
 * page renders both without knowing which it was given.
 *
 * Section by section, from the legacy spec: "Result" (`does_not_work` →
 * "does not work"), "Reason" (`why` as a list, or a `why` / `reason`
 * sentence), "Recommended campaign" (its type, then every other key as
 * "Label: value"), "Suggestions". A reply that is ONLY suggestions renders
 * each as its own card instead, titled by the suggestion or "Suggestion N".
 */
function structuredSections(reply: Record<string, unknown>): SuggestionSection[] {
  const sections: SuggestionSection[] = [];
  const suggestions = Array.isArray(reply.suggestions) ? reply.suggestions : [];

  if (!("result" in reply) && !("recommended_campaign" in reply)) {
    return suggestions.flatMap((item, i): SuggestionSection[] => {
      const { heading, text } = suggestionParts(item);
      if (heading === "" && text === "") return [];
      return [{ title: heading || `Suggestion ${i + 1}`, body: text === "" ? [] : [text], bullets: [] }];
    });
  }

  const result = asLine(reply.result).replace(/_/g, " ");
  if (result !== "") sections.push({ title: "Result", body: [result], bullets: [] });

  if (Array.isArray(reply.why)) {
    const bullets = reply.why.map(asLine).filter(Boolean);
    if (bullets.length > 0) sections.push({ title: "Reason", body: [], bullets });
  } else {
    const reason = asLine(reply.why) || asLine(reply.reason);
    if (reason !== "") sections.push({ title: "Reason", body: [reason], bullets: [] });
  }

  const recommended = reply.recommended_campaign;
  if (typeof recommended === "string" && recommended.trim() !== "") {
    sections.push({ title: "Recommended campaign", body: [recommended.trim()], bullets: [] });
  } else if (recommended && typeof recommended === "object" && !Array.isArray(recommended)) {
    const rc = recommended as Record<string, unknown>;
    const type = asLine(rc.campaign_type);
    const bullets = Object.entries(rc)
      .filter(([key]) => key !== "campaign_type")
      .flatMap(([key, value]) => {
        const line = asLine(value);
        return line === "" ? [] : [`${titleCase(key)}: ${line}`];
      });
    if (type !== "" || bullets.length > 0) {
      sections.push({ title: "Recommended campaign", body: type === "" ? [] : [type], bullets });
    }
  }

  const listed = suggestions.flatMap((item) => {
    const { heading, text } = suggestionParts(item);
    const line = [heading, text].filter(Boolean).join(": ");
    return line === "" ? [] : [line];
  });
  if (listed.length > 0) sections.push({ title: "Suggestions", body: [], bullets: listed });

  return sections;
}

/** "Reject: …" / "- Accept: …" — the workflow grading its own options. */
const VERDICT_LINE = /^(?:[-*•–]\s*)?(?:reject(?:ed)?|accept(?:ed)?)\s*:/i;

/**
 * The plan's own section names, which are headings even with no colon and
 * nothing under them — "Recommended Subgoal" alone on a line, followed by
 * another heading, is the shape the colon and bullet rules cannot see.
 */
const PLAN_LABEL =
  /^(recommended (campaign type\(s\)|campaign types?|subgoal|sub-goal|objective|goal)|objective of the campaign|ad goal|bidding strategy|budget( allocation logic)?|key risk \+ mitigation|immediate next actions)$/i;

export function parseSuggestion(output: string): SuggestionSection[] {
  // A structured reply is stored as its JSON (`readSuggestion`). One that
  // renders to nothing falls through to the text parser, which at least shows
  // what arrived rather than an empty plan.
  const structured = structuredReply(output);
  if (structured) {
    const sections = structuredSections(structured);
    if (sections.length > 0) return sections;
  }

  // The Meta workflow's own Accept/Reject verdicts on each option leak into
  // the plan text (LBS-1245). They are its working, not the plan, so they are
  // hidden here — the raw text in `suggestion.output` stays whole, because
  // the revise hop and the launch both send it.
  const lines = output
    .split("\n")
    .map((line) => stripMarkdown(line))
    .filter((line) => !VERDICT_LINE.test(line));
  const sections: SuggestionSection[] = [];
  let current: SuggestionSection = { title: "", body: [], bullets: [] };

  // A marker with nothing after it is an EMPTY bullet: `stripMarkdown` trims
  // "- " to "-", and Meta writes one under a heading it has no answer for.
  // Missing it made "Recommended Subgoal" and its "-" body text of the
  // section above, read as that section's value (LBS-1245).
  const isBullet = (line: string) => /^([-*•–]|\d+[.)])(\s+|$)/.test(line);
  const strip = (line: string) => line.replace(/^([-*•–]|\d+[.)])(\s+|$)/, "").trim();
  const push = (section: SuggestionSection) => {
    if (section.title === "" && section.body.length === 0 && section.bullets.length === 0) return;
    // A heading the agent left empty says so, rather than vanishing or
    // showing a bare dash.
    if (section.title !== "" && section.body.length === 0 && section.bullets.length === 0) {
      section.body.push("Not specified");
    }
    sections.push(section);
  };

  lines.forEach((line, i) => {
    if (line === "") return;

    if (isBullet(line)) {
      const text = strip(line);
      if (text !== "") current.bullets.push(text);
      return;
    }

    const next = lines.slice(i + 1).find((l) => l !== "");
    // Three ways a line is a heading, and the third is the one that is easy to
    // miss: "Bidding Strategy: Maximize conversions" is a label AND its answer
    // on one line, with no bullets under it. Treating it as body text buried
    // the answer in the previous section.
    //
    // The label is capped at 40 characters so an ordinary sentence containing a
    // colon is not mistaken for one.
    const inlineLabel = /^([^:]{2,40}):\s*(.+)$/.exec(line);
    const looksLikeHeading =
      line.endsWith(":") ||
      (next !== undefined && isBullet(next)) ||
      inlineLabel !== null ||
      PLAN_LABEL.test(line);

    if (looksLikeHeading) {
      push(current);
      // The colon belongs to the heading's punctuation, not its text — except
      // when the line carries its own value ("Bidding Strategy: Maximize
      // conversions"), which stays whole because splitting it loses the answer.
      const [label, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      current = {
        title: (label ?? line).trim(),
        body: value === "" ? [] : [value],
        bullets: [],
      };
      return;
    }

    current.body.push(line);
  });

  push(current);

  return sections;
}
