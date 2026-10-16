import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import Link from "@/components/ui/app-link";
import { PendingLink } from "@/components/ui/pending-link";
import {
  AGENT_ROW_ACTION,
  AGENT_ROW_ACTION_PRIMARY,
  AGENT_ROW_ACTION_SETUP,
} from "@/components/agents/row-action";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import { getAgentRepo } from "@/lib/data/agent-repo";
import { getConnectedMailbox } from "@/lib/data/email-callback";
import { getSession } from "@/lib/auth/session";
import { checkAgentRun } from "@/lib/data/agent-run-check";
import { LINKEDIN_CONNECT_PAGE } from "@/lib/data/agent-run-gate";
import { adsLeadsSummary } from "@/lib/data/lead-selection";
import { LeadQualificationConfigure } from "@/components/agents/lead-qualification-configure";
import { OnPageSeoConfigure } from "@/components/agents/on-page-seo-configure";
import { OffPageSeoConfigure } from "@/components/agents/off-page-seo-configure";
import { ROW_ACTION_LABEL, isReadyRow, type AgentRowStatus } from "@/lib/data/agent-row-status";
import { agentRowStatuses } from "@/lib/data/agent-live-status";
import { AgentDashboardSplit, AgentRowLink } from "@/components/agents/agent-dashboard-split";
import { AgentLogo } from "@/components/agents/agent-logo";
import { dashboardTabFor } from "@/lib/data/dashboard/tabs";
import { lockedDashboardTabs, opensDashboard } from "@/lib/data/dashboard/locked-tabs";
import { DashboardTabBody } from "@/components/agents/dashboard/dashboard-tab-body";
import { loadAgentDashboard } from "./dashboard-actions";
import { PageContainer } from "@/components/ui/page-container";
import { FlashNotice } from "@/components/ui/flash-notice";
import { readUnlockedAgents } from "@/lib/data/unlocked-agents";
import { ShrinkToFit } from "@/components/ui/shrink-to-fit";
import { LockSimple, Play, Plus } from "@phosphor-icons/react/ssr";

export const metadata: Metadata = { title: "Agents · LeadByte" };

/*
 * The agents page, as the 2026-10-15 design draws it. One frosted frame: the
 * title with an All / Ready / Needs setup filter, then each kind of agent as
 * a heading row (name, what it is for, how many) over its cards. The kinds
 * share one five-column grid where the list is wide, so Advertising (four)
 * sits beside Lead outreach (one) and Search & SEO (three) beside Content
 * (two). Each card: logo, name and a status pill, the description, a status
 * line, then Run agent (or Set up) and Dashboard, half each.
 *
 * Presentation only. Which agents there are, their state, what each button
 * does and the dashboard beside the list all come from the same reads and
 * components as before.
 *
 * Two shapes by the width of the LIST (container queries on `@container/list`,
 * and the unnamed `@2xl` resolving to it): wide, the design; narrow, beside an
 * open dashboard, the compact picker list it always was.
 */
const PANEL =
  "min-w-0 overflow-hidden rounded-lg border border-border bg-surface " +
  "@2xl:overflow-visible @2xl:rounded-none @2xl:border-0 @2xl:bg-transparent";

/**
 * Inside a kind: as many card columns as it has agents where the list is wide
 * (the kinds then sit side by side, `KIND_SPAN`); narrower, two across, and
 * each kind on a row of its own. Literal strings, for Tailwind's scanner.
 */
const CARD_COLUMNS: Record<number, string> = {
  1: "@2xl:grid-cols-1",
  2: "@2xl:grid-cols-2",
  3: "@2xl:grid-cols-2 @6xl/list:grid-cols-3",
  4: "@2xl:grid-cols-2 @6xl/list:grid-cols-4",
};

/** A kind's share of the five-column row: one column per agent in it. */
const KIND_SPAN: Record<number, string> = {
  1: "@6xl/list:col-span-1",
  2: "@6xl/list:col-span-2",
  3: "@6xl/list:col-span-3",
  4: "@6xl/list:col-span-4",
};

/** The filter at the top right. `?show=` so a filtered list can be linked. */
type ShowFilter = "all" | "ready" | "setup";

