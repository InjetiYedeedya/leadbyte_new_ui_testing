import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getNotificationsRepo } from "@/lib/data/notifications-repo";
import { getAgentRepo } from "@/lib/data/agent-repo";
import { getBusinessProfileRepo } from "@/lib/data/business-profile-repo";
import { accountInitials, brandChip } from "@/lib/data/profile-display";
import { TabBar } from "@/components/tab-bar";
import { SubTabBar } from "@/components/sub-tab-bar";
import {
  NavPendingBody,
  NavTransitionProvider,
} from "@/components/nav-transition";
import { SearchConsolePrompt } from "@/components/analysis/search-console-prompt";
import { getAdminRole } from "@/lib/admin/access";

/**
 * The frame every authenticated page is rendered into.
 *
 * ## Why the chrome is behind `<Suspense>`
 *
 * This component used to `await` its whole fan-out — stage inputs,
 * notifications, profile, agent states — before returning a single element.
 * Nothing could paint until the slowest of them landed, so a click showed the
 * OLD page for the entire wait: 1–3.5s typically, 5.6s measured on
 * `/overview/website-audit` against the live backend. That silence is what
 * makes the app read as though clicks do nothing.
 *
 * The session read stays here and stays awaited, because it is a cookie read
 * with no network in it — free — and it is what authorises the page at all.
 * Everything with a round trip behind it now sits inside a boundary, so the
 * header, the tabs and the rail's outline reach the browser immediately and
 * fill in as the reads land.
 *
 * ## Why this is not the `loading.tsx` rule 0 forbids
 *
 * Rule 0 is about ROUTE-level boundaries — `app/(app)/loading.tsx` and the
 * thirteen per-segment files that followed it. Both attempts wedged every page
 * they covered on its skeleton permanently. These boundaries are ordinary
 * components in the tree, created and resolved inside one render, with no
 * route file involved. Verify any change to them the way rule 0 says to:
 * read `document.body.innerText.length` on the live page, not a screenshot.
 */
export async function PageShell({
  activeTab,
  currentStageId,
  children,
  subTabs,
  subTabActive,
  showConnectPrompt = true,
}: {
  activeTab: string;
  currentStageId: string;
  children: React.ReactNode;
  /**
   * The section's sub-tabs, rendered here rather than by the page.
   *
   * They belong to the navigation chrome, so they sit directly under the
   * primary tabs and ABOVE the stage rail: the rail reports on setup progress
   * and is not a place to navigate within a section. While each page rendered
   * its own, the rail was wedged between the two tab strips.
   */
  subTabs?: readonly { href: string; label: string }[];
  subTabActive?: string;
  /** Off for screens that are themselves part of connecting Google — asking
      someone to connect while they are mid-connect reads as a failure. */
  showConnectPrompt?: boolean;
}) {
  // Redirect rather than assert. `app/(app)/layout.tsx` guarantees a session
  // for the routes under it, but PageShell is also used OUTSIDE that group —
  // /connections/google/select does — and there the `!` was a 500 waiting for
  // a signed-out visitor. It found one.
  const session = await getSession();
  if (!session) redirect("/login");
  const businessId = session.businessId;

  return (
    // Wraps the chrome AND the body: the tab links report their navigation
    // from inside the header, and the body reads it. See `nav-transition.tsx`
    // for why the feedback lands on the body rather than on the tabs.
    <NavTransitionProvider>
      {/* The identity band, the primary tabs AND the section's sub-tabs are
          ONE sticky block, so all three stay put while the page scrolls under
          them.

          The sub-tab strip used to sit outside this and scrolled away. The
          obvious fix — `sticky top-[69px]` on the strip itself — is the one
          CLAUDE.md warns about: that 69 is the header's height written by
          hand, and it breaks silently the first time the header's padding,
          logo size or font changes, leaving either a gap or an overlap that
          nobody notices until a screenshot. One wrapper has no such number in
          it and the rows cannot come apart.

          `data-app-header` lives HERE rather than on the `TabBar` for the same
          reason: the scroll stacks measure this element to decide where a
          pinned card sits, and that has to be the height of everything that
          stays on screen, sub-tabs included. */}
      <div data-app-header className="sticky top-0 z-30">
        <Suspense fallback={<HeaderFrame activeTab={activeTab} businessId={businessId} />}>
          <Header activeTab={activeTab} businessId={businessId} />
        </Suspense>

        {/* No data behind it, so it never waits on one. */}
        {subTabs && subTabActive !== undefined && (
          <div className="print:hidden">
            <SubTabBar tabs={subTabs} activeHref={subTabActive} />
          </div>
        )}
      </div>

      {/* The onboarding stage rail was removed on request — the four-step
          Audit → Connections → Strategy → Agents progress strip no longer
          renders. `currentStageId` is kept on the props so pages need not
          change; nothing reads it now. */}

      {/* App-wide, but only once there is an analysis to stand beside — see
          the component for the gating rules. `null` while it decides: it is a
          suggestion, and a placeholder for one is noise. */}
      {showConnectPrompt && (
        <div className="print:hidden">
          <Suspense fallback={null}>
            <SearchConsolePrompt businessId={businessId} />
          </Suspense>
        </div>
      )}

      <NavPendingBody>{children}</NavPendingBody>
    </NavTransitionProvider>
  );
}

