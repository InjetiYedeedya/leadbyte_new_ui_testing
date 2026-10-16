import { cookies } from "next/headers";

/**
 * Everything this app keeps in the browser, gone.
 *
 * ## Why sign-out needs more than `clearSession()`
 *
 * `clearSession()` deletes the five auth cookies, which is what "signed out"
 * means. But the flow keeps its own state in cookies too — the analysis job,
 * the pending website URL, the chunked campaign plan, the plan and gate
 * choices, the Google account hand-off — and none of that was being cleared.
 *
 * One of them makes this a correctness bug rather than untidiness:
 * `leadbyte_analysis_job` holds a bare job id with **no account key**
 * (`analysis-job.ts`). Sign out, sign in as someone else on the same browser,
 * and the new account polls the previous account's analysis and renders its
 * results as their own. The chunked plan is keyed by business and the gate and
 * plan cookies are suffixed with it, so those merely linger — but "merely
 * lingering" is not a property worth relying on account-to-account.
 *
 * ## Why the prefix, and not a list
 *
 * The names live in six modules and a list here would go stale the first time
 * a seventh appeared — silently, and in the direction that leaks. Every cookie
 * we set is prefixed `leadbyte_`, so the prefix IS the inventory. It also
 * catches the chunked and per-business names, which no fixed list can express.
 *
 * Anything without that prefix is somebody else's — another app on localhost,
 * an analytics cookie — and is left alone.
 *
 * Cookies are only writable from a Server Action or Route Handler, so this
 * must be called from one.
 */
const OUR_PREFIX = "leadbyte_";

export async function clearAllAccountCookies(
  { keep = [] }: { keep?: readonly string[] } = {},
): Promise<void> {
  const store = await cookies();

  for (const { name } of store.getAll()) {
    if (name.startsWith(OUR_PREFIX) && !keep.includes(name)) store.delete(name);
  }
}
