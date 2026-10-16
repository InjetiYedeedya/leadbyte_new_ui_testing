import type { Row } from "./fields";

/**
 * Admin roles and permissions, as pure rules.
 *
 * Every admin has ONE role. The panel is split into MODULES, one per section
 * of the rail. For each role × module the matrix holds `[]` (no access),
 * `["read"]` or `["read", "write"]`. The matrix is saved as one row in the
 * admin-users table so the super admin can change it from the Roles screen;
 * `DEFAULT_RBAC_MATRIX` is used when nothing is saved or the row cannot be
 * read (the ZippyGo roles-and-permissions guide, adapted — that guide's own
 * login, sessions and JWTs are not ours: sign-in here is Firebase and
 * leadbyte-api, and `access.ts` reads the role fresh on every request).
 *
 * ## The defaults are TODAY'S access, and no wider
 *
 * Before roles, every admin was the same: the whole panel except pricing,
 * coupons, API keys and managing admins, which were super-admin only. Every
 * existing admin starts as `manager`, so `manager` reproduces exactly that.
 * A failed read of the saved matrix falls back to these defaults, so they must
 * never grant more than an admin had before — a backend outage must not WIDEN
 * access (the guide's own warning).
 *
 * ## Super admin cannot be locked out
 *
 * `normalizeMatrix` forces `super_admin` to full access on every module, so
 * no saved matrix — however it was edited — can take the panel away from the
 * accounts that can put it right. Super admin is a role like the others: any
 * super admin can give it to, or take it from, anyone but themselves
 * (`roles.ts`). No account holds it permanently.
 */

export type AdminRole = "super_admin" | "manager" | "team_lead" | "developer";

export const ALL_ROLES: readonly AdminRole[] = ["super_admin", "manager", "team_lead", "developer"];

/** The roles an admin can be given, super admin included. */
export const ASSIGNABLE_ROLES: readonly AdminRole[] = ALL_ROLES;

/**
 * The roles the permission matrix is edited for. Super admin is not one of
 * them: it always has everything (`normalizeMatrix`), so a column of choices
 * for it would be a column of choices that are ignored.
 */
export const MATRIX_ROLES: readonly Exclude<AdminRole, "super_admin">[] = [
  "manager",
  "team_lead",
  "developer",
];

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super admin",
  manager: "Manager",
  team_lead: "Team lead",
  developer: "Developer",
};

/** What every admin who predates roles is. See the note above. */
export const DEFAULT_ROLE: Exclude<AdminRole, "super_admin"> = "manager";

export type AdminModule =
  | "overview"
  | "analytics"
  | "clients"
  | "agents"
  | "grant_access"
  | "user_dashboard"
  | "requests"
  | "activity"
  | "notifications"
  | "errors"
  | "purchases"
  | "pricing"
  | "coupons"
  | "rbac"
  | "api_keys";

/** In rail order, which is also the order the matrix editor lists them. */
export const ALL_MODULES: readonly AdminModule[] = [
  "overview",
  "analytics",
  "clients",
  "agents",
  "grant_access",
  "user_dashboard",
  "requests",
  "activity",
  "notifications",
  "errors",
  "purchases",
  "pricing",
  "coupons",
  "rbac",
  "api_keys",
];

export const MODULE_LABELS: Record<AdminModule, string> = {
  overview: "Overview",
  analytics: "Website analytics",
  clients: "Clients",
  agents: "Agents",
  grant_access: "Grant agent access",
  user_dashboard: "User dashboard",
  requests: "Requests",
  activity: "Activity log",
  notifications: "Notifications",
  errors: "Errors",
  purchases: "Purchases",
  pricing: "Agent pricing",
  coupons: "Coupons",
  rbac: "Roles & responsibilities",
  api_keys: "API keys",
};

/**
 * Modules with nothing to change: no Server Action writes through them, so
 * "Read + write" would be a permission that does nothing. The editor offers
 * no such option and `normalizeMatrix` strips one that arrives anyway.
 */
export const READ_ONLY_MODULES: ReadonlySet<AdminModule> = new Set<AdminModule>([
  "overview",
  "analytics",
  "clients",
  "agents",
  "user_dashboard",
  "activity",
  "purchases",
]);

export type Permission = "read" | "write";
export type RbacMatrix = Record<AdminRole, Record<AdminModule, Permission[]>>;

const R: Permission[] = ["read"];
const RW: Permission[] = ["read", "write"];
const NONE: Permission[] = [];

/**
 * The fallback, and the starting point before anyone saves an edit. Typed as
 * a full Record so adding a module without filling it in for every role does
 * not compile.
 */