type AgentCategory = {
  key: string;
  title: string;
  description: string;
  ids: readonly string[];
};

/**
 * Presentation only: which panel each agent sits in. Every agent, its state
 * and its action still come from the repos and `agent-row-status.ts`.
 */
const AGENT_CATEGORIES: readonly AgentCategory[] = [
  // In the design's order: Advertising beside Lead outreach, then Search &
  // SEO beside Content.
  {
    key: "ads",
    title: "Advertising",
    description: "Plan, launch and optimize paid campaigns on each ad platform.",
    ids: ["meta-ads", "google-ads", "linkedin-ads", "openai-ads"],
  },
  {
    key: "leads",
    title: "Lead outreach",
    description: "Prioritize the leads most likely to buy and follow up by email.",
    ids: ["lead-qualification"],
  },
  {
    key: "seo",
    title: "Search & SEO",
    description: "Improve how search engines and AI answer engines read your pages.",
    ids: ["aeo", "on-page-seo", "off-page-seo"],
  },
  {
    key: "content",
    title: "Content",
    description: "Write and publish posts in your brand voice.",
    ids: ["social-media", "blog-posting"],
  },
];

const OTHER_AGENTS: AgentCategory = {
  key: "other",
  title: "Other agents",
  description: "More agents working for your business.",
  ids: [],
};

/** The card's status pill: a word, in the state's own colour. */
const PILL: Record<AgentRowStatus, { label: string; tone: string }> = {
  ready: { label: "Ready", tone: "bg-good-soft text-good" },
  "needs-setup": { label: "Needs setup", tone: "bg-warn-soft text-warn" },
  locked: { label: "Locked", tone: "bg-slate-soft text-slate" },
  blocked: { label: "Blocked", tone: "bg-crit-soft text-crit" },
  "coming-soon": { label: "Coming soon", tone: "bg-info-soft text-info" },
};

const POPUP_AGENT_IDS = ["lead-qualification", "on-page-seo", "off-page-seo"] as const;


