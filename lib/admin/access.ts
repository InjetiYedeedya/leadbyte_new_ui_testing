import { cache } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { demoUnlocksAllowed, isBackendConfigured } from "@/lib/api/config";
import { getAdminRepo } from "@/lib/data/admin-repo";
import { ApiError } from "@/lib/api/client";
import { isRedirectError } from "@/lib/auth/session-expired";
import { ADMIN_TABLES } from "./tables";
import { isStartingAdmin, roleFor, type AdminRole } from "./roles";
import { normEmail } from "./fields";
import {
  DEFAULT_RBAC_MATRIX,
  MODULE_LABELS,
  can,
  matrixFromRows,
  type AdminModule,
  type Permission,
  type RbacMatrix,
} from "./rbac";

/**
 * The admin gate. SERVER-ONLY.
 *
 * ## Where it is enforced
 *
 * Three places, on purpose: the panel's layout, every page body, and the top
 * of every admin Server Action. A layout is not a security boundary — a
 * Server Action is a POST endpoint that can be called without the page that
 * renders its form — so an action that trusts "the layout already checked"
 * is an open door.
 *
 * ## Mock mode
 *
 * With no backend configured everyone is the super admin, the same rule as
 * `getEntitlements()` unlocking every agent: an unconfigured environment is a
 * working one, and there is no real data behind it to protect.
 */

export interface AdminIdentity {
  email: string;
  role: AdminRole;
}

/** The signed-in account's admin role, or null. Once per render. */
export const getAdminRole = cache(async function getAdminRole(email: string): Promise<AdminRole | null> {
  if (demoUnlocksAllowed()) return "super_admin";
  // A production build with no backend has nobody to ask: nobody is an admin.
  if (!isBackendConfigured()) return null;

  // Every admin's role is on their row — nobody is an admin in code any more
  // (`roles.ts`); a starting admin with no row yet gets their starting role.
  try {
    // The admin-users table is keyed by email, so this is the account's OWN
    // row — the same kind of read entitlements makes for the user record.
    const row = await getAdminRepo().getRow(ADMIN_TABLES.adminUsers, email.trim().toLowerCase());
    return roleFor(email, row);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    // A refusal is the ordinary answer for a customer — this runs on every
    // page, for the account menu — so only a real fault is logged.
    if (!(error instanceof ApiError && (error.status === 401 || error.status === 403))) {
      console.error(`[admin] role lookup failed for ${email}:`, error);
    }
    // Customers stop here: not an admin. Failing closed is the only safe
    // direction. A starting admin is asked once more through the admin scan,
    // which the backend allows them: a revoked row must be FOUND, or a backend
    // hiccup would hand their starting access back.
    if (!isStartingAdmin(email)) return null;
    try {
      const read = await getAdminRepo().scan(ADMIN_TABLES.adminUsers);
      if (!read.ok) return null;
      const own = read.rows.find((row) => normEmail(row.email) === normEmail(email)) ?? null;
      return roleFor(email, own);
    } catch (scanError) {
      if (isRedirectError(scanError)) throw scanError;
      return null;
    }
  }
});

/**
 * The permission matrix in force, once per render.
 *
 * Read from its row in the admin-users table through the admin scan — the one
 * read every admin is allowed — and cleaned by `normalizeMatrix` on the way
 * in. Nothing saved, or a failed read, means the built-in defaults, which are
 * deliberately no wider than the access admins had before roles (`rbac.ts`).
 *
 * Read FRESH on every request — not through `scanTable`, whose screen cache
 * holds a table for 30s — so a permission taken away stops working on the
 * next click, on every instance. The ZippyGo design accepted a 15s
 * per-instance lag; a security check should not need to. The table is a
 * handful of rows.
 */
export const getRbacMatrix = cache(async function getRbacMatrix(): Promise<RbacMatrix> {
  if (!isBackendConfigured()) return DEFAULT_RBAC_MATRIX;
  try {
    const read = await getAdminRepo().scan(ADMIN_TABLES.adminUsers);
    if (!read.ok) {
      console.error("[admin] permission matrix unreadable, using defaults:", read.error);
      return DEFAULT_RBAC_MATRIX;
    }
    return matrixFromRows(read.rows) ?? DEFAULT_RBAC_MATRIX;
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[admin] permission matrix unreadable, using defaults:", error);
    return DEFAULT_RBAC_MATRIX;
  }
});

/** Whether the signed-in admin may do this. For hiding buttons — not a gate. */
export async function adminCan(
  identity: AdminIdentity,
  module: AdminModule,
  permission: Permission,
): Promise<boolean> {
  return can(await getRbacMatrix(), identity.role, module, permission);
}

/** The page to send anyone who is signed in but not an admin. */
export const ADMIN_DENIED_PATH = "/admin/denied";

export async function requireAdmin(): Promise<AdminIdentity> {
  const session = await getSession();
  if (!session) redirect("/login");
  const role = await getAdminRole(session.businessId);
  if (role === null) redirect(ADMIN_DENIED_PATH);
  return { email: session.businessId, role };
}

export async function requireSuperAdmin(): Promise<AdminIdentity> {
  const identity = await requireAdmin();
  // An admin is not denied the panel, only this page — said so, rather than
  // "you don't have admin access" to someone who does (seen live, 2026-09-29).
  if (identity.role !== "super_admin") redirect(`${ADMIN_DENIED_PATH}?need=super`);
  return identity;
}

/**
 * THE check: at the top of every admin page body (`read`) and every admin
 * Server Action (`write`). Hiding a menu item or a button is only tidiness;
 * this is what stops a POST.
 */
export async function requirePermission(
  module: AdminModule,
  permission: Permission,
): Promise<AdminIdentity> {
  const identity = await requireAdmin();
  if (!(await adminCan(identity, module, permission))) {
    console.warn(`[admin] ${identity.email} (${identity.role}) refused ${permission} on ${module}`);
    redirect(`${ADMIN_DENIED_PATH}?need=${module}${permission === "write" ? "&write=1" : ""}`);
  }
  return identity;
}

/** The label for a `?need=` module, or null for anything that is not one. */
export function neededModuleLabel(value: string | undefined): string | null {
  return value && value in MODULE_LABELS ? MODULE_LABELS[value as AdminModule] : null;
}
