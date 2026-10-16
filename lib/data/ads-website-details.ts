/**
 * What the backend already knows about this account's advertising.
 *
 *   table: `ads-website details`, keyed on `user_id`, one row per website
 *
 * Read before an ad agent's setup form collects anything, so someone who has
 * already connected Google or Meta is shown what we have rather than being
 * asked for it again.
 *
 * ## Two unknowns, handled rather than guessed
 *
 * - **The table's exact name.** The requirement spells it `ads-website
 *   details`, with a space. That is unusual enough to be a transcription of
 *   something else, so `TABLE_CANDIDATES` tries that name first and then the
 *   two conventional spellings, logging whichever answers. One live read
 *   settles it; then this list can shrink to one entry.
 * - **The row's field names.** Confirmed from the console on 2026-09-08; the
 *   mapping onto the setup form's inputs lives in `ads-prefill.ts`. This file
 *   is now only about FINDING the right row — the name, and which of a user's
 *   rows belongs to the site on screen.
 *
 * Pure — the transport is in `ads-website-details-api.ts`.
 */

/**
 * The table, confirmed from the DynamoDB console on 2026-09-08.
 *
 * `ads-website_details` — hyphen then underscore. Kept as a list of one
 * because it was a list of guesses first, and the guesses are worth naming:
 * none of `ads-website details`, `ads-website-details` or
 * `ads_website_details` was right, and each cost a round of live testing. A
 * mixed separator is not a form anyone arrives at by convention.
 */
export const TABLE_CANDIDATES = ["ads-website_details"] as const;

/** Keys that could hold the website this row is about. */
const WEBSITE_KEYS = ["website_url", "websiteUrl", "website", "fullUrl", "full_url", "domain"];

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The comparable form of a website: no scheme, no `www.`, no trailing slash,
 * no path, lower-cased.
 *
 * A subdomain is deliberately NOT stripped. `go.chefgaa.com` and
 * `chefgaa.com` are different sites and can have different ad accounts, so
 * treating them as one would show a customer somebody else's numbers.
 */
function host(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "");
}

export function sameWebsite(a: string, b: string): boolean {
  const left = host(a);
  const right = host(b);
  // An empty value would otherwise match everything, including rows that
  // belong to another site.
  return left !== "" && left === right;
}

/**
 * The row for this website.
 *
 * Falls back to a lone row with no website on it — some tables are one row per
 * user with the site implied. That is only safe when there is exactly one and
 * nothing contradicts it; two such rows return null rather than a coin toss.
 */
export function matchWebsiteRow(
  rows: readonly unknown[],
  websiteUrl: string,
): Record<string, unknown> | null {
  const objects = rows.flatMap((row) => {
    const r = record(row);
    return r ? [r] : [];
  });

  const matched = objects.find((row) =>
    WEBSITE_KEYS.some((key) => {
      const value = row[key];
      return typeof value === "string" && sameWebsite(value, websiteUrl);
    }),
  );
  if (matched) return matched;

  const siteless = objects.filter(
    (row) => !WEBSITE_KEYS.some((key) => typeof row[key] === "string" && row[key] !== ""),
  );
  return siteless.length === 1 ? siteless[0]! : null;
}
