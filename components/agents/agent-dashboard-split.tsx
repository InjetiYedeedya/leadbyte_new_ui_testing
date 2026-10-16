"use client";

/**
 * The agents list, and the dashboard that slides in beside it.
 *
 * ## The flow
 *
 * The page opens on the list alone, full width. Picking an agent's "View
 * dashboard" brings its dashboard in from the right AT ONCE: the list narrows
 * to 20% and the panel slides into the 80% it leaves, carrying one loader
 * (`PanelLoading`) until the figures land. The × sends it back out.
 *
 * ## Why the panel loads itself
 *
 * It used to be rendered by the page, so every action on it reloaded the page.
 * Opening was a navigation to `?agent=<id>` — a new page instance as far as
 * Next is concerned — so the screen swapped to `PageLoading` while a ring also
 * turned beside the row's arrow: two loaders for one click, and the list
 * vanished to show a panel next to it. Refresh was `router.refresh()`, which
 * re-ran every read on the page to update one panel.
 *
 * Now the panel asks `load` (the `loadAgentDashboard` Server Action) for the
 * open tab's server-rendered content, and nothing else on the page moves. The
 * URL still follows the open tab — rewritten in place with `replaceState`, so a
 * dashboard can be reloaded and shared, and the server renders that first
 * panel itself (`initialTab` / `initialContent`). In place rather than pushed:
 * Back leaves the page instead of stepping through every tab clicked.
 *
 * ## Why this earns `"use client"`
 *
 * Keeping the OUTGOING panel on screen long enough to animate it away, running
 * the transitions, and holding which tab is open and what was last read for
 * it. It never fetches on its own account — `load` is a Server Action handed in.
 *
 * ## How the motion is built
 *
 * - **The columns animate, not a pixel width.** On wide screens the grid goes
 *   from `1fr 0fr` to `2fr 8fr`, which the browser interpolates, so the list
 *   narrows smoothly instead of snapping. It is a transition, so a click
 *   mid-motion (open, then × at once) reverses from where it is.
 * - **The panel slides in from the right** while its column opens: a 40px
 *   travel with a fade, on the iOS-drawer curve, so it arrives with momentum
 *   and settles softly rather than stopping dead.
 * - **Its content keeps a minimum width during the slide**, inside a column
 *   that clips — so the figures are REVEALED as the column widens instead of
 *   re-wrapping on every frame.
 * - **Leaving is quicker than arriving** (the thing is going away; nobody is
 *   reading it).
 * - Below `xl` the panel sits under the list; it still slides in from the
 *   right, and the page scrolls to it, because otherwise the click appears to
 *   do nothing.
 * - Reduced motion: no transitions at all; it simply appears.
 */

import { ChartBar } from "@phosphor-icons/react";
import Link from "@/components/ui/app-link";
// The router when there is one (the app), without requiring it (unit tests
// render this alone): `useRouter` throws outside a mounted app router.
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DashboardSwap } from "@/components/agents/dashboard-swap";
import { DashboardRefresh } from "@/components/agents/dashboard/dashboard-refresh";
import { PanelLoading } from "@/components/agents/dashboard/panel-loading";
import { DASHBOARD_TABS, type DashboardTabId } from "@/lib/data/dashboard/tabs";

/** iOS-drawer curve — momentum in, soft landing. */
const DRAWER = "cubic-bezier(0.32, 0.72, 0, 1)";
/**
 * Opening and closing are not the same gesture, so they do not share a curve.
 *
 * `DRAWER` leaves fast and settles slowly, which is right for a panel arriving
 * — it is on screen almost at once and eases into place. Played in reverse it
 * is the opposite of smooth: the panel bolts at the first frame, which is what
 * made closing read as a jump rather than a movement. `CLOSE_EASE` starts from
 * nothing and ends in nothing, and it runs longer, so the column widths, the
 * fade and the slide all finish together.
 */
const CLOSE_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
const OPEN_MS = 480;

