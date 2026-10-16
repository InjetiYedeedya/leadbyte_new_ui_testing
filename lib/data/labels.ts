/**
 * Turning a backend key or enum into a word a customer can read.
 *
 * ## Why this exists
 *
 * Six screens printed a backend value straight into the page, and each one
 * that did NOT was fixing the same problem its own way — `humanise` in
 * `components/analytics/campaign-table.tsx`, a `.replace(/_/g, " ")` plus a
 * `capitalize` class in the ChatGPT Ads review page, and a bare `capitalize`
 * class in the brand sheet. Three spellings of one idea meant the two screens
 * that had none were easy to miss. An audit on 2026-09-21 found:
 *
 *   ads-plan-editor     "budget_amount" as the heading of a suggestion card
 *   campaign-table      "ENABLED" in a badge, beside a column that WAS humanised
 *   brand-sheet         "Linkedin", "Tiktok", "Youtube" — CSS `capitalize` on
 *                       a platform key is not the brand's name
 *   lead-activity-table whatever the outreach log wrote in `status`
 *   suggestion-review   the agent's own `user_details` keys, verbatim
 *
 * ## The one rule that makes this safe to apply everywhere
 *
 * Most of these values are ALREADY human. The agent sends "Ad goal" and
 * "Location"; the ads service sends "budget_amount"; Google sends "ENABLED".
 * Rewriting the first kind is damage — "Maximize conversions (use when aiming
 * for the highest number of leads)" must come out unchanged — so
 * `humaniseKey` transforms only what looks machine-made and returns everything
 * else exactly as it arrived. That is what lets a caller apply it to a field
 * whose spelling is not guaranteed, which is every field here.
 *
 * ## Acronyms
 *
 * Sentence-casing an acronym is its own kind of wrong: "CTR" becoming "Ctr"
 * reads as a typo rather than a label. The set below is small on purpose —
 * only the ones this app's payloads actually carry.
 */

/**
 * Words that are shouted correctly.
 *
 * Kept lowercase for lookup; the value is the spelling that ships.
 */
const ACRONYMS: Record<string, string> = {
  ai: "AI",
  api: "API",
  b2b: "B2B",
  b2c: "B2C",
  cpa: "CPA",
  cpc: "CPC",
  cpm: "CPM",
  cta: "CTA",
  ctr: "CTR",
  faq: "FAQ",
  ga4: "GA4",
  geo: "GEO",
  gtm: "GTM",
  id: "ID",
  kpi: "KPI",
  roas: "ROAS",
  seo: "SEO",
  url: "URL",
  utm: "UTM",
};

/**
 * Whether a value is the backend's spelling rather than a person's.
 *
 * Three tells, and a value needs only one: an underscore or a hyphen between
 * words (`budget_amount`, `search-partners`), no lowercase letter at all
 * (`ENABLED`, `OUTCOME_LEADS`), or a camel hump (`bidAmount`). Anything else —
 * including any ordinary sentence, which is the case that matters — is left
 * alone.
 *
 * **A space is the strongest signal of all, and it is checked first.** Keys do
 * not contain spaces, so anything that does was written by a person or a
 * language model — and one of them will eventually write "Sent - awaiting
 * reply", where the hyphen rule alone would have eaten the dash and the
 * meaning with it. Shouting survives the space test, because "MAXIMIZE
 * CONVERSIONS" is still a value to calm down.
 */
export function isMachineKey(value: string): boolean {
  const text = value.trim();
  if (text === "") return false;

  // All caps, and long enough to be a word rather than an acronym someone
  // typed deliberately: "CTR" as a column header is not a key.
  const shouted = text === text.toUpperCase() && /[A-Z]{4,}/.test(text);
  if (/\s/.test(text)) return shouted;

  if (/[_-]/.test(text)) return true;
  if (shouted) return true;
  if (/[a-z][A-Z]/.test(text)) return true;

  return false;
}

/** One word, cased for the middle of a sentence. */
function word(raw: string): string {
  const lower = raw.toLowerCase();
  return ACRONYMS[lower] ?? lower;
}

/**
 * A backend key or enum as a sentence-case label, or the value unchanged when
 * it was already written for a person.
 *
 *   budget_amount    -> Budget amount
 *   ENABLED          -> Enabled
 *   OUTCOME_LEADS    -> Outcome leads
 *   bidAmount        -> Bid amount
 *   avg_ctr          -> Avg CTR
 *   Ad goal          -> Ad goal        (untouched)
 *   Maximize clicks  -> Maximize clicks (untouched)
 */
