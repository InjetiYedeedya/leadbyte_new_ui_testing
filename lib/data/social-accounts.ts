import { cookies } from "next/headers";
import type { OAuthPlatform } from "@/lib/api/oauth-status";

/**
 * The account a social connection actually landed on.
 *
 * ## Why this exists
 *
 * "Connected" on its own leaves the obvious question unanswered — which
 * account? One Google login owns several YouTube channels, and a Meta login
 * several pages. The same reasoning as the connected mailbox, which names the
 * address for exactly this reason.
 *
 * ## Why a cookie IS the record, not a cache
 *
 * n8n returns the browser with the account list in the query string and there
 * is no endpoint that will tell us afterwards — `docs/backend/BACKEND.md` §A1
 * asks for a `GET /api/connections` precisely because it does not exist. So
 * this is the app's only memory of the name. Thirty days, httpOnly, and the
 * `leadbyte_` prefix so signing out sweeps it (`lib/auth/sign-out.ts` clears
 * by prefix).
 *
 * If the cookie lapses the row falls back to plain "Connected", which is still
 * true — the status comes from the check table, not from here.
 *
 * ## Why the parsing is tolerant
 *
 * Two shapes are confirmed and they have nothing in common (2026-09-11):
 * YouTube sends FLAT query parameters (`?title=…&channel_id=UC…`, no JSON at
 * all), Facebook sends `?accounts=[{ user, pages: [{id,name}, …] }]`.
 * Instagram's is still uncaptured. So the keys are tried in order rather than
 * hard-coded — the same approach `google-callback-payload.ts` takes, and for
 * the same reason: three providers name the same two facts differently.
 */

export interface SocialAccount {
  /** What to show. Falls back to the id when the provider sent no name. */
  name: string;
  /** The provider's own id, kept so a later API call can address it. */
  id: string;
}

/** How many to keep. Cookies cap around 4KB and nobody has fifty channels. */
const MAX_ACCOUNTS = 10;

/** Thirty days, matching the mailbox cookie for the same "this is the record" reason. */
export const SOCIAL_ACCOUNTS_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * An hour, matching `OFFER_MAX_AGE` on the Google picker.
 *
 * The offer is a list waiting to be chosen from, not a record. It has to
 * outlive a distraction — a phone call between consent and the click — without
 * sitting in the browser for a month describing pages that may have been
 * deleted since.
 */
export const SOCIAL_OFFER_MAX_AGE = 60 * 60;

/** The account this workspace posts as. One per platform. */
export function socialAccountsCookie(platform: OAuthPlatform): string {
  return `leadbyte_social_account_${platform}`;
}

/**
 * The list still waiting to be picked from — separate from the record above,
 * and the separation is what makes "a choice is outstanding" answerable.
 *
 * One cookie holding both would have to encode which state it is in, and the
 * distinction is not cosmetic: the row shows the chosen page's name and the
 * agent posts to it. Five pages in the record would mean "we will post to all
 * five", which is not what a pending choice means.
 */
export function socialOfferCookie(platform: OAuthPlatform): string {
  return `leadbyte_social_offer_${platform}`;
}

/**
 * "I left the picker without choosing" — and therefore not connected.
 *
 * ## Why a marker rather than nothing
 *
 * The confirmation says leaving means no account is connected, and that has to
 * be TRUE. Consent has already happened by then and n8n has already written
 * its own `Status: "Done"` row; there is no documented endpoint that unwrites
 * it (`docs/backend/BACKEND.md` §A1 asks for the read, and no disconnect
 * exists at all). So the check table will go on saying "Done" whatever we do.
 *
 * This is what makes the sentence honest anyway: a declined platform is
 * excluded everywhere the app asks whether a social account is connected — the
 * Connections row and the agent's gate, which are the only two readers. The
 * row says Not connected, the agent stays blocked, and no page name is shown,
 * which is exactly what "no account will be connected" describes.
 *
 * Cleared by any new connect and by saving a choice, so it can only ever
 * describe the decision that set it.
 */