export const DEFAULT_RBAC_MATRIX: RbacMatrix = {
  super_admin: {
    overview: R, analytics: R, clients: R, agents: R, grant_access: RW, user_dashboard: R,
    requests: RW, activity: R, notifications: RW, errors: RW, purchases: R,
    pricing: RW, coupons: RW, rbac: RW, api_keys: RW,
  },
  // Exactly what every admin could do before roles existed.
  manager: {
    overview: R, analytics: R, clients: R, agents: R, grant_access: RW, user_dashboard: R,
    requests: RW, activity: R, notifications: RW, errors: RW, purchases: R,
    pricing: NONE, coupons: NONE, rbac: R, api_keys: NONE,
  },
  // Day-to-day support: sees the customers and works the queues, but does not
  // hand out paid agents or see what anyone paid.
  team_lead: {
    overview: R, analytics: R, clients: R, agents: R, grant_access: R, user_dashboard: R,
    requests: RW, activity: R, notifications: RW, errors: RW, purchases: NONE,
    pricing: NONE, coupons: NONE, rbac: NONE, api_keys: NONE,
  },
  // Diagnosing faults: errors and activity, and enough of the customer side
  // to reproduce one. API keys stay with the super admin until granted here.
  developer: {
    overview: R, analytics: R, clients: R, agents: R, grant_access: NONE, user_dashboard: R,
    requests: R, activity: R, notifications: R, errors: RW, purchases: NONE,
    pricing: NONE, coupons: NONE, rbac: NONE, api_keys: NONE,
  },
};

function isPermission(value: unknown): value is Permission {
  return value === "read" || value === "write";
}

/**
 * Every matrix — loaded from the table or posted by the editor — goes through
 * this before it is used or saved:
 *
 * 1. every role × module pair is present (a missing one takes its default);
 * 2. anything that is not "read" or "write" is dropped;
 * 3. write includes read (`["write"]` becomes `["read", "write"]`);
 * 4. a read-only module never carries write;
 * 5. `super_admin` has full access on every module, whatever was sent.
 */
export function normalizeMatrix(input: unknown): RbacMatrix {
  const source = input !== null && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out = {} as RbacMatrix;
  for (const role of ALL_ROLES) {
    const rowValue = source[role];
    const row = rowValue !== null && typeof rowValue === "object" ? (rowValue as Record<string, unknown>) : {};
    const cleaned = {} as Record<AdminModule, Permission[]>;
    for (const mod of ALL_MODULES) {
      const given = row[mod];
      let perms: Permission[] = Array.isArray(given)
        ? [...new Set(given.filter(isPermission))]
        : [...DEFAULT_RBAC_MATRIX[role][mod]];
      if (perms.includes("write")) perms = ["read", "write"];
      if (READ_ONLY_MODULES.has(mod)) perms = perms.includes("read") ? ["read"] : [];
      cleaned[mod] = perms;
    }
    out[role] = cleaned;
  }
  const full = {} as Record<AdminModule, Permission[]>;
  for (const mod of ALL_MODULES) full[mod] = READ_ONLY_MODULES.has(mod) ? ["read"] : ["read", "write"];
  out.super_admin = full;
  return out;
}

export function can(matrix: RbacMatrix, role: AdminRole, module: AdminModule, permission: Permission): boolean {
  if (role === "super_admin") return true;
  return matrix[role]?.[module]?.includes(permission) ?? false;
}

/** A role from a form or a row, or null for anything that is not one. */
export function parseAssignableRole(value: unknown): AdminRole | null {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (ASSIGNABLE_ROLES as readonly string[]).includes(text) ? (text as AdminRole) : null;
}

// ── The saved matrix, as a row of the admin-users table ──────────────────

/**
 * The key of the one row that holds the matrix. Not an email — it has no "@" —
 * so nobody can sign in as it, `buildRoster` skips it, and `inviteRefusal`
 * would refuse it as an invite.
 */
export const RBAC_CONFIG_KEY = "config#rbac-matrix";

/** True for the matrix row (or any future config row), which is not an admin. */
export function isConfigRow(row: Row): boolean {
  return typeof row.email === "string" && !row.email.includes("@");
}

/**
 * The row to save. The matrix travels as JSON text: the generic data API's
 * handling of nested maps is unconfirmed, and a string round-trips exactly.
 * `status: "config"` keeps it from ever reading as an active admin row.
 */
export function matrixRow(matrix: RbacMatrix, updatedBy: string, now: Date = new Date()): Row {
  return {
    email: RBAC_CONFIG_KEY,
    status: "config",
    matrix: JSON.stringify(normalizeMatrix(matrix)),
    updated_by: updatedBy,
    updated_at: now.toISOString(),
  };
}

/** The saved matrix from the table's rows, or null when none is saved. */
export function matrixFromRows(rows: readonly Row[]): RbacMatrix | null {
  const row = rows.find((r) => r.email === RBAC_CONFIG_KEY);
  if (!row) return null;
  const raw = row.matrix;
  try {
    return normalizeMatrix(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    return null;
  }
}

/**
 * The matrix posted by the editor: one `perm:<role>:<module>` field per cell,
 * valued `none` | `read` | `write`. Cells for `super_admin` are ignored.
 */
export function matrixFromForm(form: { get(name: string): unknown }): RbacMatrix {
  const draft: Record<string, Record<string, Permission[]>> = {};
  for (const role of MATRIX_ROLES) {
    draft[role] = {};
    for (const mod of ALL_MODULES) {
      const value = form.get(`perm:${role}:${mod}`);
      draft[role]![mod] = value === "write" ? ["read", "write"] : value === "read" ? ["read"] : [];
    }
  }
  return normalizeMatrix(draft);
}

/** The editor's value for one cell. */
export function cellValue(perms: readonly Permission[]): "none" | "read" | "write" {
  return perms.includes("write") ? "write" : perms.includes("read") ? "read" : "none";
}
