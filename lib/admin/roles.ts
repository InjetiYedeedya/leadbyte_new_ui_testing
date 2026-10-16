import { normEmail, pickString, type Row } from "./fields";
import { DEFAULT_ROLE, isConfigRow, parseAssignableRole, type AdminRole } from "./rbac";

/**
 * Who may open the admin panel, as pure rules.
 *
 * The server-side gate (`access.ts`) reads the admin-users row and hands it
 * here; keeping the decision pure is what lets it be tested without a network.
 *
 * ## Every admin is managed from the panel — nobody is locked in code
 *
 * Until 2026-10-13 five emails were admins in code: an owner who could never
 * be demoted or removed, and four "built-in" managers whose Revoke did nothing
 * because deleting their row left the code's grant in place. The product
 * owner wants super admin to be an ordinary role that any super admin can
 * give to, or take from, anyone — the zippy-admin model, where the role lives
 * on the row and the only rule is that nobody acts on their own account.
 *
 * Those five are now only STARTING admins (`STARTING_ADMIN_ROLES`, zippy's
 * seed script in code form): admins while they have NO row in the table, so
 * nobody lost access the day this shipped. Once a row of their own exists it
 * decides, whatever it says — which is why revoking one of them writes a
 * `revoked` row rather than deleting it (deleting would hand the starting
 * access back).
 *
 * ## A pending invite is not an admin
 *
 * An invite row exists from the moment it is sent, with `status: "pending"`.
 * Only a claimed row (`"active"`) — or a legacy row with no status at all,
 * written before invites existed — grants access. The backend's own scan
 * check does NOT make this distinction (it accepts any row); see BACKEND.md.
 */

/**
 * Admins while they have no row of their own, and the role they start with.
 * Lower-case. A row — active, revoked, anything — always wins over this.
 */
export const STARTING_ADMIN_ROLES: Readonly<Record<string, AdminRole>> = {
  "thilak@ntimes.ai": "super_admin",
  "srini@ntimes.ai": "manager",
  "raja@ntimes.ai": "manager",
  "kiran@ntimes.ai": "manager",
  // The company's own account — the one whose site Website Analytics reports on.
  "apps@ntimes.ai": "manager",
};

/** The status a revoked starting admin's row carries; any non-active status denies. */
export const REVOKED_STATUS = "revoked";

export type { AdminRole } from "./rbac";

/** A starting admin (`STARTING_ADMIN_ROLES`), whatever their row now says. */
export function isStartingAdmin(email: string): boolean {
  return Object.hasOwn(STARTING_ADMIN_ROLES, normEmail(email));
}

/** Claimed, or a legacy row from before invites carried a status. */
export function isActiveAdminRow(row: Row | null): boolean {
  if (!row) return false;
  const status = pickString(row, "status").toLowerCase();
  return status === "" || status === "active";
}

/**
 * The role a row assigns, or the default for an admin whose row predates
 * roles (`manager` — exactly the access every admin had before, `rbac.ts`).
 */
function rowRole(row: Row | null): AdminRole {
  return (row && parseAssignableRole(row.role)) ?? DEFAULT_ROLE;
}

export function roleFor(email: string, row: Row | null): AdminRole | null {
  const normalized = normEmail(email);
  if (normalized === "") return null;
  // The row must be THIS email's row — a lookup that fell through to some
  // other record must never grant access, or set a role.
  const own = row && normEmail(row.email) === normalized ? row : null;
  if (own) return isActiveAdminRow(own) ? rowRole(own) : null;
  return STARTING_ADMIN_ROLES[normalized] ?? null;
}

export interface AdminAccount {
  email: string;
  role: AdminRole;
  invitedBy: string;
  /** When they became an admin: claimed, or created for a legacy row. */
  since: string;
}

export interface PendingInvite {
  email: string;
  /** The role they get on claiming. */
  role: AdminRole;
  invitedBy: string;
  invitedAt: string;
  /** The claim token. Server-side only until an admin asks for the link. */
  token: string;
}

export interface AdminRoster {
  active: AdminAccount[];
  pending: PendingInvite[];
}

/**
 * The admin-users table as the Roles screen shows it: active admins (super
 * admins first, then by email) and pending invites. A starting admin with no
 * row is listed too, so their role can be set and their access revoked.
 */
export function buildRoster(rows: readonly Row[]): AdminRoster {
  const active: AdminAccount[] = [];
  const pending: PendingInvite[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    // The saved permission matrix lives in this table too (`rbac.ts`).
    if (isConfigRow(row)) continue;
    const email = normEmail(row.email);
    if (email === "" || seen.has(email)) continue;
    seen.add(email);

    if (isActiveAdminRow(row)) {
      active.push({
        email,
        role: rowRole(row),
        invitedBy: pickString(row, "invited_by", "added_by"),
        since: pickString(row, "claimed_at", "created_at"),
      });
    } else if (pickString(row, "status").toLowerCase() === "pending") {
      pending.push({
        email,
        role: rowRole(row),
        invitedBy: pickString(row, "invited_by"),
        invitedAt: pickString(row, "invited_at", "created_at"),
        token: pickString(row, "token"),
      });
    }
  }

  for (const [email, role] of Object.entries(STARTING_ADMIN_ROLES)) {
    if (!seen.has(email)) active.push({ email, role, invitedBy: "", since: "" });
  }

  const rank = (account: AdminAccount) => (account.role === "super_admin" ? 0 : 1);
  active.sort((a, b) => rank(a) - rank(b) || a.email.localeCompare(b.email));
  pending.sort((a, b) => b.invitedAt.localeCompare(a.invitedAt));

  return { active, pending };
}
