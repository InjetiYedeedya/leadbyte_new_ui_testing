"use client";

/**
 * The admin panel's left rail — the legacy panel's four groups of sections.
 *
 * ## Why this earns `"use client"`
 *
 * Two things a Server Component cannot hold: the collapsed/expanded state,
 * remembered between visits, and which item is active — which comes from
 * `usePathname()`, because the rail lives in the layout and a layout is not
 * re-rendered when its child route changes.
 *
 * ## Collapsed, and on a phone
 *
 * Collapsed, the rail keeps its icons and moves the labels into the accessible
 * name and a tooltip. Below `md` there is no room for a rail at all, so the
 * sections become one horizontal strip under the header, the way the old panel
 * stacked; the collapse control is hidden there because there is nothing to
 * collapse.
 *
 * The remembered choice lives in `localStorage` and is read AFTER hydration,
 * so the server and the first client render agree (expanded) and the rail
 * then settles. Every access is wrapped: a private window or blocked storage
 * must not break the toggle, only its memory.
 */

import Image from "next/image";
import { useLinkStatus } from "next/link";
import Link from "@/components/ui/app-link";
import { Spinner } from "@/components/ui/spinner";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Tag,
  Ticket,
  Bell,
  ChartBar,
  ChartLineUp,
  ClockCounterClockwise,
  Envelope,
  Globe,
  Key,
  LockKeyOpen,
  Robot,
  ShoppingCart,
  SidebarSimple,
  UserGear,
  Users,
  WarningCircle,
  type Icon,
} from "@phosphor-icons/react";
import { isActiveNav, type AdminNavGroup } from "@/lib/admin/nav";

const ICONS: Readonly<Record<string, Icon>> = {
  "/admin": ChartBar,
  "/admin/analytics": Globe,
  "/admin/clients": Users,
  "/admin/agents": Robot,
  "/admin/grant-access": LockKeyOpen,
  "/admin/user-dashboard": ChartLineUp,
  "/admin/requests": Envelope,
  "/admin/activity": ClockCounterClockwise,
  "/admin/notifications": Bell,
  "/admin/errors": WarningCircle,
  "/admin/purchases": ShoppingCart,
  "/admin/roles": UserGear,
  "/admin/api-keys": Key,
  "/admin/pricing": Tag,
  "/admin/coupons": Ticket,
};

const STORAGE_KEY = "leadbyte_admin_sidebar_collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // The toggle still works for this visit; it just will not be remembered.
  }
}

export function AdminSidebar({ groups }: { groups: AdminNavGroup[] }) {
  const pathname = usePathname() ?? "/admin";
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  function toggle() {
    setCollapsed((was) => {
      writeCollapsed(!was);
      return !was;
    });
  }

  const item =
    "flex min-h-10 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none";

  return (
    <nav
      aria-label="Admin sections"
      className={`border-b border-border bg-surface md:sticky md:top-0 md:flex md:h-dvh md:shrink-0 md:flex-col md:border-b-0 md:border-r ${
        collapsed ? "md:w-16" : "md:w-60"
      }`}
    >
      {/* Our mark and where you are. On a phone this is the top row. */}
      <div
        className={`flex min-h-14 items-center gap-2 px-4 md:border-b md:border-border ${
          collapsed ? "md:justify-center md:px-2" : ""
        }`}
      >
        <Link
          href="/admin"
          className="flex min-h-11 items-center gap-2 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label="LeadByte admin — overview"
        >
          {collapsed ? (
            <span
              aria-hidden="true"
              className="hidden size-9 items-center justify-center rounded-md bg-accent-soft text-sm font-bold text-accent-ink md:flex"
            >
              L
            </span>
          ) : null}
          <Image
            src="/leadbyte-logo.png"
            alt=""
            width={512}
            height={133}
            className={`h-6 w-auto ${collapsed ? "md:hidden" : ""}`}
          />
          <span
            className={`rounded bg-accent-soft px-1.5 py-0.5 text-xs font-semibold text-accent-ink ${
              collapsed ? "md:hidden" : ""
            }`}
          >
            Admin
          </span>
        </Link>
      </div>

      {/* The sections. A scrolling strip on a phone, a column from `md`. */}
      <div className="overflow-x-auto overflow-y-hidden md:flex-1 md:overflow-y-auto md:overflow-x-hidden">
        <div className="flex w-max gap-1 px-3 pb-2 md:w-auto md:flex-col md:gap-4 md:px-2 md:py-4">
          {groups.map((group) => (
            <div key={group.id} className="flex gap-1 md:flex-col md:gap-0.5">
              <p
                className={`hidden px-2.5 pb-1 text-xs font-medium text-ink-soft md:block ${
                  collapsed ? "md:sr-only" : ""
                }`}
              >
                {group.label}
              </p>
              {group.items.map((entry) => {
                const active = isActiveNav(entry.href, pathname);
                const IconFor = ICONS[entry.href] ?? ChartBar;
                return (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? entry.label : undefined}
                    className={`${item} shrink-0 whitespace-nowrap ${
                      collapsed ? "md:justify-center md:px-0" : ""
                    } ${
                      active
                        ? "bg-accent-soft font-semibold text-accent-ink"
                        : "text-ink-soft hover:bg-surface-raised hover:text-ink"
                    }`}
                  >
                    <SectionIcon Icon={IconFor} active={active} />
                    <span className={collapsed ? "md:sr-only" : ""}>{entry.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="hidden border-t border-border p-2 md:block">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand the menu" : "Collapse the menu"}
          title={collapsed ? "Expand menu" : "Collapse menu"}
          suppressHydrationWarning
          className={`${item} w-full text-ink-soft hover:bg-surface-raised hover:text-ink ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <SidebarSimple aria-hidden="true" className="size-5 shrink-0" />
          <span className={collapsed ? "sr-only" : ""}>Collapse menu</span>
        </button>
      </div>
    </nav>
  );
}

/**
 * A section's icon, which turns into a spinner while that section is loading.
 * Every admin section reads whole tables, and the admin pages have no page
 * loader of their own, so a click on the rail showed nothing for seconds
 * (audit, 2026-09-29). `useLinkStatus` must be read inside the `Link`.
 */
function SectionIcon({
  Icon,
  active,
}: {
  Icon: React.ComponentType<{ className?: string; weight?: "fill" | "regular"; "aria-hidden"?: boolean | "true" }>;
  active: boolean;
}) {
  const { pending } = useLinkStatus();
  return pending ? (
    <span className="flex size-5 shrink-0 items-center justify-center">
      <Spinner />
    </span>
  ) : (
    <Icon aria-hidden="true" className="size-5 shrink-0" weight={active ? "fill" : "regular"} />
  );
}