export function socialDeclinedCookie(platform: OAuthPlatform): string {
  return `leadbyte_social_declined_${platform}`;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * One flat row → an account, or null.
 *
 * Name keys in order: YouTube sends `title`, Meta sends `name`, and
 * `page_name` / `username` cover the shapes the legacy app's social list used.
 */
function readAccount(row: unknown): SocialAccount | null {
  if (typeof row !== "object" || row === null) return null;
  const record = row as Record<string, unknown>;

  const name =
    str(record.title) ||
    str(record.name) ||
    str(record.page_name) ||
    str(record.username);
  const id =
    str(record.channel_id) ||
    str(record.id) ||
    str(record.page_id) ||
    str(record.account_id);

  // An entry with neither is not an account. Keeping it would render a blank
  // line under "Connected", which reads worse than saying nothing.
  if (name === "" && id === "") return null;
  return { name: name || id, id };
}

/**
 * Parses the payload n8n returns. Accepts a list or a single object.
 *
 * ## Facebook nests, and the nesting is the point
 *
 * Its observed payload (2026-09-11) is
 * `[{ user: {id,name}, pages: [{id,name}, …] }]` — the person who authorised,
 * then the pages they granted. **The pages are what this shows**: the agent
 * posts to a page, not to a person, so naming "Thilak Sai" over five pages
 * would name the one account it will never post as.
 *
 * A row with `pages` is therefore expanded into its pages and the `user` is
 * dropped. Rows without it are read flat, which is YouTube and everything
 * else.
 */
export function parseSocialAccounts(payload: unknown): SocialAccount[] {
  const rows = Array.isArray(payload) ? payload : [payload];

  const accounts: SocialAccount[] = [];
  for (const row of rows) {
    const pages =
      typeof row === "object" && row !== null
        ? (row as Record<string, unknown>).pages
        : undefined;

    if (Array.isArray(pages)) {
      for (const page of pages) {
        const account = readAccount(page);
        if (account) accounts.push(account);
      }
      continue;
    }

    const account = readAccount(row);
    if (account) accounts.push(account);
  }

  return accounts.slice(0, MAX_ACCOUNTS);
}

/**
 * The account named by FLAT query parameters rather than a JSON blob.
 *
 * YouTube returns `?title=Leadbyte+ai&channel_id=UC…` — no `accounts`
 * parameter at all, which is why the first version of this read nothing on a
 * connection that had worked perfectly. Facebook returns JSON; the callback
 * tries that first and falls back here.
 */
export function readFlatSocialAccount(params: URLSearchParams): SocialAccount[] {
  const account = readAccount({
    title: params.get("title"),
    name: params.get("name"),
    page_name: params.get("page_name"),
    username: params.get("username"),
    channel_id: params.get("channel_id"),
    id: params.get("account_id") ?? params.get("page_id"),
  });
  return account ? [account] : [];
}

/** Parses the raw query parameter. Never throws — a bad value means "unknown". */
export function parseSocialAccountsParam(raw: string | null): SocialAccount[] {
  if (!raw || raw.trim() === "") return [];
  try {
    return parseSocialAccounts(JSON.parse(raw));
  } catch (error) {
    console.error("[social-accounts] could not read the accounts parameter:", error);
    return [];
  }
}

/**
 * What to print on the row.
 *
 * Several accounts are named up to two and then counted: a row is one line, and
 * five channel names in it stop being information.
 */
export function describeSocialAccounts(accounts: readonly SocialAccount[]): string | null {
  if (accounts.length === 0) return null;
  if (accounts.length <= 2) return accounts.map((a) => a.name).join(", ");
  return `${accounts[0]!.name}, ${accounts[1]!.name} +${accounts.length - 2} more`;
}

/** Safe anywhere — reading cookies has no restriction. */
export async function getSocialAccounts(platform: OAuthPlatform): Promise<SocialAccount[]> {
  const store = await cookies();
  return parseSocialAccountsParam(store.get(socialAccountsCookie(platform))?.value ?? null);
}

/** The list still waiting to be chosen from. Empty once a choice is saved. */
export async function getSocialOffer(platform: OAuthPlatform): Promise<SocialAccount[]> {
  const store = await cookies();
  return parseSocialAccountsParam(store.get(socialOfferCookie(platform))?.value ?? null);
}

/** Whether the customer left the picker without choosing. */
export async function isSocialDeclined(platform: OAuthPlatform): Promise<boolean> {
  const store = await cookies();
  return store.get(socialDeclinedCookie(platform)) !== undefined;
}