/** Everything in the identity band that comes from a backend read. */
async function Header({
  activeTab,
  businessId,
}: {
  activeTab: string;
  businessId: string;
}) {
  const [notifications, profile, agentStates, adminRole] = await Promise.all([
    getNotificationsRepo().list(businessId),
    // Free: the repo is memoised per render, and the analysis screens ask for
    // the same profile anyway.
    getBusinessProfileRepo().get(businessId),
    // Only the COUNT of offered agents is shown, so the plain list is enough —
    // no purchase or setup reads on every page for a number that ignores them.
    getAgentRepo().listStates(businessId),
    // Only decides whether the account menu offers the admin panel. Built-in
    // admins answer without a network call; anyone else costs one small read
    // of their own admin row.
    getAdminRole(businessId),
  ]);

  return (
    <TabBar
      activeHref={activeTab}
      unreadCount={notifications.filter((n) => !n.read).length}
      chip={brandChip(profile)}
      initials={accountInitials(businessId)}
      email={businessId}
      agentCount={agentStates.length}
      adminHref={adminRole !== null ? "/admin" : undefined}
    />
  );
}

/**
 * The header while its counts are still being read.
 *
 * ## Why it renders the real bar
 *
 * It used to render NOTHING — an empty box of the right height. The height was
 * the point (the band is sticky, so any difference between this and what
 * replaces it moves every pixel of the page), and the emptiness was deliberate
 * too: it had held shimmering blocks, which meant a second animation running
 * beside `PageLoading` for one wait.
 *
 * But the header suspends on EVERY navigation — it reads notifications, the
 * profile and every agent's state — so the consequence was that clicking a tab
 * made the wordmark, the tab strip, the brand chip and the account menu all
 * disappear until three backend calls landed, and then come back. Reported
 * 2026-09-11 with a screenshot of a page whose entire top was blank. A
 * navigation bar that vanishes when you use it is worse than any placeholder,
 * and it also took the pressed tab's own progress ring down with it.
 *
 * So this now renders the SAME `TabBar`, with only what is known without a
 * network call: the active tab, and the initials and address, both derived
 * from the session's businessId. No shimmer, no placeholder numbers — the
 * counts are simply absent until they are real, which is the rule that kept a
 * fake "0 unread" off this bar in the first place.
 *
 * The one visible cost is that the Agents tab's badge appears a moment after
 * the tabs do, which nudges the centred strip. That is a fraction of the
 * movement of the whole band disappearing.
 */
function HeaderFrame({ activeTab, businessId }: { activeTab: string; businessId: string }) {
  return (
    <TabBar
      activeHref={activeTab}
      initials={accountInitials(businessId)}
      email={businessId}
    />
  );
}

export async function currentBusinessId(): Promise<string> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.businessId;
}
