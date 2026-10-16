import { getSession } from "@/lib/auth/session";

/**
 * Who a ChatGPT Ads call is for: the FIREBASE UID.
 *
 * ## Why the uid and not the email
 *
 * Confirmed by the backend team against a live call (2026-09-16): their own
 * example sends `"user_id": "yNGTBxGSJZPkoCWZXDcAOce7oGH2"`, which is a
 * Firebase uid. We were sending `businessId` — the account email — so every
 * call was filed under an identity the service was not keyed on. `verify` did
 * not care (it validates a key, not a customer), which is exactly why this
 * survived: the first call to actually store something, `save_key`, is where
 * it showed up.
 *
 * ## Why changing it is safe NOW and would not have been later
 *
 * `user_id` partitions EVERYTHING the service stores — the saved advertiser
 * key, the read website, every campaign. Change it once rows exist and they do
 * not move, they disappear: still there, filed under an id nobody asks about.
 * It is safe today only because nothing has ever been stored successfully —
 * `save_key` has never returned 200. Do not change it again without a
 * migration.
 *
 * ## Why the session and never the browser
 *
 * The service's own contract is explicit: take `user_id` from the request body
 * and any signed-in customer can read and spend on any other customer's
 * account by editing one value in devtools. Our service-scope key would honour
 * it. This reads the httpOnly session cookie instead, which the browser cannot
 * write.
 *
 * ## The email fallback
 *
 * `userId` is absent in mock mode, where `businessId` is all there is. Falling
 * back keeps the unconfigured path working — the same rule as
 * `isBackendConfigured()` — and against a real backend the uid is always
 * present, so the fallback never fires where it would matter.
 */
export async function adsUserId(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  return session.userId ?? session.businessId ?? null;
}