export function humaniseKey(value: string): string {
  const text = value.trim();
  if (text === "" || !isMachineKey(text)) return text;

  const words = text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter((part) => part !== "")
    .map(word);

  if (words.length === 0) return text;

  const [first, ...rest] = words as [string, ...string[]];
  // An acronym leading the label keeps its own casing rather than being
  // sentence-cased back down: "URL slug", not "Url slug".
  const head = ACRONYMS[first.toLowerCase()] === first ? first : first.charAt(0).toUpperCase() + first.slice(1);

  return [head, ...rest].join(" ");
}

/**
 * The same, for a value that may be absent.
 *
 * The em dash matches what `formatMoney` prints for a figure that does not
 * exist — a missing status and a missing amount should not look different.
 */
export function humaniseOr(value: string | null | undefined, fallback = "—"): string {
  const text = (value ?? "").trim();
  return text === "" ? fallback : humaniseKey(text);
}

/**
 * Social platforms, by the key `brand_profile.contact_details.social_links`
 * uses.
 *
 * A capitalised key is not a brand's name: the scraper reports `linkedin`,
 * `tiktok` and `youtube`, and CSS `capitalize` turned those into "Linkedin",
 * "Tiktok" and "Youtube" on the brand sheet — three companies' names spelled
 * wrong on a page about getting a customer's own brand right.
 *
 * A platform the scraper adds later still renders, de-keyed, rather than being
 * dropped.
 */
const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  reddit: "Reddit",
  snapchat: "Snapchat",
  threads: "Threads",
  tiktok: "TikTok",
  tumblr: "Tumblr",
  twitter: "Twitter",
  whatsapp: "WhatsApp",
  x: "X",
  youtube: "YouTube",
};

export function platformLabel(key: string): string {
  const mapped = PLATFORM_LABELS[key.trim().toLowerCase()];
  if (mapped !== undefined) return mapped;

  // `humaniseKey` is deliberately conservative — a bare lowercase word could be
  // something a person typed, so it leaves it alone. Here it cannot be: this
  // argument is always a key, so the first letter is capitalised either way.
  const label = humaniseKey(key);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * The ChatGPT Ads service's field names, as the form calls them.
 *
 * Two places need this and both show the name to the customer: `advise`'s
 * recommendations (`AdsRecommendation.field`) and a 422's per-field problems
 * (`AdsFieldProblem.field`). The service's spellings are confirmed — they are
 * the ones in `ads-errors.test.ts`, captured from real responses — and the
 * form's own camelCase names are here too, because a recommendation is
 * documented as matching "one of our form field names" and both spellings have
 * been seen.
 *
 * Anything unlisted falls through to `humaniseKey`, so a field the service
 * adds reads as "Something new" rather than `something_new`.
 */
const ADS_FIELD_LABELS: Record<string, string> = {
  ad_type: "Ad format",
  adtype: "Ad format",
  bid_amount: "Bid",
  bidamount: "Bid",
  budget_amount: "Budget",
  budget_type: "Budget type",
  business_description: "Business description",
  description: "Ad description",
  end_date: "End date",
  goal: "Campaign goal",
  headline: "Headline",
  locations: "Locations",
  start_date: "Start date",
  title: "Headline",
  topics: "Topics",
  tracking_connected: "Conversion tracking",
};

export function adsFieldLabel(field: string): string {
  const key = field.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ADS_FIELD_LABELS[key] ?? humaniseKey(field);
}

/**
 * GA4's bracketed placeholders, as words.
 *
 * `(not set)`, `(none)` and `(direct)` are Google's own spellings and they
 * arrive as ordinary dimension values — a row labelled `(not set)` is a real
 * row, not a missing one. They are readable to anyone who lives in Analytics
 * and cryptic to everyone else, and this app's readers are the second group.
 *
 * ## Why this runs before the rows are folded together, not after
 *
 * `mergeNamedCounts` sums rows that share a label, and both GA4's own
 * `(not set)` and our fallback for a row with no label at all have to land on
 * the SAME string or one source's traffic splits across two bars — the exact
 * bug `analytics-repo.ts` fixed once already. Normalising at the point each
 * row is read keeps them identical; relabelling after the merge would too, but
 * only until someone added a third caller.
 *
 * Every other value is left alone: `google / organic` is what the customer's
 * own reports say, and tidying it would make the two disagree.
 */
const GA4_PLACEHOLDERS: Record<string, string> = {
  "(not set)": "Not set",
  "(none)": "None",
  "(direct)": "Direct",
  "(other)": "Other",
};

export function dimensionLabel(value: string): string {
  return GA4_PLACEHOLDERS[value.trim().toLowerCase()] ?? value;
}
