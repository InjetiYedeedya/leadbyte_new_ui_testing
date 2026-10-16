"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { isRedirectError } from "@/lib/auth/session-expired";
import { getAdminRepo } from "@/lib/data/admin-repo";
import { ADMIN_TABLES } from "@/lib/admin/tables";
import { normEmail } from "@/lib/admin/fields";
import { checkClaim } from "@/lib/admin/invites";

/**
 * Turns a pending invite into admin access.
 *
 * NOT behind `requireAdmin()` — the person claiming is, by definition, not an
 * admin yet. What protects it instead is that the row is looked up by the
 * SIGNED-IN email, never by anything in the link, and the link's token must
 * match the one stored on that row. A forwarded link is useless to anyone
 * signed in as someone else.
 *
 * The legacy app did this check in the browser, where the token comparison
 * could simply be skipped.
 */
export async function claimAdminInvite(form: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const email = normEmail(session.businessId);
  const tokenValue = form.get("token");
  const token = typeof tokenValue === "string" ? tokenValue : "";
  const back = `/admin/claim?token=${encodeURIComponent(token)}`;

  try {
    const row = await getAdminRepo().getRow(ADMIN_TABLES.adminUsers, email);
    const outcome = checkClaim(row, token);
    if (outcome === "already-active") redirect("/admin");
    if (outcome !== "claim" || !row) redirect(`${back}&result=${outcome}`);

    // The whole row back with POST, the legacy call for this write.
    await getAdminRepo().put(ADMIN_TABLES.adminUsers, {
      ...row,
      email,
      status: "active",
      claimed_at: new Date().toISOString(),
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(`[admin] claim failed for ${email}:`, error);
    redirect(`${back}&result=failed`);
  }

  revalidatePath("/", "layout");
  redirect("/admin?notice=" + encodeURIComponent("Admin access granted. Welcome to the admin panel."));
}