/**
 * Closing happens in two stages rather than all at once.
 *
 * Done together, the panel was still half visible while its column was
 * narrowing underneath it, so the last thing seen on the way out was content
 * being squeezed — the "sudden movement". The panel now leaves FIRST, and the
 * space it occupied closes up behind it once it is almost gone. The collapse
 * starts a little before the fade ends (`CLOSE_HOLD_MS` is shorter than
 * `CLOSE_FADE_MS`) so the two read as one movement rather than two.
 */
const CLOSE_FADE_MS = 300;
const CLOSE_HOLD_MS = 170;
const CLOSE_COLLAPSE_MS = 640;
/** What the panel's unmount waits for: both stages, start to finish. */
const CLOSE_MS = CLOSE_HOLD_MS + CLOSE_COLLAPSE_MS;

/** Reads one tab's server-rendered content — `loadAgentDashboard`. */
export type DashboardLoader = (tabId: DashboardTabId) => Promise<ReactNode>;

interface DashboardControl {
  selected: DashboardTabId | null;
  open: (tabId: DashboardTabId) => void;
}

/**
 * How a row's link reaches the panel. The rows are server-rendered inside
 * `list`, so a prop cannot carry the panel's state to them; this does.
 */
const DashboardContext = createContext<DashboardControl | null>(null);

/*
 * The panel's controls (Auto / Refresh / Last updated / close) sit IN the open
 * tab's own title row rather than in a row of their own above it. That row
 * held nothing but four controls pushed to the right, so most of its width
 * was empty — and the title row under it had its own empty middle.
 *
 * The tab content is server-rendered and cannot be handed props from here, so
 * the controls travel by context: `PanelControls`, dropped into a tab's title
 * row, draws them and CLAIMS the slot. While nothing has claimed it — the
 * loader, the error card, a tab whose title row is not on screen — the panel
 * draws its own row as before, so the close button can never go missing.
 */
const PanelControlsContext = createContext<ReactNode>(null);
const PanelClaimContext = createContext<(() => () => void) | null>(null);

/**
 * The height that makes `ref` end exactly where the window does, so the page
 * itself has nothing left to scroll — or null where that does not apply.
 *
 * MEASURED rather than `100dvh - <header>`: what sits above this element (the
 * sticky header, the connect banner that comes and goes, the page's padding)
 * and below it (the panel's bottom padding) is not one number, and any typed
 * figure is the `top-[69px]` trap again. Re-measured on resize and whenever
 * anything on the page changes size.
 */
function useFillViewport(ref: React.RefObject<HTMLElement | null>, active: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!active) {
      setHeight(null);
      return;
    }
    const el = ref.current;
    // Without either API (a test DOM) there is nothing to size against; the
    // page simply scrolls, as it does below `xl`.
    if (!el || typeof window.matchMedia !== "function" || typeof ResizeObserver === "undefined") return;
    // Side by side only from `xl`; below it the two stack and the page scrolls.
    const wide = window.matchMedia("(min-width: 1280px)");
    const measure = () => {
      if (!wide.matches) return setHeight(null);
      const rect = el.getBoundingClientRect();
      // Inside a card that scrolls within itself (`PageContainer fit`): fill
      // what is left of the CARD, so the card has nothing to scroll and the
      // sidebar and the dashboard scroll on their own inside it. Measuring
      // the window here instead is what ran the dashboard off the bottom of
      // the card.
      const scroller = el.closest<HTMLElement>("[data-fit-scroll]");
      if (scroller) {
        const box = scroller.getBoundingClientRect();
        const padBottom = parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
        // From the scroller's top edge to this element, whatever it is
        // scrolled to.
        const offset = rect.top - box.top + scroller.scrollTop;
        return setHeight(Math.max(360, Math.floor(scroller.clientHeight - offset - padBottom)));
      }
      const top = rect.top + window.scrollY;
      const below = document.documentElement.scrollHeight - (rect.bottom + window.scrollY);
      // A floor so a very short window still shows a usable panel; under it
      // the page scrolls as a last resort rather than squeezing to nothing.
      setHeight(Math.max(360, Math.floor(window.innerHeight - top - below)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    const card = el.closest("[data-fit-scroll]");
    if (card) observer.observe(card);
    window.addEventListener("resize", measure);
    wide.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      wide.removeEventListener("change", measure);
    };
  }, [ref, active]);
  return height;
}

