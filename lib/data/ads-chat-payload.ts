/**
 * The shape the ad agents' chat webhooks actually want.
 *
 * Confirmed from a live n8n execution on 2026-09-03. It is NOT the flat
 * camelCase body the setup form naturally produces:
 *
 *   {
 *     chatInput: "<the whole campaign, written out as prose>",
 *     campaign_data: { "Business name": "…", "Ad goal": "…", … },
 *     email_address, user_id, session_id, action_type, timestamp
 *   }
 *
 * Two things about it are easy to get wrong and both matter:
 *
 * - **`campaign_data` keys are human sentences**, capitalised as written:
 *   `"Business name"`, `"Service or product"`, `"Other interest (optional)"`.
 *   They are labels, not identifiers — `businessName` is a different key and
 *   the agent will not find it.
 * - **`chatInput` is the same information again, as prose.** The agent is an
 *   LLM: `campaign_data` is for the workflow's own steps, `chatInput` is what
 *   the model reads. Sending one without the other leaves half the flow blind,
 *   which is why they are built together here rather than by each caller.
 *
 * Absent values are spelled out rather than omitted — `"Not provided"`,
 * `"Not applicable"`, `"All day"`. An empty string in a prompt reads as a field
 * the model should fill in; "Not provided" reads as a fact about the business.
 */

/** One line of the campaign, as the backend labels it. */
export type CampaignField = readonly [label: string, value: string];

export const NOT_PROVIDED = "Not provided";

/** Falls back to the spelled-out absence rather than an empty string. */
export function orAbsent(value: string | number | undefined | null, absent = NOT_PROVIDED): string {
  if (value === undefined || value === null) return absent;
  const text = String(value).trim();
  return text === "" ? absent : text;
}

export interface ChatPayloadInput {
  /** The sentence that opens the prompt, naming what the agent is being asked. */
  intro: string;
  fields: readonly CampaignField[];
  email: string;
  /** The Firebase uid. Omitted from the body when the session predates it. */
  userId?: string;
  sessionId: string;
  actionType: "get_suggestion" | "approved" | "revise" | "user_suggestion";
  /**
   * Keys the hop needs beyond the six every turn carries — `user_decision`,
   * `business_details`, and the rest of what an approval sends.
   *
   * Merged last and merged wholesale, `null` values included: the live body
   * carries `selectionMode: null`, and a key that is absent is not the same
   * message as a key that is explicitly nothing.
   */
  extras?: Record<string, unknown>;
}

/**
 * Builds both halves — the prose and the structured object — from one list of
 * fields, so they can never disagree about the campaign.
 */
export function buildChatPayload({
  intro,
  fields,
  email,
  userId,
  sessionId,
  actionType,
  extras,
}: ChatPayloadInput): Record<string, unknown> {
  const lines = fields.map(([label, value]) => `${label}: ${value}`).join("\n");

  const campaignData: Record<string, string> = {};
  for (const [label, value] of fields) campaignData[label] = value;

  const payload: Record<string, unknown> = {
    chatInput: `${intro}\n\n${lines}`,
    email_address: email,
    session_id: sessionId,
    campaign_data: campaignData,
    action_type: actionType,
    timestamp: new Date().toISOString(),
  };

  // Sent only when the session has one. An empty `user_id` writes a row that
  // looks attributed and is not — the same rule `saveGoogleSelection` follows.
  if (userId) payload.user_id = userId;

  return extras ? { ...payload, ...extras } : payload;
}

/**
 * The campaign back out of a payload this module built.
 *
 * The approve hop repeats the setup summary verbatim — `chatInput` and
 * `campaign_data` both — so the campaign has to survive from the setup form to
 * the approval, two pages later. Storing the FIELDS rather than the two
 * rendered halves is what keeps them from ever disagreeing, and this is the
 * inverse that recovers them.
 *
 * It reads the invariant `buildChatPayload` creates and is therefore kept
 * beside it: `campaign_data` IS the field list as an object, and `chatInput` is
 * the intro followed by a blank line. A payload from anywhere else yields
 * whatever it can rather than throwing — the caller's next step is to send a
 * turn, and a turn missing its campaign is more useful than a 500.
 */
export function campaignFromPayload(payload: Record<string, unknown>): {
  intro: string;
  fields: CampaignField[];
} {
  const chatInput = typeof payload.chatInput === "string" ? payload.chatInput : "";
  const data = payload.campaign_data;

  const fields: CampaignField[] = [];
  if (data && typeof data === "object") {
    for (const [label, value] of Object.entries(data)) {
      if (typeof value === "string") fields.push([label, value]);
    }
  }

  // Everything before the FIRST blank line. A field value with a paragraph
  // break of its own sits after that, so it cannot truncate the intro.
  return { intro: chatInput.split("\n\n")[0] ?? "", fields };
}

/**
 * The campaign window, as two dates.
 *
 * The form asks "run for N days" and the backend wants a start and an end, so
 * the translation happens here rather than in three callers. Start is today —
 * the agent is being asked to launch now.
 */
export function campaignWindow(days: number, now = new Date()): { start: string; end: string } {
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  return { start: isoDate(now), end: isoDate(end) };
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Whether `value` is a real `YYYY-MM-DD` day — the format a native date input
 * submits. "2026-02-30" matches the pattern and is not a day, so the parts are
 * round-tripped through UTC rather than trusted.
 */
export function isCalendarDay(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * The UTC calendar day `offset` days from `now`, as `YYYY-MM-DD`.
 *
 * For server-side date limits. The customer's "today" is their browser's, which
 * the server cannot see, so a check that a start is not in the past compares
 * against YESTERDAY in UTC (`utcDay(now, -1)`): late evening in Los Angeles is
 * already tomorrow in UTC, and early morning in Delhi is still yesterday.
 */
export function utcDay(now: Date, offset = 0): string {
  return isoDate(new Date(now.getTime() + offset * 86_400_000));
}

/**
 * Money, as the backend writes it.
 *
 * `$10`, and `$10 / day` or `$10 total` — the legacy app's exact strings
 * (`'/ day' : 'total'` in GoogleAds.jsx, MetaAds.jsx and LinkedInAds.jsx), so
 * the workflow's text reads the same as it always has. This said
 * `$10 / lifetime` until 2026-10-01. The currency symbol is the live app's own
 * — it sends `$` regardless of the ad account's currency — so this matches
 * rather than inventing a correctness the backend does not have. The real
 * number and currency travel separately as `budget_amount` / `budget_currency`
 * on the launch body (`launchExtras`).
 */
export function budgetStrings(amount: number, budgetType: string): { amount: string; display: string } {
  const cash = `$${amount}`;
  return { amount: cash, display: `${cash} ${budgetType === "daily" ? "/ day" : "total"}` };
}
