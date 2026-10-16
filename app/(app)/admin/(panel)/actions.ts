"use server";

import { signText } from "@/lib/signed-text";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { dropAdminScans } from "@/lib/admin/scan-cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "@/lib/auth/session-expired";
import { APP_URL } from "@/lib/api/config";
import { getRbacMatrix, requireAdmin, requirePermission, requireSuperAdmin } from "@/lib/admin/access";
import { getAdminRepo } from "@/lib/data/admin-repo";
import { ADMIN_TABLES } from "@/lib/admin/tables";
import { normEmail, pickString, type Row } from "@/lib/admin/fields";
import { REVOKED_STATUS, isStartingAdmin } from "@/lib/admin/roles";
import { buildInviteRow, claimUrl, inviteEmailBody, inviteRefusal } from "@/lib/admin/invites";
import { buildGrantWrite, cleanAgentIds, readGrantDuration } from "@/lib/admin/grant";
import { dropEntitlementsCache } from "@/lib/entitlements";
import { frontendCheckTable } from "@/lib/admin/requests";
import { isApiKeyName } from "@/lib/admin/api-keys";
import { recordAdminAction } from "@/lib/admin/activity-log";
import {
  ALL_MODULES,
  MATRIX_ROLES,
  MODULE_LABELS,
  ROLE_LABELS,
  cellValue,
  matrixFromForm,
  matrixRow,
  parseAssignableRole,
} from "@/lib/admin/rbac";

/**
 * Every admin mutation.
 *
 * Each one starts with `requirePermission(module, "write")` — a Server
 * Action is a POST endpoint that anyone signed in can call without the page
 * that renders its form, so the layout's gate protects nothing here.
 *
 * Each one also reports its outcome through the URL (`?notice=` / `?error=`),
 * the house pattern, and every write checks that it actually happened: the
 * legacy panel's writes resolved with `{ success: false }` instead of throwing,
 * so a failed save was reported as a success in six places.
 */

function done(path: string, notice: string): never {
  revalidatePath("/admin", "layout");
  redirect(`${path}${path.includes("?") ? "&" : "?"}notice=${encodeURIComponent(signText(notice))}`);
}

