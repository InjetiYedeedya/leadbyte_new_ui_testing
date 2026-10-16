import Image from "next/image";
import Link from "@/components/ui/app-link";
import { logout } from "@/app/logout/actions";
import { isBackendConfigured } from "@/lib/api/config";
import { brandChip } from "@/lib/data/profile-display";
import { AccountMenu } from "@/components/account-menu";
import { NavTabLink } from "@/components/nav-transition";
import { CONTAINER_CLASSES } from "@/components/ui/page-container";
import { NavMegaMenu, type MegaItem, type MegaTab } from "@/components/nav-mega-menu";
import { OVERVIEW_TABS } from "@/lib/nav";
import { visibleAgentDefinitions } from "@/lib/data/agent-repo";
import { agentLogoSrc } from "@/components/agents/agent-logo";

/**
 * Which primary navigation to draw. "okara": the Okara-style menus that open
 * a panel per section (`nav-mega-menu.tsx`), on trial since 2026-10-14.
 * "classic": the plain strip below, untouched. Flip this one word to compare
 * or to revert.
 */
const NAV_STYLE: "okara" | "classic" = "okara";

/** One short line per agent for its menu entry; the full sentence is on its own page. */
const AGENT_MENU_LINES: Record<string, string> = {
  "meta-ads": "Better audiences and ads.",
  "google-ads": "Smarter search campaigns.",
  "linkedin-ads": "Reach B2B decision-makers.",
  "openai-ads": "Prepare AI-powered ads.",
  "on-page-seo": "Fix SEO issues on your pages.",
  "off-page-seo": "Build backlinks and authority.",
  aeo: "Get cited in AI search.",
  "blog-posting": "Publish SEO-friendly posts.",
  "social-media": "Plan and post on social.",
  "lead-qualification": "Score and follow up leads.",
};
// By kind, as the Agents page ordered them: advertising, SEO, content, leads.
const AGENT_MENU_ORDER = Object.keys(AGENT_MENU_LINES);

const STRATEGY_ITEMS: MegaItem[] = [
  { href: "/growth/strategy", label: "Marketing strategy", description: "Your plan, and the chat behind it.", icon: "strategy" },
  { href: "/growth/advertising", label: "Advertising intelligence", description: "How each ad platform is doing.", icon: "ads" },
  { href: "/intelligence/connections", label: "Data sources", description: "Connect what the strategy reads.", icon: "integrations" },
];

const OVERVIEW_MENU_LINES: Record<string, Pick<MegaItem, "description" | "icon">> = {
  "/overview": { description: "Your business at a glance.", icon: "summary" },
  "/overview/business-profile": { description: "Brand, products and audience.", icon: "profile" },
  "/overview/website-audit": { description: "Issues found on your site.", icon: "audit" },
  "/overview/geo-analysis": { description: "How AI search reads your site.", icon: "geo" },
};

const CONNECTIONS = "/intelligence/connections";
// What the Connections page lists. Whether each one is connected, and as whom,
// is read when the panel opens (`nav-menu-status.ts`); `key` matches it.
const INTEGRATION_ITEMS: MegaItem[] = [
  { key: "googleAnalytics", href: CONNECTIONS, label: "Google Analytics", description: "Track traffic.", logo: "/logos/google-analytics.svg" },
  { key: "searchConsole", href: CONNECTIONS, label: "Search Console", description: "Track rankings.", logo: "/logos/google.svg" },
  { key: "googleAds", href: CONNECTIONS, label: "Google Ads", description: "Search ad results.", logo: "/logos/google-ads.svg" },
  { key: "metaAds", href: CONNECTIONS, label: "Meta Ads", description: "Social ad results.", logo: "/logos/meta.svg" },
  { key: "linkedInAds", href: CONNECTIONS, label: "LinkedIn Ads", description: "B2B campaign results.", logo: "/logos/linkedin.svg" },
  { key: "facebook", href: CONNECTIONS, label: "Facebook", description: "Page posts and likes.", logo: "/logos/facebook.svg" },
  { key: "instagram", href: CONNECTIONS, label: "Instagram", description: "Posts and reach.", logo: "/logos/instagram.svg" },
  { key: "youtube", href: CONNECTIONS, label: "YouTube", description: "Channel performance.", logo: "/logos/youtube.svg" },
  { key: "email", href: CONNECTIONS, label: "Email", description: "Send outreach emails.", logo: "/logos/gmail.svg" },
  { key: "github", href: CONNECTIONS, label: "GitHub", description: "Deliver website fixes.", logo: "/logos/github.svg" },
  { key: "wordpress", href: CONNECTIONS, label: "WordPress", description: "Auto-publish posts.", logo: "/logos/wordpress.png" },
];