async function AgentsPageBody({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; configure?: string; show?: string; unlocked?: string }>;
}) {
  const { agent, configure, show: rawShow, unlocked: rawUnlocked } = await searchParams;
  const show: ShowFilter = rawShow === "ready" || rawShow === "setup" ? rawShow : "all";
  const businessId = await currentBusinessId();
  const repo = getAgentRepo();
  // Which agents are offered is the repo's answer, not this page's. It was a
  // local `const` here, and the tab badge — which counts states, not this list
  // — did not know about it: seven agents on screen, nine on the badge.
  const definitions = repo.listDefinitions();

  /**
   * Which agent's dashboard is open, if any.
   *
   * `?agent=` rather than component state: the choice is a URL someone can
   * return to, and it lets the server read ONLY that agent's tables. Nothing is
   * open by default any more — the page starts on the list, and a dashboard
   * slides in when a Ready agent is picked (`agent-dashboard-split.tsx`). The
   * read is started here and discarded below if that agent is not Ready.
   */
  const requestedTab = dashboardTabFor(agent);

  // Every read on this page at once. They were three rounds — states and
  // mailbox, then the setup rows, then the dashboard — although none of them
  // needs another's answer: which agents to ask about and which dashboard to
  // show are both worked out above from the definitions and the URL alone.
  // Three round trips in a row became one.
  //
  // The mailbox is read once for the whole page: the Lead Qualification popup
  // needs to say which mailbox its outreach goes out from.
  // The popup agents' run gate: purchase first, then (Lead Qualification,
  // Off-Page) a mailbox. The popups themselves only know about the mailbox, so
  // an agent that was never bought gets an Unlock link instead of a popup.
  const session = await getSession();
  const signedEmail = session?.businessId ?? businessId;
  const [states, mailbox, adsSummary, statuses, popupGates, linkedInGate] = await Promise.all([
    repo.listStates(businessId),
    getConnectedMailbox(),
    adsLeadsSummary(businessId),
    // Locked / Needs setup / Ready for every agent — the SAME answer the tab
    // badge and Overview count (`agent-live-status.ts`), cached per render.
    agentRowStatuses(businessId),
    Promise.all(
      POPUP_AGENT_IDS.map(async (id) => [id, await checkAgentRun(id, signedEmail)] as const),
    ),
    // LinkedIn Ads has its own connect page (product notes, 2026-09-30): a
    // bought agent with no LinkedIn account connected opens there, not on the
    // agent screen. Kept apart from `popupGates`, whose connection step means
    // a mailbox.
    checkAgentRun("linkedin-ads", signedEmail),
  ]);
  const linkedInNeedsConnect =
    !linkedInGate.ok && (linkedInGate.step === "connection" || linkedInGate.step === "account");
  const gateById = new Map<string, Awaited<ReturnType<typeof checkAgentRun>>>(popupGates);
  const stateById = new Map(states.map((s) => [s.agentId, s]));

  // Agents that configure and run from a popup on this page rather than opening
  // their detail screen. Each maps to its own island; adding one is an entry
  // here, not a branch in the row below.
  const popupFor = (id: string, label: string, className: string, icon: React.ReactNode): React.ReactNode => {
    if (id === "lead-qualification") {
      return (
        <LeadQualificationConfigure
          mailbox={mailbox}
          adsSummary={adsSummary}
          autoOpen={configure === "lead-qualification"}
          label={label}
          className={className}
          icon={icon}
        />
      );
    }
    if (id === "on-page-seo")
      return <OnPageSeoConfigure mailbox={mailbox} label={label} className={className} icon={icon} />;
    if (id === "off-page-seo")
      return <OffPageSeoConfigure mailbox={mailbox} label={label} className={className} icon={icon} />;
    return null;
  };

  /**
   * What stands between a popup agent and a run, said on the row before the
   * click — "Configure" used to lead to a dead end and a second errand.
   * Purchase first; a mailbox only for the agents that need one.
   */
  const rowGate = (id: string) => {
    const gate = gateById.get(id);
    return gate && !gate.ok ? gate : null;
  };

  // One status per agent, then two groups: what is ready, and what needs
  // something from the customer first (`agent-row-status.ts`). The popup
  // agents' own gate adds the one thing the row status cannot know — that a
  // bought Lead Qualification or Off-Page is still waiting on a mailbox.
  const rows = definitions.map((def) => {
    const state = stateById.get(def.id);
    const status: AgentRowStatus = statuses.get(def.id) ?? "needs-setup";
    return { def, state, status };
  });
  const readyRows = rows.filter((row) => isReadyRow(row.status));
  // Just paid for (`?unlocked=`, from the payment pages): which of those
  // now read as bought, and which the backend has not recorded yet.
  const justBought = readUnlockedAgents(rawUnlocked, rows.map((row) => row.def.id));
  const justBoughtSet = new Set(justBought);
  const nameOf = (id: string) => rows.find((row) => row.def.id === id)?.def.name ?? id;
  const unlockedNow = justBought.filter((id) => statuses.get(id) !== "locked");
  const stillLocked = justBought.filter((id) => statuses.get(id) === "locked");
  const listNames = (ids: string[]) =>
    ids.length <= 1 ? ids.map(nameOf).join("") : `${ids.slice(0, -1).map(nameOf).join(", ")} and ${nameOf(ids[ids.length - 1]!)}`;
  // Coming soon sits last: it is the one row nobody can act on yet.
  const attentionRows = rows
    .filter((row) => !isReadyRow(row.status))
    .sort((a, b) => Number(a.status === "coming-soon") - Number(b.status === "coming-soon"));

  // Which agents open a dashboard, and which tabs stay locked, is one rule
  // shared with the dashboard's own loader (`locked-tabs.ts`), so the strip
  // and `loadAgentDashboard` can never disagree. The dashboard shows its own
  // honest empty state when a table is empty or could not be read.
  const statusById = new Map(rows.map((row) => [row.def.id, row.status] as const));
  const lockedTabs = lockedDashboardTabs(statusById);
  // Only for a reloaded or shared `?agent=`: after that the panel reads each
  // tab itself and this page is not rendered again to show one.
  const openTab = requestedTab && !lockedTabs.has(requestedTab.id) ? requestedTab : null;

  const renderRow = ({ def, state, status }: (typeof rows)[number]) => {
    const label = ROW_ACTION_LABEL[status];
    // The button's weight follows the row's state, not the other way round:
    // blue to run, soft blue to set up, outlined for the rest. Full width on
    // a card, its half of the bottom row.
    const actionClass = `${
      status === "ready"
        ? AGENT_ROW_ACTION_PRIMARY
        : status === "needs-setup"
          ? AGENT_ROW_ACTION_SETUP
          : AGENT_ROW_ACTION
    } @2xl:w-full`;
    const actionIcon =
      status === "ready" ? (
        <Play size={14} weight="fill" aria-hidden="true" />
      ) : status === "needs-setup" ? (
        <Plus size={15} weight="bold" aria-hidden="true" />
      ) : status === "locked" ? (
        <LockSimple size={15} weight="bold" aria-hidden="true" />
      ) : null;
    const runs = state?.runs.length ?? 0;
    const note =
      status === "locked"
        ? "Not in your plan yet."
        : status === "blocked" && state?.blockedReason
          ? state.blockedReason
          : rowGate(def.id)?.step === "connection"
            ? "Needs a connected mailbox before it can run."
            : def.id === "linkedin-ads" && linkedInNeedsConnect
              ? "Needs a connected LinkedIn Ads account."
              : null;
    const noteTone =
      status === "locked" ? "text-ink-soft" : status === "blocked" ? "text-crit" : "text-warn";
    const pill = PILL[status];
    // The card's status line (wide only). Only what is known: the latest run
    // as the repo recorded it (newest first), or what setup is waiting on.
    // A ready agent with no recorded run shows no line rather than a guess.
    const latest = state?.runs[0];
    const statusLine: { text: string; dot: string } | null =
      status === "ready"
        ? latest
          ? {
              text: [`Last run ${latest.date}`, latest.entries[0]?.title].filter(Boolean).join(" · "),
              dot: "bg-good",
            }
          : null
        : status === "needs-setup"
          ? {
              text:
                rowGate(def.id)?.step === "connection"
                  ? "Missing: a connected mailbox"
                  : def.id === "linkedin-ads" && linkedInNeedsConnect
                    ? "Missing: a connected LinkedIn Ads account"
                    : "Missing: your setup details",
              dot: "bg-warn",
            }
          : note
            ? { text: note, dot: status === "blocked" ? "bg-crit" : "bg-slate" }
            : null;
    return (
      // One markup, two shapes, by the width of the LIST (a container query):
      // narrow, beside an open dashboard, the compact picker row it was; wide,
      // the design's card. Grid placement moves the button between the two
      // (see the classes on each cell). One markup rather than two copies,
      // because the setup popups, their auto-open and the dashboard link must
      // each exist once.
      <div
        key={def.id}
        // The open agent is marked from the panel's own state — its link sets
        // `data-selected` — because the panel opens without this page being
        // rendered again. `isolate`: the row's buttons sit above its
        // full-row link (`z-10`), and that stays INSIDE the row rather than
        // reaching anything pinned above it as the list scrolls.
        className={`relative isolate grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2 transition-[background-color,box-shadow,border-color,transform] duration-200 ease-out hover:bg-surface-raised/60 has-[[data-selected=true]]:bg-accent-soft/60 has-[[data-selected=true]]:shadow-[inset_3px_0_0_var(--color-accent)] motion-reduce:transition-none @2xl:grid-cols-[auto_minmax(0,1fr)] @2xl:content-center @2xl:items-start @2xl:gap-x-3 @2xl:gap-y-3 @2xl:rounded-lg @2xl:border @2xl:border-ink/10 @2xl:bg-surface @2xl:p-5 @2xl:shadow-[0_1px_2px_rgb(12_21_63/0.06),0_10px_28px_-18px_rgb(12_21_63/0.4)] @2xl:hover:-translate-y-0.5 @2xl:hover:border-accent/30 @2xl:hover:bg-surface @2xl:hover:shadow-[0_2px_4px_rgb(12_21_63/0.06),0_18px_36px_-18px_rgb(12_21_63/0.45)] @2xl:focus-within:border-accent/40 @2xl:motion-reduce:hover:translate-y-0 ${
          status === "ready" ? "cursor-pointer" : ""
        } ${justBoughtSet.has(def.id) ? "@2xl:border-good/50 @2xl:ring-2 @2xl:ring-good/30" : ""}`}
      >
        <AgentLogo
          agentId={def.id}
          className="col-start-1 row-span-2 row-start-1 size-9 self-center @2xl:row-span-1 @2xl:size-11 @2xl:rounded-lg @2xl:bg-accent-soft/60"
          imageClassName="size-5 @2xl:size-6"
        />
        {/* Narrow, one column beside the logo. Wide, `contents`: its pieces
            take their own rows of the card, so the description starts under
            the logo as the design draws it, not indented beside it. */}
        <div className="col-start-2 row-start-1 flex min-w-0 flex-col @2xl:contents">
          {/* The name, and the status at the top right. Where the two do not
              both fit, the pill drops under the name (`justify-between` puts a
              lone item at the start) rather than cutting the name to "On-…". */}
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 @2xl:col-start-2 @2xl:row-start-1 @2xl:self-center">
            <span className="min-w-0 max-w-full truncate font-medium text-ink @2xl:text-lg @2xl:font-semibold" title={def.name}>
              {def.name}
            </span>
            {/* Narrow, only the states the button cannot say (Ready and Set up
                are what its button looks like); wide, every state, as the
                design's pill. */}
            <span
              className={`shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold @2xl:px-2.5 @2xl:py-1 ${pill.tone} ${
                status === "ready" || status === "needs-setup" ? "hidden @2xl:inline-flex" : "inline-flex"
              }`}
            >
              {pill.label}
            </span>
          </div>
          {/* Wide only (in full on hover). Narrow, the row is a picker and a
              name with its state is all that fits. */}
          <p
            className="hidden text-sm leading-6 text-ink-soft @2xl:col-span-2 @2xl:col-start-1 @2xl:row-start-2 @2xl:line-clamp-3"
            title={def.description}
          >
            {def.description}
          </p>
          {/* Narrow: the note under the name. Wide: the status line below. */}
          {note && (
            <p className={`mt-0.5 text-xs ${noteTone} @2xl:hidden`} title={note}>
              {note}
            </p>
          )}
          {statusLine && (
            <p
              className="hidden min-w-0 items-center gap-2 text-sm text-ink-soft @2xl:col-span-2 @2xl:col-start-1 @2xl:row-start-3 @2xl:flex"
              title={statusLine.text}
            >
              <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${statusLine.dot}`} />
              <span className="truncate">{statusLine.text}</span>
            </p>
          )}
        </div>
        {/* The bottom edge: Run agent (or Set up), then Dashboard, each half
            the card's width. Narrow, this wrapper is `display: contents` — it
            draws nothing, and its two children are placed straight into the
            row's grid (button on the right, links under the name). Wide, it
            is that row, under the logo as well as the text. */}
        <div className="contents @2xl:col-span-2 @2xl:col-start-1 @2xl:row-start-4 @2xl:mt-1 @2xl:flex @2xl:items-center @2xl:gap-3">
          {/* A ready agent's run control is hidden in the narrow list beside an
              open dashboard: a column of identical blue buttons beside the names
              drowned the list it was meant to sit in. The ones with an ERRAND on
              them keep their button at any width.

              The slot lets clicks through (`pointer-events-none`) so a card's
              empty right edge still opens the dashboard; only the button inside
              takes them. */}
          <div
            data-action-cell
            className={`pointer-events-none relative z-10 col-start-3 row-span-2 row-start-1 self-center justify-self-end @2xl:min-w-0 @2xl:flex-1 ${
              status === "ready" ? "hidden @2xl:block" : ""
            }`}
          >
            <div className="pointer-events-auto flex items-center gap-2 @2xl:w-full">
              {status === "coming-soon" ? null : status === "locked" ? (
                <PendingLink href="/pricing" className={actionClass}>
                  {actionIcon}
                  {label}
                </PendingLink>
              ) : (
                popupFor(def.id, label, actionClass, actionIcon) ?? (
                  <PendingLink
                    href={
                      def.id === "linkedin-ads" && linkedInNeedsConnect
                        ? LINKEDIN_CONNECT_PAGE
                        : `/agents/${def.id}`
                    }
                    className={actionClass}
                  >
                    {actionIcon}
                    {label}
                  </PendingLink>
                )
              )}
            </div>
          </div>
          {/* `flex`, not a block: the dashboard link is inline, and in a block
              it opens an empty, line-tall strip in the narrow list, where it
              shows no words. */}
          <div className="col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 @2xl:flex-1 @2xl:flex-nowrap">
            {/* Always rendered: its `::after` is what makes the whole row (or
                card) open the dashboard. Only its WORDS come and go. */}
            {opensDashboard(def.id, status) && <AgentRowLink agentId={def.id} />}
            {runs > 0 && (
              <Link
                href={`/agents/${def.id}`}
                className="relative z-10 text-xs text-ink-soft underline-offset-2 transition-colors duration-150 hover:text-ink hover:underline motion-reduce:transition-none @2xl:hidden"
              >
                History · {runs}
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Narrow: rows in a ruled list. Wide: cards (`CARD_COLUMNS`).
  const renderGroup = (items: typeof rows) =>
    items.length === 0 ? null : (
      <div
        className={`min-w-0 divide-y divide-border @2xl:grid @2xl:flex-1 @2xl:auto-rows-fr @2xl:gap-4 @2xl:divide-y-0 ${
          CARD_COLUMNS[Math.min(items.length, 4)]
        }`}
      >
        {items.map(renderRow)}
      </div>
    );

  const renderPanel = ({ look, items }: (typeof categoryGroups)[number]) => (
    <section
      key={look.key}
      className={`${PANEL} @2xl:flex @2xl:flex-col @2xl:gap-3 ${KIND_SPAN[Math.min(items.length, 4)]}`}
    >
      {/* The kind's heading row: name, what it is for, and how many. No box
          and no icon where the list is wide (2026-10-15 design): a heading
          on the frame, over its cards. A container of its own, so the
          description shows only where the row has room for it, cut with an
          ellipsis rather than wrapping. Everything else in it is sized by
          the LIST (`/list`): an unnamed query here would read its own width. */}
      <header className="@container/head flex min-w-0 items-baseline gap-3 border-b border-border px-4 py-2.5 @2xl/list:border-0 @2xl/list:px-0 @2xl/list:py-0">
        <h2 className="shrink-0 text-sm font-semibold text-ink @2xl/list:text-lg @2xl/list:font-bold">{look.title}</h2>
        <p className="hidden min-w-0 truncate text-sm text-ink-soft @xs/head:block" title={look.description}>
          {look.description}
        </p>
        <span className="ml-auto hidden shrink-0 text-sm text-ink-soft @2xl/list:inline">
          {items.length} {items.length === 1 ? "agent" : "agents"}
        </span>
      </header>
      {renderGroup(items)}
    </section>
  );

  // In each kind's own order, as the design lays them out. The filter at the
  // top keeps all, the ready ones, or the ones waiting on something. An agent
  // no kind claims still appears, under "Other agents": a new agent must
  // never vanish because nobody added it here.
  const shown = show === "ready" ? readyRows : show === "setup" ? attentionRows : rows;
  const claimed = new Set(AGENT_CATEGORIES.flatMap((look) => look.ids));
  const categoryGroups = [
    ...AGENT_CATEGORIES.map((look) => ({
      look,
      items: shown
        .filter((row) => look.ids.includes(row.def.id))
        .sort((a, b) => look.ids.indexOf(a.def.id) - look.ids.indexOf(b.def.id)),
    })),
    { look: OTHER_AGENTS, items: shown.filter((row) => !claimed.has(row.def.id)) },
  ].filter(({ items }) => items.length > 0);

  const filters: { key: ShowFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: rows.length },
    { key: "ready", label: "Ready", count: readyRows.length },
    { key: "setup", label: "Needs setup", count: attentionRows.length },
  ];

  return (
    <>
      <PageContainer fit="fill">
        {/* The list alone until a Ready agent is picked; then that agent's
            dashboard slides in from the right and the list makes room. */}
        <AgentDashboardSplit
          list={
            <div className="@container/list min-w-0">
              {/* One screen, no scrolling, on a desktop: scaled down just enough
                  to fit the frame when the window is short (`ShrinkToFit`). */}
              <ShrinkToFit className="flex min-w-0 flex-col gap-3 @2xl:gap-5">
              {justBought.length > 0 && (
                <FlashNotice
                  clear={["unlocked"]}
                  duration={12_000}
                  className="rounded-lg bg-good-soft px-4 py-3 text-sm text-ink"
                >
                  <p className="font-semibold text-good">Payment complete</p>
                  {unlockedNow.length > 0 && (
                    <p className="mt-0.5 text-ink-soft">
                      {listNames(unlockedNow)} {unlockedNow.length === 1 ? "is" : "are"} unlocked and ready to use.
                    </p>
                  )}
                  {stillLocked.length > 0 && (
                    <p className="mt-0.5 text-ink-soft">
                      {listNames(stillLocked)} {stillLocked.length === 1 ? "is" : "are"} being unlocked. Refresh this
                      page in a minute.
                    </p>
                  )}
                </FlashNotice>
              )}
              {/* The heading, and the filter on the right where the list is
                  wide. In THIS column, so an open dashboard starts level with it. */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight text-ink @2xl:text-3xl">AI agent control center</h1>
                  <p className="mt-1 max-w-prose text-sm text-ink-soft @2xl:max-w-none @2xl:text-base">
                    Each agent already knows your products, brand voice, audit findings and campaign performance — you
                    only fill in what it can&apos;t infer.
                  </p>
                </div>
                <nav
                  aria-label="Filter agents"
                  className="hidden shrink-0 items-center gap-1 rounded-lg border border-ink/10 bg-surface p-1 shadow-sm @2xl:flex"
                >
                  {filters.map((filter) => {
                    const active = show === filter.key;
                    return (
                      <Link
                        key={filter.key}
                        href={filter.key === "all" ? "/agents" : `/agents?show=${filter.key}`}
                        scroll={false}
                        aria-current={active ? "page" : undefined}
                        className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                          active ? "bg-accent text-surface" : "text-ink hover:bg-surface-raised"
                        }`}
                      >
                        {filter.label}
                        <span className="tabular-nums">{filter.count}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>
              {/* The kinds, on one five-column grid where the list is wide:
                  each takes one column per agent, so Advertising (four) sits
                  beside Lead outreach (one) and Search & SEO (three) beside
                  Content (two). Narrower, each kind on a row of its own. */}
              {categoryGroups.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-soft">
                  {show === "setup" ? "Every agent is ready to run." : "No agents are ready yet."}{" "}
                  <Link href="/agents" className="font-medium text-accent-ink underline-offset-2 hover:underline">
                    Show all agents
                  </Link>
                </p>
              ) : (
                <div className="grid min-w-0 gap-3 @2xl:gap-x-6 @2xl:gap-y-5 @6xl/list:grid-cols-5">
                  {categoryGroups.map(renderPanel)}
                </div>
              )}
              </ShrinkToFit>
            </div>
          }
                    initialTab={openTab?.id ?? null}
          initialContent={
            openTab ? (
              <DashboardTabBody tab={openTab} email={session?.businessId ?? businessId} uid={session?.userId} />
            ) : null
          }
          locked={[...lockedTabs]}
          load={loadAgentDashboard}
        />
      </PageContainer>
    </>
  );
}

/**
 * The page's own reads sit behind a boundary so the frame does not wait on
 * them. Without it the whole screen — header, tabs, rail — was held back until
 * the slowest backend read landed, and a click showed the previous page for
 * the entire wait. See the note on `PageShell`; this is NOT a route-level
 * `loading.tsx` (rule 0).
 */
export default function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; configure?: string; show?: string; unlocked?: string }>;
}) {
  return (
    <PageShell activeTab="/agents" currentStageId="agents">
      <Suspense fallback={<PageLoading title="Agents" />}>
        <AgentsPageBody searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}