function failed(path: string, error: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(signText(error))}`);
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Only our own admin paths may be returned to — never a URL from the form. */
function backTo(form: FormData, fallback: string): string {
  const value = text(form, "back");
  return value.startsWith("/admin") && !value.startsWith("//") ? value : fallback;
}

async function findRow(table: string, field: string, value: string): Promise<Row | null> {
  const read = await getAdminRepo().scan(table);
  if (!read.ok) throw new Error(read.error ?? "The table could not be read.");
  return read.rows.find((row) => pickString(row, field) === value) ?? null;
}

/**
 * Managing admins and their permissions: two locks, on purpose (the roles
 * guide's rule 3). The matrix must grant `rbac` write AND the caller must be
 * a super admin — so a role someone was generous with in the matrix still
 * cannot add admins, change roles or rewrite the matrix itself.
 */
async function requireAdminManager() {
  await requirePermission("rbac", "write");
  return requireSuperAdmin();
}

function reason(error: unknown): string {
  if (isRedirectError(error)) throw error;
  return error instanceof Error ? error.message : "Something went wrong.";
}

// ── Errors ────────────────────────────────────────────────────────────────

export async function clearError(form: FormData): Promise<void> {
  await requirePermission("errors", "write");
  const back = backTo(form, "/admin/errors");
  const errorId = text(form, "errorId");
  if (errorId === "") failed(back, "That error has no id, so it cannot be marked cleared.");

  try {
    const row = await findRow(ADMIN_TABLES.errorNotifications, "errorId", errorId);
    if (!row) failed(back, "That error no longer exists.");
    await getAdminRepo().put(ADMIN_TABLES.errorNotifications, {
      ...row,
      status: "Cleared",
      cleared: true,
      cleared_at: new Date().toISOString(),
    });
  } catch (error) {
    failed(back, `Could not mark it cleared: ${reason(error)}`);
  }
  done(back, "Marked as cleared.");
}

// ── Notifications ─────────────────────────────────────────────────────────

export async function markNotificationRead(form: FormData): Promise<void> {
  await requirePermission("notifications", "write");
  const id = text(form, "notificationId");
  const back = backTo(form, "/admin/notifications");
  try {
    const row = await findRow(ADMIN_TABLES.adminNotifications, "notificationId", id);
    if (!row) failed(back, "That notification no longer exists.");
    await getAdminRepo().put(ADMIN_TABLES.adminNotifications, { ...row, read: true });
  } catch (error) {
    failed(back, `Could not mark it read: ${reason(error)}`);
  }
  revalidatePath("/admin", "layout");
  redirect(back);
}

export async function markAllNotificationsRead(): Promise<void> {
  await requirePermission("notifications", "write");
  const back = "/admin/notifications";
  let failures = 0;
  let total = 0;
  try {
    const read = await getAdminRepo().scan(ADMIN_TABLES.adminNotifications);
    if (!read.ok) throw new Error(read.error ?? "The notifications could not be read.");
    const unread = read.rows.filter((row) => row.read !== true && String(row.read) !== "true");
    total = unread.length;
    const results = await Promise.allSettled(
      unread.map((row) => getAdminRepo().put(ADMIN_TABLES.adminNotifications, { ...row, read: true })),
    );
    failures = results.filter((result) => result.status === "rejected").length;
  } catch (error) {
    failed(back, `Could not mark them read: ${reason(error)}`);
  }
  if (failures > 0) failed(back, `${failures} of ${total} could not be marked read. Try again.`);
  done(back, total === 0 ? "Nothing was unread." : `Marked ${total} as read.`);
}

// ── Integration requests ──────────────────────────────────────────────────

async function setRequestStatus(requestId: string, status: "completed" | "rejected"): Promise<void> {
  const row = await findRow(ADMIN_TABLES.integrationRequests, "requestId", requestId);
  if (!row) throw new Error("That request no longer exists.");
  await getAdminRepo().put(ADMIN_TABLES.integrationRequests, {
    ...row,
    status,
    completedAt: new Date().toISOString(),
  });
}

/**
 * Removes the customer's connection, then closes the request.
 *
 * If the removal fails, the request is NOT silently closed: the screen asks
 * whether to close it anyway (`?confirm=`), because "done" on a connection
 * that is still there is the one outcome that would mislead the customer.
 */
export async function disconnectRequest(form: FormData): Promise<void> {
  await requirePermission("requests", "write");
  const back = backTo(form, "/admin/requests");
  const requestId = text(form, "requestId");
  let removed = false;

  try {
    const row = await findRow(ADMIN_TABLES.integrationRequests, "requestId", requestId);
    if (!row) failed(back, "That request no longer exists.");
    const table = frontendCheckTable(pickString(row, "platform"));
    const email = normEmail(row.email);
    if (table !== null && email !== "") {
      try {
        await getAdminRepo().remove(table, email);
        removed = true;
      } catch (error) {
        const message = reason(error);
        redirect(
          `/admin/requests?confirm=${encodeURIComponent(requestId)}&error=${encodeURIComponent(
            signText(`The connection could not be removed: ${message}`),
          )}`,
        );
      }
    }
    await setRequestStatus(requestId, "completed");
  } catch (error) {
    failed(back, `Could not complete the request: ${reason(error)}`);
  }
  done("/admin/requests", removed ? "Disconnected and marked completed." : "Marked completed.");
}

/** Closes a request without touching any connection. */
export async function completeRequest(form: FormData): Promise<void> {
  await requirePermission("requests", "write");
  try {
    await setRequestStatus(text(form, "requestId"), "completed");
  } catch (error) {
    failed("/admin/requests", `Could not complete the request: ${reason(error)}`);
  }
  done("/admin/requests", "Marked completed.");
}

export async function rejectRequest(form: FormData): Promise<void> {
  await requirePermission("requests", "write");
  try {
    await setRequestStatus(text(form, "requestId"), "rejected");
  } catch (error) {
    failed("/admin/requests", `Could not reject the request: ${reason(error)}`);
  }
  done("/admin/requests", "Request rejected.");
}

// ── Grant agent access ────────────────────────────────────────────────────

export async function grantAgentAccess(form: FormData): Promise<void> {
  const admin = await requirePermission("grant_access", "write");
  const email = normEmail(text(form, "email"));
  const back = `/admin/grant-access?email=${encodeURIComponent(email)}`;
  const revoking = text(form, "intent") === "revoke";
  const agents = revoking ? [] : cleanAgentIds(form.getAll("agents"));
  const months = readGrantDuration(text(form, "months"));

  // An empty selection on the grant form is almost always a slip, not a
  // decision — so removing everything has its own button, behind a
  // confirmation, rather than being what "Grant" does with nothing ticked.
  if (!revoking && agents.length === 0) {
    failed(back, "Pick at least one agent to grant. To remove all access, use “Revoke all access”.");
  }

  let granted = 0;
  try {
    const read = await getAdminRepo().scan(ADMIN_TABLES.users);
    if (!read.ok) throw new Error(read.error ?? "The users table could not be read.");
    const user = read.rows.find((row) => normEmail(row.email) === email);
    if (!user) failed(back, "This email hasn't registered yet. Ask them to sign up first, then grant access.");
    const write = buildGrantWrite(user, agents, months, admin.email);
    if (!write) failed(back, "This user's record has no id, so it cannot be updated safely.");
    await getAdminRepo().put(ADMIN_TABLES.users, write.row);
    // That customer's remembered purchases are now wrong; drop them so the
    // grant (or revoke) applies on their next page, not two minutes later.
    dropEntitlementsCache(email);
    granted = agents.length;
  } catch (error) {
    failed(back, `Access was not changed: ${reason(error)}`);
  }
  done(
    back,
    granted === 0
      ? `All agent access removed for ${email}.`
      : `Granted ${granted} ${granted === 1 ? "agent" : "agents"} to ${email} for ${months === 1 ? "1 month" : "1 year"}.`,
  );
}

// ── Roles: invites and admins ─────────────────────────────────────────────

export async function inviteAdmin(form: FormData): Promise<void> {
  // Super admin only: any admin could add or remove other admins, and a
  // compromised ordinary admin account could then lock the owners out.
  const admin = await requireAdminManager();
  const email = normEmail(text(form, "email"));
  const back = "/admin/roles";
  // One of the assignable roles, super admin included — anything else in the
  // post is refused rather than defaulted.
  const role = parseAssignableRole(text(form, "role"));
  if (!role) failed(back, "Choose a role for the new admin.");

  let emailSent = false;
  try {
    const read = await getAdminRepo().scan(ADMIN_TABLES.adminUsers);
    if (!read.ok) throw new Error(read.error ?? "The admin list could not be read.");
    const refusal = inviteRefusal(email, read.rows);
    if (refusal === "invalid") failed(back, "Enter a valid email address.");
    if (refusal === "exists") failed(back, `${email} is already an admin or has a pending invite.`);

    const token = randomUUID();
    await getAdminRepo().put(
      ADMIN_TABLES.adminUsers,
      buildInviteRow(email, admin.email, token, new Date(), role),
    );
    emailSent = await getAdminRepo().sendInviteEmail(
      inviteEmailBody(email, admin.email, claimUrl(APP_URL, token)),
    );
  } catch (error) {
    failed(back, `The invite was not created: ${reason(error)}`);
  }
  await recordAdminAction({
    email: admin.email,
    action: "admin_invite",
    detail: `Invited ${email} as ${ROLE_LABELS[role]}`,
  });
  done(
    back,
    emailSent
      ? `Invite emailed to ${email}.`
      : `Invite created for ${email}, but the email could not be sent. Use "Copy link" and send it yourself.`,
  );
}

export async function resendInvite(form: FormData): Promise<void> {
  // The same bar as inviting: re-sending an invite is issuing admin access.
  await requireAdminManager();
  const email = normEmail(text(form, "email"));
  const back = "/admin/roles";

  let sent = false;
  try {
    const row = await findRow(ADMIN_TABLES.adminUsers, "email", email);
    const token = row ? pickString(row, "token") : "";
    if (!row || token === "") failed(back, "No pending invite was found for that email.");
    sent = await getAdminRepo().sendInviteEmail(
      inviteEmailBody(email, pickString(row, "invited_by"), claimUrl(APP_URL, token)),
    );
  } catch (error) {
    failed(back, `The invite was not resent: ${reason(error)}`);
  }
  if (!sent) failed(back, `The email to ${email} could not be sent. Use "Copy link" instead.`);
  done(back, `Invite resent to ${email}.`);
}

/** Cancels a pending invite or revokes an active admin — both delete the row. */
export async function removeAdmin(form: FormData): Promise<void> {
  // Super admin only: any admin could add or remove other admins, and a
  // compromised ordinary admin account could then lock the owners out.
  const admin = await requireAdminManager();
  const email = normEmail(text(form, "email"));
  const back = "/admin/roles";

  if (email === normEmail(admin.email)) failed(back, "You can't remove your own admin access.");

  try {
    if (isStartingAdmin(email)) {
      // A starting admin with no row is an admin (`roles.ts`), so deleting
      // their row — even a re-sent invite's — would hand access straight
      // back. A revoked row says no, whatever the form claims it is.
      const row = await findRow(ADMIN_TABLES.adminUsers, "email", email);
      await getAdminRepo().put(ADMIN_TABLES.adminUsers, {
        ...(row ?? {}),
        email,
        status: REVOKED_STATUS,
        revoked_by: normEmail(admin.email),
        revoked_at: new Date().toISOString(),
      });
    } else {
      await getAdminRepo().remove(ADMIN_TABLES.adminUsers, email);
    }
  } catch (error) {
    failed(back, `Nothing was removed: ${reason(error)}`);
  }
  await recordAdminAction({
    email: admin.email,
    action: "admin_remove",
    detail: text(form, "kind") === "invite" ? `Cancelled the invite for ${email}` : `Removed ${email}`,
  });
  dropAdminScans();
  done(back, text(form, "kind") === "invite" ? `Invite for ${email} cancelled.` : `Admin access revoked for ${email}.`);
}

/**
 * Changes an admin's role. Takes effect on their next click: the role is read
 * from their row on every request (`access.ts`), so there is no session
 * holding the old one — the gap the roles guide records for its own design.
 */
export async function updateAdminRole(form: FormData): Promise<void> {
  const admin = await requireAdminManager();
  const email = normEmail(text(form, "email"));
  const role = parseAssignableRole(text(form, "role"));
  const back = "/admin/roles";

  if (!role) failed(back, "Choose a valid role.");
  // Any admin's role can be changed, super admin included — only not your own
  // (the zippy-admin rule).
  if (email === normEmail(admin.email)) failed(back, "You can't change your own role.");

  let previous = "";
  try {
    const read = await getAdminRepo().scan(ADMIN_TABLES.adminUsers);
    if (!read.ok) throw new Error(read.error ?? "The admin list could not be read.");
    const row = read.rows.find((r) => normEmail(r.email) === email) ?? null;
    previous = row ? pickString(row, "role") : "";
    if (row) {
      // The whole row back with POST — the call every write to this table uses.
      await getAdminRepo().put(ADMIN_TABLES.adminUsers, { ...row, email, role, role_updated_at: new Date().toISOString() });
    } else if (isStartingAdmin(email)) {
      // A starting admin has no row until their role is first changed.
      await getAdminRepo().put(ADMIN_TABLES.adminUsers, {
        email,
        status: "active",
        role,
        added_by: admin.email,
        created_at: new Date().toISOString(),
      });
    } else {
      failed(back, `${email} isn't an admin.`);
    }
  } catch (error) {
    failed(back, `The role was not changed: ${reason(error)}`);
  }
  dropAdminScans();
  const from = parseAssignableRole(previous);
  await recordAdminAction({
    email: admin.email,
    action: "admin_role_change",
    detail: `Changed ${email} ${from ? `from ${ROLE_LABELS[from]} ` : ""}to ${ROLE_LABELS[role]}`,
  });
  done(back, `${email} is now ${ROLE_LABELS[role]}.`);
}

