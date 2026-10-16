import { AGE_RANGES, GENDERS } from "@/lib/data/google-ads-setup";
import { INTERESTS } from "@/lib/data/meta-ads-setup";

/**
 * Turns an `ads-website_details` row into defaults for the ad setup forms.
 *
 * ## The row, confirmed from the DynamoDB console 2026-09-08
 *
 *   user_id (S)      partition key — the FIREBASE uid
 *   website_url (S)  sort key
 *   business_name, business_type, product_description, targeting_people,
 *   audience_age_ranges (L), audience_gender, audience_interests (L), offer,
 *   ad_schedule_{days,start,end,type,reason}, app_{id,store,url},
 *   greeting_message, phone_number, privacy_policy_url, input_url,
 *   render_engine, scrape_notes, email, updated_at
 *
 * ## What is deliberately NOT used
 *
 * - **The whole `ad_schedule_*` group.** Asked for explicitly: the schedule is
 *   not wanted as a default for now. It is left out rather than mapped and
 *   hidden, so nothing has to be remembered when it is wanted later.
 * - **Plumbing** — `user_id`, `website_url`, `input_url`, `updated_at`,
 *   `render_engine`, `scrape_notes`, `email`. Ours, not the customer's.
 * - **Fields with nowhere to go** — `phone_number`, `privacy_policy_url`,
 *   `app_id`/`app_store`/`app_url`, `business_type`, `greeting_message`. The
 *   forms have no input for them, and inventing one to hold a value we happen
 *   to have is how a setup form becomes twenty questions.
 *
 * ## Why every value is validated against the form's own options
 *
 * `audience_gender` is `"All"` in the row and the radio's value is `"all"`.
 * A checkbox or radio whose `defaultChecked` never matches fails SILENTLY —
 * the field just looks untouched, and nobody can tell a prefill that found
 * nothing from one that found something and dropped it. So each value is
 * matched case-insensitively against the real option list, and anything with
 * no home lands in the form's own "Other" free-text box rather than vanishing.
 *
 * Pure, so the mapping is testable without a backend. Everything it returns is
 * a DEFAULT: the customer can change any of it before launching, which is the
 * whole point of prefilling rather than pre-deciding.
 */

export interface AdsPrefill {
  businessName?: string;
  /** "What are you selling, and to whom?" — product and audience, joined. */
  service?: string;
  ages?: string[];
  gender?: string;
  interests?: string[];
  /** Whatever the row's interests were that the checkbox list has no option for. */
  customInterest?: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** A row's list field, which arrives as an array or as a comma-joined string. */
function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter((v) => v !== "");
  const joined = text(value);
  return joined === "" ? [] : joined.split(",").map((v) => v.trim()).filter((v) => v !== "");
}

/** The option that means the same thing, ignoring case and spacing. */
function matchOption(value: string, options: readonly string[]): string | undefined {
  const normalise = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");
  const target = normalise(value);
  return options.find((option) => normalise(option) === target);
}

export function adsPrefillFromRow(row: Record<string, unknown> | null): AdsPrefill {
  if (!row) return {};

  const prefill: AdsPrefill = {};

  const businessName = text(row.business_name);
  if (businessName !== "") prefill.businessName = businessName;

  // The form asks one question — what, and to whom — that the row answers in
  // two fields. Joined rather than truncated to one, because dropping the
  // audience half would quietly lose the more useful sentence.
  const service = [text(row.product_description), text(row.targeting_people)]
    .filter((part) => part !== "")
    .join("\n\n");
  if (service !== "") prefill.service = service;

  const gender = matchOption(text(row.audience_gender), GENDERS);
  if (gender) prefill.gender = gender;

  const ages = list(row.audience_age_ranges)
    .map((age) => matchOption(age, AGE_RANGES))
    .filter((age): age is string => age !== undefined);
  // "All" cannot be combined with a band — the form's own rule, and sending
  // both asks the backend to target everyone and 25-34 at once.
  if (ages.length > 0) prefill.ages = ages.includes("All") ? ["All"] : [...new Set(ages)];

  const rowInterests = list(row.audience_interests);
  const known = rowInterests
    .map((interest) => matchOption(interest, INTERESTS))
    .filter((interest): interest is string => interest !== undefined);
  const unknown = rowInterests.filter((interest) => !matchOption(interest, INTERESTS));

  if (unknown.length > 0) {
    // The form's escape hatch, used as designed: tick "Other" and put the real
    // words in the box beside it, so an interest the checkbox list has never
    // heard of still reaches the agent.
    prefill.interests = [...new Set([...known, "Other"])];
    prefill.customInterest = unknown.join(", ");
  } else if (known.length > 0) {
    prefill.interests = [...new Set(known)];
  }

  return prefill;
}
