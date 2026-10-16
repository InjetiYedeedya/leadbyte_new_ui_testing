/**
 * Which Google products one account has actually granted us.
 *
 * ## Why this exists
 *
 * Analytics and Search Console share ONE Frontend Check row
 * (`Google_website_Frontend_check`), and the app read that row as "both are
 * connected". They are not one grant. The three Google flows ask Google for
 * different scopes (probed 2026-09-30):
 *
 *   google_cloud_console  (Analytics)       analytics.readonly
 *   search_console        (Search Console)  webmasters.readonly
 *   google_unified_auth   (both)            both
 *
 * So someone who connected Analytics alone was shown Search Console as
 * Connected, and a Search-Console-only consent recorded Analytics as
 * connected. The row now also says which products were granted, in
 * `googleProducts`, and each screen asks about the product it needs.
 *
 * ## Rows written before this field existed
 *
 * A valid row with no `googleProducts` is read as BOTH, which is what the app
 * has always said about it. Reading it as neither would tell every existing
 * customer their Google connection had vanished overnight, which is the worse
 * error; the field corrects itself the next time they connect.
 */

export type GoogleProduct = "analytics" | "search_console";
export type GoogleFlow = "analytics" | "search-console" | "unified";

export const GOOGLE_PRODUCTS_FIELD = "googleProducts";

const ALL: readonly GoogleProduct[] = ["analytics", "search_console"];

/** What each flow asks Google for. */
export const FLOW_PRODUCTS: Record<GoogleFlow, readonly GoogleProduct[]> = {
  analytics: ["analytics"],
  "search-console": ["search_console"],
  unified: ALL,
};

export function isGoogleFlow(value: string | null | undefined): value is GoogleFlow {
  return value === "analytics" || value === "search-console" || value === "unified";
}

/** The products a row lists, or null when the row predates the field. */
export function parseGoogleProducts(raw: unknown): GoogleProduct[] | null {
  if (typeof raw !== "string") return null;
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is GoogleProduct => (ALL as readonly string[]).includes(part));
}

/**
 * Everything granted across an account's VALID rows. "all" when any of them
 * predates the field — see the note above.
 */
export function grantedGoogleProducts(validRows: readonly unknown[]): Set<GoogleProduct> | "all" {
  const granted = new Set<GoogleProduct>();
  for (const row of validRows) {
    const products =
      row && typeof row === "object"
        ? parseGoogleProducts((row as Record<string, unknown>)[GOOGLE_PRODUCTS_FIELD])
        : null;
    if (products === null) return "all";
    for (const product of products) granted.add(product);
  }
  return granted;
}

export function hasGoogleProduct(granted: Set<GoogleProduct> | "all", product: GoogleProduct): boolean {
  return granted === "all" || granted.has(product);
}

/**
 * What a completed consent granted.
 *
 * The flow that was started is the answer: it is what Google was asked for and
 * what the customer approved. When the flow is not known (its note lapsed),
 * the lists that came back are the evidence — properties mean Analytics, sites
 * mean Search Console. Neither means nothing can be claimed.
 */
export function productsForReturn(
  flow: GoogleFlow | null,
  lists: { properties: number; sites: number },
): GoogleProduct[] {
  if (flow !== null) return [...FLOW_PRODUCTS[flow]];
  const found: GoogleProduct[] = [];
  if (lists.properties > 0) found.push("analytics");
  if (lists.sites > 0) found.push("search_console");
  return found;
}

/**
 * The value to write: what was granted before plus what was just granted, so
 * connecting Search Console after Analytics does not take Analytics away.
 */
export function mergeGoogleProducts(
  before: Set<GoogleProduct> | "all",
  added: readonly GoogleProduct[],
): string {
  const merged = new Set<GoogleProduct>(before === "all" ? ALL : before);
  for (const product of added) merged.add(product);
  return ALL.filter((product) => merged.has(product)).join(",");
}

/**
 * Which flow this browser started, so the callback knows what was granted.
 * n8n carries nothing of ours back, so the start route leaves this note
 * (signed, httpOnly, half an hour — the same life as the consent marker).
 */
export const GOOGLE_FLOW_COOKIE = "leadbyte_google_flow";
export const GOOGLE_FLOW_MAX_AGE = 30 * 60;
