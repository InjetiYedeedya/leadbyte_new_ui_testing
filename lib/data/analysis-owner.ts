/**
 * Whether a stored analysis belongs to the account asking for it.
 *
 * `/api/website-analyze/latest` takes the user from the bearer token alone,
 * so this app has no say in WHICH analysis comes back. On 2026-10-16 a
 * brand-new account that had never typed a website was shown ZippyGo's — and
 * a new account whose profile row is empty takes its whole profile, website
 * included, from this payload, so it also skipped Stage 01 straight to a
 * dashboard of someone else's business.
 *
 * The payload names its owner: `brand_profile.user_id` is the Firebase uid
 * the crawl ran for (docs/backend/website-analyze-payload.md), the same uid
 * the session holds. A payload naming a DIFFERENT uid is refused. One naming
 * none, or a session without a uid (mock mode), is let through: the check
 * can only refuse on positive evidence, or it would hide every customer's
 * real analysis the day the field is renamed.
 */

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** The uid the analysis says it was run for, or null when it does not say. */
export function analysisOwner(data: unknown): string | null {
  const root = record(data);
  const brand = record(root.brand_profile);
  return (
    text(brand.user_id) ??
    text(brand.userId) ??
    text(root.user_id) ??
    text(root.userId)
  );
}

/**
 * The same rule for a stored profile row: it is read by the account's email
 * in the URL, and a row naming a DIFFERENT email is refused rather than
 * shown as this account's business. Emails compare without case.
 */
export function profileRowBelongsTo(row: unknown, email: string | null | undefined): boolean {
  const own = record(row);
  const owner = text(own.email);
  const asker = text(email);
  if (owner === null || asker === null || !asker.includes("@")) return true;
  return owner.toLowerCase() === asker.toLowerCase();
}

/** False only when both sides name a uid and they differ. */
export function analysisBelongsTo(data: unknown, uid: string | null | undefined): boolean {
  const owner = analysisOwner(data);
  const asker = text(uid);
  if (owner === null || asker === null) return true;
  return owner === asker;
}
