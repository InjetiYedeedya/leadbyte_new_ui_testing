import type { AdsCheck, VerifyResult } from "./ads-types";

/**
 * Reading `verify`'s answer before a key is stored.
 *
 * Pure, so the decision that gates the whole flow is testable without a
 * network call — the Server Action that uses it cannot be.
 */

/**
 * Whether the key may be stored and used.
 *
 * `usable`, not `valid`: a key the service RECOGNISES can still be unusable —
 * no advertiser account attached, billing not set up — and `valid` alone would
 * wave those through to a `prepare` that refuses them much later, with the
 * customer three screens away from the cause.
 *
 * Absent means no. The service answers this on every verify, so a reply
 * without it is one we do not understand, and guessing "yes" there stores a
 * key on a hunch.
 */
export function keyIsUsable(result: VerifyResult | null | undefined): boolean {
  return result?.usable === true;
}

/**
 * A check's name as a sentence reads it.
 *
 * `key` arrives as an identifier — `account_status`, `billing` — and a raw one
 * dropped into prose reads as a leak of our own vocabulary.
 */
function readableCheck(key: string): string {
  return key.replace(/[_-]+/g, " ").trim().toLowerCase();
}

/** One failed check, as a sentence the customer can act on. */
function describeCheck(check: AdsCheck): string | null {
  const subject = typeof check.key === "string" ? readableCheck(check.key) : "";
  const detail = typeof check.value === "string" ? check.value.trim() : "";

  if (subject && detail) {
    // A short value is a STATUS token — "rejected", "unpaid" — and reads as one
    // only when quoted next to the thing it is the status of. A long one is
    // already prose and quoting it makes a sentence into a specimen.
    return detail.length <= 40 && !detail.includes(" ")
      ? `The ${subject} check came back “${detail}”.`
      : `${subject.charAt(0).toUpperCase()}${subject.slice(1)}: ${detail}`;
  }
  if (detail) return detail;
  if (subject) return `The ${subject} check failed.`;
  return null;
}

/**
 * Why it cannot be used, in the service's own words.
 *
 * Checks marked neither pass nor fail are skipped deliberately: the service
 * uses that state for facts it cannot determine (its `tracking` check is one),
 * and reporting "we could not tell" as the reason a key was refused sends
 * someone to fix something that was never broken.
 *
 * ## It names WHICH check, not just its value
 *
 * This returned `failed.value` alone until 2026-09-22, so a live refusal
 * rendered as the single word **“rejected”** — a status with no subject. The
 * service sent both halves; we printed the one that means nothing on its own
 * and dropped the one that says where to go and fix it.
 *
 * ## Every failure, not the first
 *
 * Naming one of three sends someone to fix it, retry, and meet the next — a
 * conversation with the service one round at a time. They are joined into one
 * message because this is the only thing the customer sees.
 *
 * Falls back to a general sentence rather than an empty string, for the same
 * reason.
 */
export function refusalReason(result: VerifyResult | null | undefined): string {
  const failed = (result?.checks ?? []).filter(
    (check: AdsCheck) => check.ok === false && check.informational !== true,
  );
  const reasons = failed
    .map((check) => describeCheck(check))
    .filter((reason): reason is string => reason !== null);

  if (reasons.length === 0) {
    return "That key was refused. Check it in Ads Manager and try again.";
  }
  return reasons.join(" ");
}