export function PanelControls() {
  const controls = useContext(PanelControlsContext);
  const claim = useContext(PanelClaimContext);
  // Drawn only after mount: the server-rendered panel already carries its own
  // row, and drawing both until hydration would show the controls twice.
  const [mounted, setMounted] = useState(false);
  // Layout, not passive: the panel drops its own row before the first paint.
  useLayoutEffect(() => {
    if (!claim) return;
    setMounted(true);
    return claim();
  }, [claim]);
  return mounted ? <>{controls}</> : null;
}

function isTabId(id: string): id is DashboardTabId {
  return DASHBOARD_TABS.some((tab) => tab.id === id);
}

/** The address bar follows the open tab, rewritten in place (see above). */
function followUrl(tabId: DashboardTabId | null, mode: "push" | "replace" = "replace") {
  const url = new URL(window.location.href);
  if (tabId) url.searchParams.set("agent", tabId);
  else url.searchParams.delete("agent");
  // One-shot: a popup it opened has been dealt with by now.
  url.searchParams.delete("configure");
  const next = url.pathname + url.search;
  if (mode === "push") window.history.pushState(null, "", next);
  else window.history.replaceState(null, "", next);
}

/**
 * An agent's "View dashboard", which opens its panel. Its `::after` covers the
 * whole row, so the row is the click target, while the row's own buttons sit
 * above it (`relative z-10` on their container) and keep working.
 *
 * A real link to `?agent=<id>`, so a new tab or a copied link still works — an
 * ordinary click is taken over and opens the panel in place, with no
 * navigation and so no page loader. `data-selected` lets the server-rendered
 * row highlight itself (`has-[…]`) from state it does not otherwise see.
 */
