import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { isBackendConfigured } from "@/lib/api/config";
import { apiRequestWithToken } from "@/lib/api/client";
import { getAdminRepo } from "@/lib/data/admin-repo";
import { normEmail, type Row } from "./fields";
import { ADMIN_TABLES } from "./tables";

/**
 * Writes the rows the admin Activity Log and Notifications screens read.
 *
 * The legacy app wrote them from the browser on every sign-in and sign-out,
 * plus a "new user" notification the first time someone signed up. This app
 * wrote none of them, so those two admin screens would have frozen on the day
 * of the cutover.
 *
 * ## Both functions MUST NEVER THROW
 *
 * They run after the session cookie is written (rule 4 in CLAUDE.md): the
 * person IS signed in, and a failed log line must not report that as a failed
 * sign-in. Every failure is logged and swallowed.
 *
 * The token is passed in rather than read from the cookie: the sign-in action
 * has only just set the cookie, and a read in the same request is not a
 * guarantee worth resting on. SERVER-ONLY.
 */

async function write(table: string, row: Row, accessToken: string | undefined): Promise<void> {
  if (!isBackendConfigured()) {
    await getAdminRepo().put(table, row);
    return;
  }
  await apiRequestWithToken(`/api/data/${encodeURIComponent(table)}`, { method: "POST", body: row }, accessToken);
}

async function userAgent(): Promise<string> {
  try {
    return (await headers()).get("user-agent") ?? "";
  } catch {
    return "";
  }
}

function suffix(): string {
  return randomUUID().slice(0, 8);
}

export async function recordSignIn(input: {
  email: string;
  userId?: string;
  accessToken?: string;
  isNewUser?: boolean;
  displayName?: string;
  provider?: string;
}): Promise<void> {
  const email = normEmail(input.email);
  if (email === "") return;
  const now = new Date();
  const agent = await userAgent();

  const writes: Promise<void>[] = [
    write(
      ADMIN_TABLES.activityLog,
      {
        logId: `log_${now.getTime()}_${suffix()}`,
        email,
        userId: input.userId ?? "",
        action: "login",
        timestamp: now.toISOString(),
        userAgent: agent,
      },
      input.accessToken,
    ),
  ];

  if (input.isNewUser) {
    writes.push(
      write(
        ADMIN_TABLES.adminNotifications,
        {
          notificationId: `notif_${now.getTime()}_${suffix()}`,
          type: "new_user",
          read: false,
          timestamp: now.toISOString(),
          email,
          userId: input.userId ?? "",
          displayName: input.displayName ?? "",
          provider: input.provider ?? "",
        },
        input.accessToken,
      ),
    );
  }

  const results = await Promise.allSettled(writes);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error(`[admin] could not record the sign-in for ${email}:`, result.reason);
    }
  }
}

/**
 * One admin-panel change, for the Activity log (the roles guide's audit
 * trail): invites, removals, role changes and permission edits. Called from a
 * Server Action after the change has succeeded, so the session cookie is
 * there. NEVER THROWS — a failed log line must not undo or misreport a change
 * that happened.
 */
export async function recordAdminAction(input: {
  email: string;
  action: `admin_${string}`;
  detail: string;
}): Promise<void> {
  const email = normEmail(input.email);
  const now = new Date();
  try {
    await getAdminRepo().put(ADMIN_TABLES.activityLog, {
      logId: `log_${now.getTime()}_${suffix()}`,
      email,
      action: input.action,
      detail: input.detail,
      timestamp: now.toISOString(),
      userAgent: await userAgent(),
    });
  } catch (error) {
    console.error(`[admin] could not record ${input.action} by ${email}:`, error);
  }
}

export async function recordSignOut(input: { email: string; userId?: string; accessToken?: string }): Promise<void> {
  const email = normEmail(input.email);
  if (email === "") return;
  const now = new Date();
  try {
    await write(
      ADMIN_TABLES.activityLog,
      {
        logId: `log_${now.getTime()}_${suffix()}`,
        email,
        userId: input.userId ?? "",
        action: "logout",
        timestamp: now.toISOString(),
        userAgent: await userAgent(),
      },
      input.accessToken,
    );
  } catch (error) {
    console.error(`[admin] could not record the sign-out for ${email}:`, error);
  }
}
