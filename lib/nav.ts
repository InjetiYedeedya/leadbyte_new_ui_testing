/**
 * Sub-tab groups.
 *
 * The three analysis screens moved from their own "Intelligence" section into
 * Overview on 2026-09-02: they all read the same single website-analyze job, so
 * splitting them from the summary that reports on them was an arbitrary
 * division. `Summary` is the dashboard itself, first in its own group.
 *
 * Connections was dropped from the nav at the same time. The route still works
 * and is still linked from Analytics and the Advertising empty state — it is
 * hidden, not deleted, the same treatment Inbox and Reports get in
 * `components/tab-bar.tsx`.
 */
export const OVERVIEW_TABS = [
  { href: "/overview", label: "Summary" },
  { href: "/overview/business-profile", label: "Business profile" },
  { href: "/overview/website-audit", label: "Website audit" },
  { href: "/overview/geo-analysis", label: "GEO analysis" },
] as const;

/**
 * The order the "Next" button walks: the Overview tabs, then the top-level
 * sections in the order the tab bar shows them. Agents is the end, so it has
 * no Next. GEO analysis does not use the plain button: its Next opens the
 * connect-Google-or-strategy choice (`ConnectGoogle`) instead.
 */
export const NEXT_STEP_ORDER: readonly { href: string; label: string }[] = [
  ...OVERVIEW_TABS,
  { href: "/analytics", label: "Performance" },
  { href: "/growth/strategy", label: "Strategy" },
  { href: "/agents", label: "Agents" },
];

/**
 * There is no `GROWTH_TABS` any more.
 *
 * The section held Advertising and Strategy, and Advertising was dropped from
 * the nav on 2026-09-09. That left one destination, and a sub-tab strip with a
 * single tab in it is a control that cannot do anything — so the strip went
 * with it and `/growth/strategy` is now the whole of the section.
 *
 * `/growth/advertising` itself is NOT deleted. The route works, and it is still
 * linked from two places on Overview and used as the landing page after ad
 * OAuth. Hidden is not deleted — the same treatment Inbox, Reports and
 * `/intelligence/connections` get.
 */
