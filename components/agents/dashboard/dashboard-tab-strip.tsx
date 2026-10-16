"use client";

import Link from "@/components/ui/app-link";
import { LockSimple } from "@phosphor-icons/react";
import { DASHBOARD_TABS, type DashboardTabId } from "@/lib/data/dashboard/tabs";

/**
 * The dashboard's tabs, across the top of the slide-in.
 *
 * ## Why this earns `"use client"`
 *
 * An unlocked tab switches the panel in place (`onSelect`): the panel reads
 * that tab on its own (`loadAgentDashboard`) and the rest of the page is not
 * touched. They were links to `?agent=<id>`, which Next treats as a new page
 * instance — the whole screen swapped to `PageLoading` to change one panel.
 * The URL still follows the open tab (the panel updates it), so a tab can be
 * reloaded and shared exactly as before.
 *
 * A LOCKED tab (agent not bought) stays in the strip, so the reader can see
 * what the dashboard would hold, and is still a real link to that agent's own
 * page, which says how to unlock it (implementation guide §6.3 / §7).
 *
 * `aria-pressed` rather than `role="tab"`: there is no tabpanel relationship
 * to maintain and the strip mixes buttons with a link.
 *
 * Grouped SEO / Marketing like the guide's rail. The tabs WRAP onto a second
 * line rather than scrolling sideways: scrollbars are hidden app-wide, so a
 * scrolling strip cut the last tab ("Ads Leads") off at the panel's edge on
 * most laptop widths with nothing saying more was there (measured on live,
 * 2026-10-07: 3-21px over from 1024 to 2560 wide). The groups are `contents`
 * so each tab wraps on its own, not a whole group at once.
 */
export function DashboardTabStrip({
  active,
  locked,
  onSelect,
}: {
  active: DashboardTabId;
  /** Tabs whose agent this account has not bought. */
  locked: ReadonlySet<DashboardTabId>;
  onSelect: (tab: DashboardTabId) => void;
}) {
  const groups = ["SEO", "Marketing"] as const;
  const base =
    "relative inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97] motion-reduce:transform-none";
  return (
    <nav aria-label="Dashboard tabs" className="-mx-1">
      <div className="flex flex-wrap items-center gap-1 px-1">
        {groups.map((group, index) => (
          <div key={group} className="contents">
            {index > 0 && <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />}
            <span className="px-1 text-xs text-ink-soft">{group}</span>
            {DASHBOARD_TABS.filter((tab) => tab.group === group).map((tab) => {
              if (locked.has(tab.id) && tab.agentId) {
                return (
                  <Link key={tab.id} href={`/agents/${tab.agentId}`} className={`${base} text-ink-soft hover:bg-surface`}>
                    {tab.label}
                    <LockSimple size={14} aria-hidden="true" />
                    <span className="sr-only">(not unlocked — opens the agent)</span>
                  </Link>
                );
              }
              const isActive = tab.id === active;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onSelect(tab.id)}
                  className={`${base} ${isActive ? "bg-accent text-surface" : "text-ink hover:bg-surface"}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
