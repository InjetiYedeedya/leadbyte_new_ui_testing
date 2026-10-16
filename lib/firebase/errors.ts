/**
 * Maps Firebase Auth error codes to copy we are willing to show a user.
 *
 * Raw Firebase codes are never rendered. Two rules encoded here:
 *
 * 1. Sign-in failures are deliberately indistinguishable. `user-not-found`
 *    and `wrong-password` both return "Email or password is incorrect" so the
 *    form cannot be used to enumerate which email addresses have accounts.
 *    Sign-up necessarily reveals `email-already-in-use`; that is unavoidable.
 * 2. A user closing the Google popup is not an error. It returns null, and the
 *    caller shows nothing.
 */

/** Errors that mean "the user changed their mind", not "something broke". */
const SILENT = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/user-cancelled",
]);

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/wrong-password": "Email or password is incorrect.",
  "auth/user-not-found": "Email or password is incorrect.",
  "auth/invalid-email": "That email address isn't valid.",
  "auth/user-disabled": "That account has been disabled.",
  "auth/email-already-in-use": "An account with that email already exists.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/missing-password": "Enter your password.",
  "auth/too-many-requests": "Too many attempts. Try again in a few minutes.",
  "auth/network-request-failed": "Couldn't reach the network. Check your connection.",
  "auth/popup-blocked": "Your browser blocked the sign-in popup. Allow popups and try again.",
  "auth/unauthorized-domain": "This domain isn't authorised for sign-in.",
  "auth/operation-not-allowed": "That sign-in method isn't enabled.",
};

export const GENERIC_AUTH_ERROR = "Something went wrong signing you in. Please try again.";

/** Said while the page reloads itself after a deploy (`isStaleDeployError`). */
export const UPDATED_MESSAGE = "LeadByte has just been updated. Reloading the page — please sign in again.";

/** A production build that shipped without its Firebase keys: ours to fix, not theirs. */
export const NOT_SET_UP_MESSAGE =
  "We can't sign you in right now. This is a problem on our side — please try again shortly.";

/**
 * True when the sign-in failed because this PAGE is older than the server
 * (2026-10-01). A deploy replaces the Server Actions, and a login page loaded
 * before it still calls the old one: Next answers "Failed to find Server
 * Action … from an older or newer deployment", which surfaced as "Something
 * went wrong signing you in" — every deploy, for whoever had the page open.
 * A reload fetches the current page and the sign-in then works.
 */
export function isStaleDeployError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /Failed to find Server Action|older or newer deployment|Server Action .+ was not found/i.test(message);
}

/** Pulls the `code` off an unknown thrown value without assuming its shape. */
function codeOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" ? code : null;
}

/**
 * True for a failure the PERSON caused or chose — a wrong password, a closed
 * popup, a weak password — as opposed to something breaking.
 *
 * The form logged every failure with `console.error`, and in development Next
 * turns any `console.error` into a red "Console Error" overlay — so a mistyped
 * password looked like the app crashing (2026-10-06), while the form was
 * already showing "Email or password is incorrect." These are logged as
 * warnings instead; anything unrecognised stays an error.
 */
export function isExpectedAuthError(error: unknown): boolean {
  const code = codeOf(error);
  return code !== null && (SILENT.has(code) || MESSAGES[code] !== undefined);
}

/**
 * Returns the message to display, or null when the failure should be shown as
 * nothing at all (the user dismissed a popup).
 */
export function authErrorMessage(error: unknown): string | null {
  const code = codeOf(error);
  if (code !== null && SILENT.has(code)) return null;
  if (code !== null && MESSAGES[code] !== undefined) return MESSAGES[code];
  return GENERIC_AUTH_ERROR;
}
