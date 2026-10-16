"use server";

import { redirect } from "next/navigation";
import { clearAllAccountCookies } from "@/lib/auth/sign-out";
import { getSession } from "@/lib/auth/session";
import { recordSignOut } from "@/lib/admin/activity-log";

/**
 * Signs out, and leaves nothing of the account behind.
 *
 * This used to call `clearSession()` alone, which deleted the five auth
 * cookies and left the flow's own state in the browser — including
 * `leadbyte_analysis_job`, which carries no account key, so the next account
 * to sign in here polled the previous one's analysis. See `sign-out.ts`.
 */
export async function logout(): Promise<void> {
  // Read before the cookies go: the log row needs whose session this was.
  // `recordSignOut` cannot throw, so signing out never depends on it.
  const session = await getSession();
  if (session) {
    await recordSignOut({ email: session.ownerId, userId: session.userId, accessToken: session.accessToken });
  }
  await clearAllAccountCookies();
  redirect("/login");
}
