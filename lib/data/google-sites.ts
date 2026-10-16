import { MAX_ROWS, collectFromPayload } from "@/lib/data/google-callback-payload";

/**
 * The Search Console sites a customer can choose between.
 *
 * ## Where these come from
 *
 * After consent, n8n redirects back with `?sites=<URI-encoded JSON>`, the same
 * way the Analytics flow sends `?accounts=`. The rows are Google's own
 * `webmasters.sites.list` entries:
 *
 *   { site_url, permission_level, email, name }
 *
 * `siteUrl` is either a URL prefix (`https://zippygo.ai/`) or a domain property
 * (`sc-domain:zippygo.ai`), and it is the identifier every later query uses —
 * which is why it doubles as the row's id here.
 *
 * One Google account routinely verifies several — an http and an https prefix,
 * a www and a bare host, a domain property covering all of them — so the
 * customer has to say which one this workspace should read.
 */

/** Where the list waits between the callback and the picker. */
export const GOOGLE_SITES_COOKIE = "leadbyte_google_sites";

export interface GoogleSite {
  siteUrl: string;
  /** Google's own wording: `siteOwner`, `siteFullUser`, `siteRestrictedUser`,
      `siteUnverifiedUser`. Empty when the payload omitted it. */
  permissionLevel: string;
  /** The Google account. Per-row in the Search Console flow, on the wrapper in
      the combined one — see `collectFromPayload`, which fills in the latter. */
  email: string;
  /** That account's display name ("apps ntimes"). Carried so the save call can
      echo back everything the backend sent, as the Analytics one does. */
  name: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Reads the site list, from either a JSON string or an already-parsed value.
 *
 * Accepts both key styles — Google's `siteUrl` and a snake_case `site_url` —
 * because the parsed list is re-serialised into a cookie between the callback
 * and the picker and comes back through here. Reading only one style made that
 * round trip return an empty list for the Analytics picker; the same shape of
 * bug is not worth repeating.
 */
export function parseGoogleSites(raw: unknown): GoogleSite[] {
  let value = raw;

  if (typeof raw === "string") {
    if (raw.trim() === "") return [];
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (value === null || value === undefined) return [];
  const rows = Array.isArray(value) ? value : [value];

  return rows
    .map(record)
    .map((r) => ({
      siteUrl: str(r.siteUrl || r.site_url || r.site).trim(),
      permissionLevel: str(r.permissionLevel || r.permission_level).trim(),
      email: str(r.email).trim(),
      name: str(r.name).trim(),
    }))
    // No site URL means nothing to submit, so the row cannot be chosen.
    .filter((s) => s.siteUrl !== "")
    .slice(0, MAX_ROWS);
}

/** Finds Search Console sites anywhere in a callback payload. */
export function findGoogleSites(raw: unknown): GoogleSite[] {
  return collectFromPayload(raw, parseGoogleSites, (s) => s.siteUrl);
}

/**
 * How a site reads on screen.
 *
 * `sc-domain:zippygo.ai` is Google's wire format for a domain property and
 * means nothing to a customer, so it is shown as the domain it covers, with the
 * distinction carried by {@link siteKind} instead.
 */
export function siteLabel(site: GoogleSite): string {
  return site.siteUrl.startsWith("sc-domain:")
    ? site.siteUrl.slice("sc-domain:".length)
    : site.siteUrl;
}

/** Domain properties cover every subdomain and protocol; URL prefixes do not.
    That difference decides which one someone should pick, so it is shown. */
export function siteKind(site: GoogleSite): string {
  return site.siteUrl.startsWith("sc-domain:")
    ? "Domain — covers every subdomain"
    : "URL prefix";
}
