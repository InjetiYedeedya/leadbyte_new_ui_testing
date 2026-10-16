"use server";

import { safeReturnPath } from "@/lib/url-safety";
import { redirect } from "next/navigation";
import { currentBusinessId } from "@/components/page-shell";
import { setSelectedLeadIds } from "@/lib/data/lead-selection";

/**
 * Saves which ads leads were left checked, then sends the browser back where
 * it came from. `leadIds` is every checkbox's own `name`/`value` — the
 * browser only includes the CHECKED ones, so an empty submission here really
 * does mean "chose zero", not "the field never loaded".
 *
 * `from` only ever comes from a link this app generated (the current page's
 * own pathname, see `lead-source-picker.tsx`), but it still rides in a form
 * field a browser's devtools can edit — so it is restricted to an internal
 * path rather than trusted as a redirect target, same caution `session.ts`
 * and the Google connect flow use for anything that becomes a `redirect()`.
 */
export async function saveLeadSelection(formData: FormData): Promise<void> {
  const businessId = await currentBusinessId();
  const ids = formData.getAll("leadIds").map(String);
  await setSelectedLeadIds(businessId, ids);

  const requested = String(formData.get("from") ?? "");
  const from = safeReturnPath(requested, "/agents");
  redirect(from);
}