export function AgentRowLink({ agentId }: { agentId: string }) {
  const control = useContext(DashboardContext);
  const selected = control?.selected === agentId;
  return (
    <Link
      href={`/agents?agent=${encodeURIComponent(agentId)}`}
      scroll={false}
      // The full name, for a screen reader; the card shows the short one.
      aria-label={selected ? "Showing dashboard" : "View dashboard"}
      aria-current={selected ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      onClick={(event) => {
        const elsewhere =
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
        if (elsewhere || !control || !isTabId(agentId)) return;
        event.preventDefault();
        control.open(agentId);
      }}
      className="group inline-flex items-center justify-center gap-1.5 text-sm font-medium text-accent-ink after:absolute after:inset-0 after:content-[''] whitespace-nowrap @2xl:h-9 @2xl:w-full @2xl:rounded-md @2xl:border @2xl:border-border @2xl:bg-surface @2xl:px-3 @2xl:text-ink @2xl:transition-colors @2xl:hover:bg-surface-raised focus-visible:outline-none focus-visible:after:rounded-md focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent"
    >
      {/* The row itself is the control (`after:inset-0`). Beside an open
          dashboard the list is too narrow to spend a line on saying so, and
          the link keeps only its accessible name; on a card it is a quiet
          "Dashboard" with a chart mark, beside Run agent (2026-10-13 design). */}
      <span className="sr-only @2xl:not-sr-only @2xl:inline-flex @2xl:items-center @2xl:gap-1.5">
        <ChartBar size={16} weight="bold" aria-hidden="true" />
        Dashboard
      </span>
    </Link>
  );
}

type Phase = "idle" | "loading" | "refreshing" | "error";

export function AgentDashboardSplit({
  list,
  listMode = "beside",
  closeHref,
  initialTab,
  initialContent,
  locked,
  load,
}: {
  list: ReactNode;
  /**
   * "beside": the list narrows to a sidebar next to the open dashboard.
   * "replace" (2026-10-14): what `list` holds is only for when no dashboard
   * is open, and the dashboard takes the whole width — the agent cards moved
   * to the top menu, so there is no list to keep beside it.
   */
  listMode?: "beside" | "replace";
  /** Where the × goes, when closing should leave the page (the Agents page). */
  closeHref?: string;
  /** The tab a reloaded or shared `?agent=` opened, or null for none. */
  initialTab: DashboardTabId | null;
  /** That tab's content, rendered by the page itself. */
  initialContent: ReactNode | null;
  /** Tabs whose agent this account has not bought. */
  locked: readonly DashboardTabId[];
  load: DashboardLoader;
}) {
  const lockedSet = useMemo(() => new Set(locked), [locked]);
  const router = useContext(AppRouterContext);

  // Which tab is open; null when the panel is closed (or closing).
  const [tab, setTab] = useState<DashboardTabId | null>(initialTab);
  // The tab the panel shows — kept through the slide-out, when `tab` is null.
  const [displayTab, setDisplayTab] = useState<DashboardTabId | null>(initialTab);
  const [content, setContent] = useState<ReactNode | null>(initialContent);
  const [contentTab, setContentTab] = useState<DashboardTabId | null>(
    initialContent !== null ? initialTab : null,
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const open = tab !== null;
  const [rendered, setRendered] = useState(open);
  const [entered, setEntered] = useState(open);
  const panelRef = useRef<HTMLDivElement>(null);
  // False only for the very first render: a panel opened by a reloaded URL is
  // simply there, with no entrance to perform.
  const mounted = useRef(false);

  // Read inside stable callbacks — the refresh timer must not be re-armed by
  // every render — so the latest values live in refs as well as state.
  const loadRef = useRef(load);
  loadRef.current = load;
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const contentTabRef = useRef(contentTab);
  contentTabRef.current = contentTab;
  // Only the newest read may land: a slow reply for a tab already left behind
  // must not overwrite the one now open.
  const requestRef = useRef(0);

  const read = useCallback(async (tabId: DashboardTabId, mode: "open" | "refresh") => {
    const request = ++requestRef.current;
    setPhase(mode === "open" ? "loading" : "refreshing");
    try {
      const next = await loadRef.current(tabId);
      if (request !== requestRef.current) return;
      setContent(next);
      setContentTab(tabId);
      setUpdatedAt(Date.now());
      setPhase("idle");
    } catch (error) {
      if (request !== requestRef.current) return;
      console.error(`[agent-dashboard] could not load ${tabId}:`, error);
      setPhase("error");
    }
  }, []);

  /*
   * Back closes the dashboard (2026-10-12). Opening it from the list PUSHES a
   * history entry, so the browser's Back returns to the list rather than
   * leaving the Agents page — it used to replace the URL, and Back skipped the
   * list entirely. Switching agents while one is open REPLACES, so Back is one
   * step to the list, not a walk back through every agent looked at. The panel
   * follows the URL on Back and Forward (the `popstate` effect below).
   *
   * `pushedRef` is whether the entry on screen is one this opened — the close
   * button then steps back through it rather than leaving it behind, which
   * would make the next Back land on a second copy of the list.
   */
  const pushedRef = useRef(false);

  const show = useCallback(
    (tabId: DashboardTabId) => {
      // Already showing exactly this: nothing to read again.
      if (tabRef.current === tabId && contentTabRef.current === tabId && phaseRef.current === "idle") return;
      setTab(tabId);
      setDisplayTab(tabId);
      // Another agent's figures must not sit under this one's name while it
      // loads — the card shows the loader instead.
      if (contentTabRef.current !== tabId) setContent(null);
      void read(tabId, "open");
    },
    [read],
  );

  const openTab = useCallback(
    (tabId: DashboardTabId) => {
      if (lockedSet.has(tabId)) return;
      const opening = tabRef.current === null;
      followUrl(tabId, opening ? "push" : "replace");
      if (opening) pushedRef.current = true;
      show(tabId);
    },
    [lockedSet, show],
  );

  const refresh = useCallback(() => {
    const current = tabRef.current;
    // One read at a time; a refresh never lands on top of an opening tab.
    if (current === null || phaseRef.current === "loading" || phaseRef.current === "refreshing") return;
    void read(current, contentTabRef.current === current ? "refresh" : "open");
  }, [read]);

  const gridRef = useRef<HTMLDivElement>(null);
  const [claimed, setClaimed] = useState(0);
  const claimControls = useCallback(() => {
    setClaimed((n) => n + 1);
    return () => setClaimed((n) => n - 1);
  }, []);

  const hide = useCallback(() => {
    // Anything still on its way is for a panel that is leaving.
    requestRef.current += 1;
    setPhase("idle");
    setTab(null);
  }, []);

  const close = useCallback(() => {
    // Nothing to return to beside it (the cards live in the top menu): the
    // home page, rather than an empty screen.
    if (closeHref) {
      if (router) router.push(closeHref);
      else window.location.assign(closeHref);
      return;
    }
    if (pushedRef.current) {
      // Step back through the entry opening pushed; `popstate` hides it.
      pushedRef.current = false;
      window.history.back();
      return;
    }
    // Opened from a link (`?agent=` on arrival): there is no entry of ours to
    // step back through, so the URL is put right in place.
    hide();
    followUrl(null);
  }, [hide, closeHref, router]);

  // Back and Forward: the panel follows the URL.
  useEffect(() => {
    const onPopState = () => {
      const id = new URLSearchParams(window.location.search).get("agent");
      if (id !== null && isTabId(id) && !lockedSet.has(id)) {
        // Arrived (Forward) on an entry with a dashboard: closing it should
        // step back again, as it would have before.
        pushedRef.current = true;
        if (tabRef.current !== id) show(id);
      } else {
        pushedRef.current = false;
        if (tabRef.current !== null) hide();
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [hide, lockedSet, show]);

  // The figures the page rendered were read just now.
  useEffect(() => {
    if (initialContent !== null) setUpdatedAt(Date.now());
    else if (initialTab !== null) void read(initialTab, "open");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first render only
  }, []);

  useEffect(() => {
    const isFirst = !mounted.current;
    mounted.current = true;

    if (!open) {
      setEntered(false);
      const timer = setTimeout(() => {
        setRendered(false);
        setContent(null);
        setContentTab(null);
        setDisplayTab(null);
      }, CLOSE_MS);
      return () => clearTimeout(timer);
    }

    setRendered(true);
    if (isFirst) return;
    // Paint the panel off to the right first, then move it in next frame.
    const frame = requestAnimationFrame(() => {
      setEntered(true);
      if (window.matchMedia?.("(max-width: 1279px)").matches) {
        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const visible = open && entered;
  const ease = open ? DRAWER : CLOSE_EASE;
  const control = useMemo(() => ({ selected: tab, open: openTab }), [tab, openTab]);

  const shownTab = displayTab;
  const hasContent = content !== null && contentTab === shownTab;

  // Open, the split is sized to the window and its two columns scroll inside
  // it; the page, its background and both cards stay where they are.
  const fill = useFillViewport(gridRef, visible);

  const controls = (
    <div className="flex items-center gap-2">
      {hasContent && (
        <DashboardRefresh
          onRefresh={refresh}
          refreshing={phase === "refreshing"}
          updatedAt={updatedAt}
        />
      )}
      <button
        type="button"
        onClick={close}
        aria-label="Close the dashboard"
        className="grid size-11 place-items-center rounded-md border border-border bg-surface text-ink-soft transition-colors duration-150 hover:bg-surface-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.96] motion-reduce:transform-none"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-5">
          <path
            d="M4 4l8 8M12 4l-8 8"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );

  return (
    <DashboardContext value={control}>
    <PanelControlsContext value={controls}>
    <PanelClaimContext value={claimControls}>
      <div
        ref={gridRef}
        // `grid-rows-[minmax(0,1fr)]` while the split is sized to the card: an
        // implicit row is sized by its CONTENT, so a long dashboard stretched
        // the row past the split's own height, every `h-full` below filled
        // that row instead of the card, and neither column could scroll —
        // the card scrolled the whole page instead. Capping the row at the
        // split's height is what lets the sidebar and the dashboard scroll on
        // their own. (Checked in a real browser engine, not by eye.)
        className={`grid items-start gap-y-4 motion-reduce:!transition-none ${
          fill !== null ? "grid-rows-[minmax(0,1fr)]" : ""
        } ${
          visible
            ? listMode === "replace"
              ? // ONE column: the list is `hidden` (out of the grid), so a
                // `0fr` first column took the PANEL and drew it 0px wide —
                // the dashboard was a blank card (2026-10-14).
                "xl:grid-cols-[minmax(0,1fr)] xl:gap-x-0"
              : "xl:grid-cols-[minmax(0,2fr)_minmax(0,8fr)] xl:gap-x-4"
            : "xl:grid-cols-[minmax(0,1fr)_0fr] xl:gap-x-0"
        }`}
        style={{
          transitionProperty: "grid-template-columns, column-gap",
          transitionDuration: `${open ? OPEN_MS : CLOSE_COLLAPSE_MS}ms`,
          transitionTimingFunction: ease,
          // Stage two: wait for the panel to be on its way out before taking
          // its space back. Opening has nothing to wait for.
          transitionDelay: open ? "0ms" : `${CLOSE_HOLD_MS}ms`,
          height: fill ?? undefined,
        }}
      >
        {/* Beside an open dashboard the list is a sidebar the height of the
            split, scrolling on its own only if the agents outgrow it.
            `overscroll-contain` keeps that scroll from running on into the
            dashboard's. Closed, the list IS the page and scrolls with it. */}
        <div
          className={`min-w-0 ${
            listMode === "replace" && open
              ? "hidden"
              : fill !== null
                ? "h-full overflow-y-auto overscroll-contain pr-1"
                : ""
          }`}
        >
          {list}
        </div>

        <div
          ref={panelRef}
          className={`min-w-0 overflow-hidden xl:overflow-visible ${fill !== null ? "h-full" : ""}`}
          aria-live="polite"
        >
          {rendered && shownTab !== null && (
            <div className={`xl:overflow-hidden ${fill !== null ? "h-full" : ""}`}>
              <div
                className={`motion-reduce:!transform-none motion-reduce:!opacity-100 motion-reduce:!transition-none xl:min-w-[34rem] ${fill !== null ? "h-full" : ""}`}
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateX(0)" : "translateX(28px)",
                  // Stage one, and the only thing moving at first.
                  transition: open
                    ? `transform ${OPEN_MS}ms ${ease}, opacity 280ms ${ease}`
                    : `transform ${CLOSE_FADE_MS}ms ${ease}, opacity ${CLOSE_FADE_MS}ms ${ease}`,
                  // Both properties are composited; saying so up front keeps
                  // the first frame of each stage off the main thread.
                  willChange: "transform, opacity",
                }}
              >
                <section
                  className={`flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4 ${fill !== null ? "h-full" : ""}`}
                >
                  {/* No heading of its own: the open agent names itself at the
                      top of its own tab, and "Agent dashboard" above that said
                      the same thing twice. */}
                  {claimed === 0 && (
                    <header className="flex flex-wrap items-center justify-end gap-3 px-1">
                      {controls}
                    </header>
                  )}

                  {/* The ONLY thing that scrolls when the split is sized to the
                      window. Inside the card's padding, so the frame does not
                      move, and the tab's title row pins at its top (`sticky`
                      on the row itself) with the refresh and close controls. */}
                  <div
                    data-panel-scroll
                    className={fill !== null ? "min-h-0 flex-1 overflow-y-auto overscroll-contain" : ""}
                  >
                  {hasContent ? (
                    <>
                      {/* A failed REFRESH keeps the figures it had: they are
                          still the last true reading, and blanking them for a
                          blip would be worse than saying so. */}
                      {phase === "error" && (
                        <p role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
                          Couldn&rsquo;t refresh just now. These are the figures from the last
                          successful read.
                        </p>
                      )}
                      <DashboardSwap agentId={contentTab ?? shownTab}>{content}</DashboardSwap>
                    </>
                  ) : phase === "error" ? (
                    <div
                      role="alert"
                      className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-4"
                    >
                      <p className="text-sm text-ink">
                        Couldn&rsquo;t load this dashboard. Nothing about your agent changed.
                      </p>
                      <button
                        type="button"
                        onClick={() => void read(shownTab, "open")}
                        className="inline-flex min-h-9 items-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.96] motion-reduce:transform-none"
                      >
                        Try again
                      </button>
                    </div>
                  ) : (
                    <PanelLoading />
                  )}
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    </PanelClaimContext>
    </PanelControlsContext>
    </DashboardContext>
  );
}