function okaraTabs(): MegaTab[] {
  const agents = visibleAgentDefinitions()
    .slice()
    .sort((a, b) => {
      const ia = AGENT_MENU_ORDER.indexOf(a.id);
      const ib = AGENT_MENU_ORDER.indexOf(b.id);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  return [
    {
      href: "/overview",
      label: "Business overview",
      isPage: true,
      menu: {
        columns: 2,
        items: OVERVIEW_TABS.map((tab) => ({
          href: tab.href,
          label: tab.label,
          ...(OVERVIEW_MENU_LINES[tab.href] ?? { description: "", icon: "overview" as const }),
        })),
        feature: {
          title: "Everything we know about your business",
          body: "Your profile, website audit and AI visibility, in one place.",
          href: "/overview",
          cta: "Open summary",
        },
      },
    },
    {
      href: "/growth/strategy",
      label: "Strategy",
      isPage: true,
      menu: {
        columns: 2,
        live: "strategy",
        items: STRATEGY_ITEMS,
        feature: {
          title: "Your marketing strategy",
          body: "Built from your website, search and ad data — and it sharpens with every account you connect.",
          href: "/growth/strategy",
          cta: "Open Strategy",
        },
      },
    },
    {
      href: "/agents",
      label: "Agents",
      // How many the account has BOUGHT, read live — not how many exist.
      ownedAgentsBadge: true,
      menu: {
        columns: 2,
        live: "agents",
        items: agents.map((def) => ({
          key: def.id,
          href: `/agents?agent=${def.id}`,
          label: `${def.name} Agent`,
          description: AGENT_MENU_LINES[def.id] ?? def.description,
          logo: agentLogoSrc(def.id),
          icon: "agents" as const,
        })),
        feature: {
          title: "AI agent control center",
          body: "Run agents across advertising, SEO, content and lead outreach — each one already knows your business.",
          href: CONNECTIONS,
          cta: "Connections",
        },
      },
    },
    {
      href: CONNECTIONS,
      label: "Integrations",
      menu: {
        columns: 3,
        live: "integrations",
        items: INTEGRATION_ITEMS,
        feature: {
          title: "Connect once, every agent uses it",
          body: "Connected accounts give your agents real data to work from. See each one's status and connect, reconnect or manage it.",
          href: CONNECTIONS,
          cta: "Manage integrations",
        },
      },
    },
    // Last, as on the website. A click opens the Pricing page's own board in
    // a menu (plans, monthly / annual, checkout) — the same price sheet and
    // purchases that page reads. The page itself is unchanged.
    {
      href: "/pricing",
      label: "Pricing",
      menu: {
        columns: 3,
        live: "pricing",
        items: [],
        feature: { title: "Pricing", body: "", href: "/pricing", cta: "See all plans" },
      },
    },
  ];
}

const TABS = [
  { href: "/overview", label: "Business overview" },
  // "Performance", not "Analytics" and no longer "Dashboard": the screen carries
  // ad platforms as well, and one of its three tabs IS called Google
  // Analytics — a top-level tab of the same name pointed at a superset of
  // itself. The route stays `/analytics`.
  { href: "/analytics", label: "Performance" },
  // Lands on Strategy itself. It used to point at `/growth/advertising`, which
  // was the section's first sub-tab — so a tab labelled Strategy opened
  // Advertising. With Advertising out of the nav there is nowhere else for it
  // to go, and the label and the destination finally agree.
  { href: "/growth/strategy", label: "Strategy" },
  { href: "/agents", label: "Agents" },
] as const;

/**
 * Reports has no backend at all — no report generation exists anywhere
 * (confirmed with the backend team 2026-08-28) — so it stays hidden rather than
 * deleted: the screen works on mock data and lights up the moment a backend
 * appears. A nav entry leading to permanently empty data is worse than none.
 *
 * Notifications are the case that changed. Their tables
 * (`leadbyte_admin_notifications` / `leadbyte_user_activity_log`) are keyed by
 * notificationId / logId with no user index, so a user still cannot read their
 * own and the repo is mock-only. The bell is in the header anyway, because the
 * count it shows is honest about what it can see — it simply has nothing but
 * seeded rows to count until that route and GSI exist.
 */
const BACKEND_READY = {
  reports: false,
  /**
   * Hidden on a LIVE site until notifications have a backend (audit,
   * 2026-09-25): against a real account the Inbox is always empty and its
   * read-marks live in server memory, which Cloudflare resets. A bell that
   * never rings reads as broken. Local demo mode still shows it.
   */
  notifications: !isBackendConfigured(),
} as const;

/**
 * The customer's own brand, beside ours.
 *
 * ## The idea
 *
 * Two logos of equal weight compete, and the reader has to work out which one
 * the page is about. So the band is ordered by whose identity matters: our mark
 * is the quiet one — it says which tool you are in, and you already know — and
 * the customer's brand is the anchor, because it names whose numbers are on
 * screen. A hairline rule separates the two rather than a pipe character.
 *
 * ## Why the logo box is wide, not square
 *
 * An extracted logo is usually a wordmark, not an icon. Forcing it into a 24px
 * square shrinks "ZippyGo" until it is a grey smudge, so the box is a 20px-tall
 * strip up to 80px wide and the image sits inside it on its own terms. A
 * monogram fills in when the analysis has not found a logo yet — `brand` is
 * absent in mock mode and until the crawl lands.
 *
 * ## Why it is a link
 *
 * The pill looked pressable and did nothing. It now opens the site it names,
 * which is the only thing it could honestly do — so the hover state, the focus
 * ring and the 44px target are all telling the truth. Where the profile has a
 * name but no URL it renders as plain text instead, with no affordance to
 * mislead.
 *
 * The logo is a plain `<img>`, not `next/image`: the URL comes from someone
 * else's site, and `next/image` refuses any host missing from
 * `images.remotePatterns`, which cannot be enumerated for arbitrary customer
 * domains. At this size there is nothing for an optimiser to save.
 */
function BrandChip({
  chip,
}: {
  chip: NonNullable<ReturnType<typeof brandChip>>;
}) {
  const mark =
    chip.logo === "" ? (
      <span
        aria-hidden="true"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/10 text-xs font-semibold text-accent"
      >
        {chip.monogram}
      </span>
    ) : (
      /* eslint-disable-next-line @next/next/no-img-element -- see above */
      <img
        src={chip.logo}
        alt=""
        className="h-5 w-auto max-w-20 shrink-0 object-contain object-left"
      />
    );

  const label = (
    <span className="truncate text-sm font-medium text-ink">{chip.name}</span>
  );

  // 150ms on colour only. Nothing moves: a header that shifts under the cursor
  // is noise, and the transition is there to confirm the target, not to perform.
  const pill =
    "flex min-h-11 min-w-0 items-center gap-2 rounded-md border border-border bg-ground px-2.5 transition-colors duration-150 motion-reduce:transition-none";

  return (
    <>
      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />
      {chip.href === "" ? (
        <span className={pill}>
          {mark}
          {label}
        </span>
      ) : (
        <a
          href={chip.href}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`${chip.name} — open the website in a new tab`}
          className={`${pill} hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
        >
          {mark}
          {label}
        </a>
      )}
    </>
  );
}

/**
 * Two rows, deliberately:
 *
 *   Row 1 — the brand, and the account-level links (Inbox / Reports /
 *           Settings / Sign out).
 *   Row 2 — the four primary sections.
 *
 * Keeping the wordmark on its own line stops "LeadByte" reading as if it were
 * the first nav item, and gives the section tabs the full width so the active
 * one is easy to pick out.
 */
export function TabBar({
  activeHref,
  unreadCount = 0,
  chip = null,
  initials,
  email,
  agentCount = 0,
  adminHref,
}: {
  activeHref: string;
  unreadCount?: number;
  /** The customer's brand, from `brandChip()`. Null renders nothing. */
  chip?: ReturnType<typeof brandChip> | null;
  /** From `accountInitials()`. Drawn in the avatar. */
  initials: string;
  /** The signed-in address, named in the menu and its accessible label. */
  email: string;
  /**
   * How many agents the product offers — the same number the Agents page
   * lists. It counted agents "waiting on you" until 2026-09-25; the product
   * owner asked for the total instead.
   */
  agentCount?: number;
  /** The admin panel, for admins only. See `AccountMenu`. */
  adminHref?: string;
}) {
  const accountLink = (href: string) =>
    activeHref === href
      ? "font-medium text-ink"
      : "text-ink-soft transition-colors hover:text-ink";

  return (
    /* The header travels with the sub-tabs, and the STICKINESS is applied one level up
       in `page-shell.tsx` — on a wrapper that also holds the section's
       sub-tabs, so all three rows stay on screen as one band.

       It used to be on this element, which left the sub-tab strip outside the
       sticky block and scrolling away. Do not put it back here: fixing the
       strip separately needs a `top-[69px]` matched by hand to this header's
       height, which is exactly the number that breaks silently the first time
       the padding, the logo size or the font changes.

       `data-app-header` moved up with it. The scroll stacks measure that
       element to place a pinned card, and the answer has to include every row
       that stays on screen. */
    <div>
      {/* Row 1 — brand + account */}
      <header className="border-b border-border bg-surface">
        {/* The band's border stays full-bleed; only its CONTENTS are capped, so
            the wordmark and avatar line up with the page body's edges on a wide
            monitor instead of sitting in the window's corners. */}
        {/* One row on a wide screen: our mark, the sections centred, then
            who-and-where. A 1fr/auto/1fr grid rather than `justify-between`,
            so the tabs sit on the page's true centre whatever the two sides
            weigh. Below `lg` there is no room for all three in one line, so
            the tabs take a second row of their own, full width. */}
        <div
          className={`${CONTAINER_CLASSES} grid grid-cols-[1fr_auto] items-center gap-x-4 py-2 lg:grid-cols-[1fr_auto_1fr]`}
        >
        {/* Our wordmark alone. The customer's chip sits on the RIGHT, between
            the bell and the avatar — grouped with the other things that say
            "who and where you are" rather than paired with our own mark.
            `priority` because it is the topmost element of every
            authenticated page. */}
        <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-3">
          <Link
            href="/overview"
            className="flex min-h-11 shrink-0 items-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Image
              src="/leadbyte-logo.png"
              alt="LeadByte"
              width={512}
              height={133}
              priority
              className="h-10 w-auto"
            />
          </Link>
        </div>

        <div className="col-start-2 row-start-1 flex shrink-0 items-center justify-end gap-1 lg:col-start-3">
          {/* Reports has no backend at all, so it stays hidden. Notifications
              read from a mock repo — the bell is honest about the count it
              shows, it just has nothing but seeded rows to count yet. */}
          {BACKEND_READY.reports && (
            <Link
              href="/reports"
              className={`px-2 text-sm ${accountLink("/reports")}`}
            >
              Reports
            </Link>
          )}

          {BACKEND_READY.notifications && (
          <Link
            href="/notifications"
            aria-label={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
            className="relative flex min-h-11 min-w-11 items-center justify-center rounded-full text-ink-soft transition-colors duration-150 hover:bg-surface-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            {/* Stroke-only bell at 1.5px, matching the rest of the app's
                iconography. Inline rather than an icon package: it is the only
                icon in the header. */}
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>

            {unreadCount > 0 && (
              /* The count is the label's job for a screen reader, so this is
                 decorative — and it sits on the ring rather than beside it, so
                 a two-digit count cannot widen the header. */
              <span
                aria-hidden="true"
                className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] font-medium text-surface"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
          )}

          {/* Between the bell and the avatar. `ml-1`/`mr-1` so it is not
              crowded by two round controls, and it keeps `shrink-0` from the
              chip itself so a long workspace name truncates rather than
              pushing the avatar off the edge. */}
          {/* Hidden below `sm`. At 390px the header carried our wordmark, the
              bell, this chip and the avatar, and the chip is the only one of
              the four that is not a control — it says whose numbers these are,
              which the page itself already makes obvious. Dropping it is what
              lets the other three keep their tap targets instead of being
              squeezed. */}
          {chip && (
            <span className="mx-1 hidden min-w-0 max-w-48 items-center gap-2 sm:flex">
              <BrandChip chip={chip} />
            </span>
          )}

          <AccountMenu initials={initials} email={email} adminHref={adminHref} />
          </div>

        {/* The primary sections, in the same row as the logo from `lg` up.

            `overflow-y-hidden` is not decorative: setting `overflow-x` to
            auto forces the computed `overflow-y` from `visible` to `auto` too,
            so the tabs' 1px negative margin was enough to trigger a vertical
            scrollbar with arrow buttons on Windows. Pinning the Y axis kills
            it. `min-w-0` lets the scroller shrink inside its grid cell rather
            than widening the page. */}
        {/* On a phone the four tabs are wider than the screen and Agents sat
            past the edge with nothing saying the strip scrolls (2026-10-13):
            the right edge fades, and the row's end padding lets the last tab
            scroll clear of the fade. */}
        {/* `lg:overflow-visible` for the Okara menus: from `lg` the tabs fit
            without scrolling, and a scroller would clip their panels. */}
        <nav
          className={`col-span-2 row-start-2 min-w-0 overflow-x-auto overflow-y-hidden whitespace-nowrap max-sm:[mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] lg:col-span-1 lg:col-start-2 lg:row-start-1 ${
            NAV_STYLE === "okara" ? "lg:overflow-visible" : ""
          }`}
        >
        {NAV_STYLE === "okara" ? (
          // No dropdowns on any tab (2026-10-15, on request): each tab is a
          // plain link to its page again, lit when you are on it. The menus'
          // contents stay defined in `okaraTabs` so they can come back.
          <NavMegaMenu
            tabs={okaraTabs().map(({ menu: _menu, ...tab }) => ({ ...tab, isPage: true }))}
            activeHref={activeHref}
            account={email}
          />
        ) : (
        <>
        {/* `w-max` + `mx-auto` rather than `justify-center` on the scroller.
            Centred content that overflows its own scroll container is clipped
            unreachably at the START in every engine — the first tabs simply
            cannot be scrolled to. Sized to its content and centred by margin,
            it centres when there is room and scrolls properly when there is
            not. */}
        {/* `gap-1` and a padded row, because the active tab is a PILL rather
            than an underline. Two underlined strips stacked on each other read
            as two navbars competing for the same job; a filled pill above an
            underlined sub-tab says which level is which at a glance. The
            pill's own padding supplies the separation `gap-8` used to. */}
        <div className="mx-auto flex w-max items-center gap-0.5 pb-1 max-sm:pr-10 sm:gap-1 lg:pb-0">
          {TABS.map((tab) => {
            const active = activeHref === tab.href;
            return (
              <NavTabLink
                key={tab.href}
                href={tab.href}
                /**
                 * FULL prefetch, not the default.
                 *
                 * Every route here is dynamic (each reads cookies) and rule 0
                 * bans `loading.tsx`, so the default prefetch has no static
                 * shell and no loading boundary to fetch — it resolves to
                 * nothing at all. The consequence was measured on 2026-09-11:
                 * a tab click left the PREVIOUS screen on display, entirely
                 * unchanged, for 2.7s, because the first thing that can render
                 * is the first byte of the route's flight stream and nothing
                 * had been fetched ahead of it.
                 *
                 * `true` fetches the whole payload in the background while the
                 * current page is being read, so the click has it already.
                 * These four are the app's primary navigation and the most
                 * clicked links in it, which is what justifies the background
                 * render each one costs; the 30s router cache (`staleTimes`)
                 * stops it repeating.
                 *
                 * NOTE it changes nothing in development — Next disables
                 * prefetching outright there (`app-router.js`: "Don't prefetch
                 * during development"), so the gap above is still visible on
                 * localhost and is not evidence this failed.
                 *
                 * ON INTENT, not on sight (2026-09-24). The strip is sticky, so
                 * all four were always "in view", and every page view rendered
                 * all four other screens on the server in the background: about
                 * thirty backend calls competing with the page being read, the
                 * slow ones tipping into the 8s timeout. A hover or focus leads
                 * the click by a few hundred ms, which starts the render early;
                 * the click-loader in `nav-transition.tsx` covers the rest. The
                 * tab you are on is never prefetched.
                 */
                prefetch={active ? false : "intent"}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    // Narrower pills below `sm`: at 390px the four labels plus
                    // a desktop-sized inset overflow the strip, and a visible
                    // scrollbar under the primary navigation reads as a
                    // broken bar rather than a scrollable one.
                    ? "relative shrink-0 rounded-md bg-accent-soft px-2 py-2 text-sm font-semibold text-accent-ink sm:px-3.5"
                    : "relative shrink-0 rounded-md px-2 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface-raised hover:text-ink sm:px-3.5"
                }
              >
                {tab.label}
                {tab.href === "/agents" && agentCount > 0 && (
                  <>
                    {/* A quiet inline pill, the way the reference sets it: it
                      belongs to the label rather than alerting over it. */}
                    <span
                      aria-hidden="true"
                      className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-ink"
                    >
                      {agentCount}
                    </span>
                    {/* The number alone is not a fact — it needs saying what it
                      counts, and the badge is decorative to a screen reader. */}
                    <span className="sr-only">
                      {` — ${agentCount} agents`}
                    </span>
                  </>
                )}
              </NavTabLink>
            );
          })}
        </div>
        </>
        )}
        </nav>
        </div>
      </header>
    </div>
  );
}
