/**
 * The admin panel's sections, in the legacy panel's four groups and order.
 *
 * Each old tab is now a route, so a section can be linked, bookmarked and
 * reloaded — the old panel kept the open tab in component state, and a reload
 * always landed back on Overview.
 *
 * Each item names the permission MODULE behind it (`rbac.ts`), and the rail
 * shows only the items the admin's role may read. That is tidiness, not
 * security: every page body checks `requirePermission` itself.
 */

import { can, type AdminModule, type AdminRole, type RbacMatrix } from "./rbac";

export interface AdminNavItem {
  href: string;
  label: string;
  module: AdminModule;
}

export interface AdminNavGroup {
  id: string;
  label: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: readonly AdminNavGroup[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    items: [
      { href: "/admin", label: "Overview", module: "overview" },
      { href: "/admin/analytics", label: "Website analytics", module: "analytics" },
    ],
  },
  {
    id: "management",
    label: "Management",
    items: [
      { href: "/admin/clients", label: "Clients", module: "clients" },
      { href: "/admin/agents", label: "Agents", module: "agents" },
      { href: "/admin/grant-access", label: "Grant agent access", module: "grant_access" },
      { href: "/admin/user-dashboard", label: "User dashboard", module: "user_dashboard" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { href: "/admin/requests", label: "Requests", module: "requests" },
      { href: "/admin/activity", label: "Activity log", module: "activity" },
      { href: "/admin/notifications", label: "Notifications", module: "notifications" },
      { href: "/admin/errors", label: "Errors", module: "errors" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    items: [
      { href: "/admin/purchases", label: "Purchases", module: "purchases" },
      // What customers pay. No role but super admin reads these by default:
      // a price or a coupon here is charged on the next checkout.
      { href: "/admin/pricing", label: "Agent pricing", module: "pricing" },
      { href: "/admin/coupons", label: "Coupons", module: "coupons" },
      { href: "/admin/roles", label: "Roles & responsibilities", module: "rbac" },
      { href: "/admin/api-keys", label: "API keys", module: "api_keys" },
    ],
  },
];

/** The groups a given admin may see. A group left with no items is dropped. */
export function navFor(role: AdminRole, matrix: RbacMatrix): AdminNavGroup[] {
  return ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => can(matrix, role, item.module, "read")),
  })).filter((group) => group.items.length > 0);
}

/** The first page this role may open, or null when it may open none. */
export function firstAllowedHref(role: AdminRole, matrix: RbacMatrix): string | null {
  return navFor(role, matrix)[0]?.items[0]?.href ?? null;
}

/**
 * Which item a path belongs to. `/admin` itself only matches exactly —
 * otherwise Overview would light up on every admin page.
 */
export function isActiveNav(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