/**
 * Saves the permission matrix. The editor posts every cell; `matrixFromForm`
 * runs it through `normalizeMatrix`, so super admin stays full and nothing
 * but read/write survives.
 */
export async function saveRbacPermissions(form: FormData): Promise<void> {
  const admin = await requireAdminManager();
  const back = "/admin/roles";
  const before = await getRbacMatrix();
  const matrix = matrixFromForm(form);

  try {
    await getAdminRepo().put(ADMIN_TABLES.adminUsers, matrixRow(matrix, admin.email));
  } catch (error) {
    failed(back, `The permissions were not saved: ${reason(error)}`);
  }
  dropAdminScans();

  // What changed, cell by cell, so the log says more than "edited".
  const changes: string[] = [];
  for (const role of MATRIX_ROLES) {
    for (const mod of ALL_MODULES) {
      const was = cellValue(before[role][mod]);
      const now = cellValue(matrix[role][mod]);
      if (was !== now) changes.push(`${ROLE_LABELS[role]} · ${MODULE_LABELS[mod]}: ${was} → ${now}`);
    }
  }
  await recordAdminAction({
    email: admin.email,
    action: "admin_permissions",
    detail: changes.length > 0 ? changes.join("; ").slice(0, 900) : "Saved with no changes",
  });
  done(back, changes.length === 1 ? "1 permission changed." : `${changes.length} permissions changed.`);
}

