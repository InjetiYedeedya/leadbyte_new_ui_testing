/**
 * The value of the `leadbyte_pending_url` cookie, and whose it is.
 *
 * The cookie outlives a session on purpose: a visitor types their website
 * while signed OUT, then signs up, and `completeSignIn` saves it to the new
 * account — which is why sign-in clears every other `leadbyte_` cookie but
 * keeps this one. But the same cookie is written when a SIGNED-IN customer
 * types a website, and it stays until their analysis lands. If that session
 * lapsed in between, whoever signed in next on that browser inherited the
 * previous account's website and had it saved and analysed as their own
 * (2026-10-16: a new account was shown ZippyGo).
 *
 * So a website typed while signed in carries its account
 * (`<encoded account>|<url>`), and only that account may pick it up. One typed
 * signed out stays a bare url, free for the account about to be created.
 * The account is URI-encoded, so it cannot contain the `|`.
 */

const SEPARATOR = "|";

export function encodePendingUrl(url: string, owner?: string | null): string {
  return owner ? `${encodeURIComponent(owner)}${SEPARATOR}${url}` : url;
}

/**
 * What sign-in does with a website typed on the entry screen.
 *
 * - `save`: a brand-new account — the site was typed moments ago on the way
 *   to creating it, so it is saved and analysed straight away.
 * - `confirm`: an EXISTING account (or one the backend did not say is new).
 *   Never saved at sign-in: it may not be theirs, and saving it replaced the
 *   website on file. They confirm it on the setup screen with Analyze.
 * - `none`: nothing typed.
 */
export type PendingAtSignIn = "save" | "confirm" | "none";

export function pendingUrlAtSignIn(
  url: string | null | undefined,
  isNewUser: boolean | undefined,
): PendingAtSignIn {
  if (!url) return "none";
  return isNewUser === true ? "save" : "confirm";
}

/** The url, when `account` may use it; null when it belongs to someone else. */
export function decodePendingUrl(
  raw: string | null | undefined,
  account: string | null | undefined,
): string | null {
  if (!raw) return null;
  const cut = raw.indexOf(SEPARATOR);
  if (cut === -1) return raw;
  let owner: string;
  try {
    owner = decodeURIComponent(raw.slice(0, cut));
  } catch {
    return null;
  }
  const url = raw.slice(cut + 1);
  return account && owner === account && url !== "" ? url : null;
}