// ── API keys (super admin) ────────────────────────────────────────────────

export async function saveApiKey(form: FormData): Promise<void> {
  await requirePermission("api_keys", "write");
  const back = "/admin/api-keys";
  const name = text(form, "keyName");
  const value = text(form, "keyValue");
  if (!isApiKeyName(name)) failed(back, "Unknown key.");
  if (value === "") failed(back, "Paste the new key before saving.");

  let message = "";
  try {
    message = (await getAdminRepo().setApiKey(name, value)).message;
  } catch (error) {
    failed(back, `The key was not saved: ${reason(error)}`);
  }
  done(back, message);
}

export async function testN8nConnection(): Promise<void> {
  await requirePermission("api_keys", "write");
  const result = await getAdminRepo().testN8n();
  if (!result.ok) failed("/admin/api-keys", `n8n connection failed: ${result.message}`);
  done("/admin/api-keys", result.message);
}

// ── Refresh ───────────────────────────────────────────────────────────────

/**
 * Re-reads a screen. A plain link to the same URL can be answered from the
 * 30-second client router cache (`staleTimes`), which is exactly what someone
 * pressing Refresh is trying to get past.
 */
export async function refreshAdminPage(form: FormData): Promise<void> {
  await requireAdmin();
  // Past the few-second table memory too, not only the router cache.
  dropAdminScans();
  revalidatePath("/admin", "layout");
  redirect(backTo(form, "/admin"));
}
