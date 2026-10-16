"use client";

/**
 * The animated presentation layer for `/overview`.
 *
 * ## Why the whole body is one client component, not several islands
 *
 * Every other screen in this app keeps `"use client"` to the smallest piece
 * that genuinely needs it (see `components/analytics/timeline-bands.tsx`).
 * This screen is the one deliberate exception: the design calls for one
 * coordinated entrance — the hero, the priority strip, the two score rings
 * and the agents grid all settling into place in the same staggered
 * sequence — and splitting that across several small islands would mean
 * coordinating their timing from outside each of them, which is more
 * moving parts for the same visual result. Nothing here fetches its own
 * data: `app/(app)/overview/page.tsx` does every read and hands down one
 * plain object.
 *
 * Every number on this screen traces back to a real field on that object.
 * Where the requested design showed something this app cannot measure yet
 * (pages indexed in AI engines, branded-query counts, competitor-mention
 * counts, a B2C/B2B badge, a target-audience line, a synthesized value
 * proposition, a "N of M completed" tracker), it is not here — showing a
 * number with no source is worse than not showing one at all.
 */

import { webHref } from "@/lib/data/profile-display";
import Link from "@/components/ui/app-link";
import { MagneticLink } from "@/components/ui/magnetic-link";
import {
  ArrowRight,
  ArrowUpRight,
  CaretRight,
  ChartBar,
  ChartLineUp,
  ChatCircleDots,
  Check,
  FileText,
  Globe,
  Info,
  Lightning,
  MagnifyingGlass,
  PencilSimple,
  Robot,
  Sparkle,
  SquaresFour,
  UsersThree,
  Warning,
  WarningCircle,
  Wrench,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, Ref } from "react";
import { FIRST_SECTION_ID, type ActionKind, type Opportunity } from "@/lib/data/overview-summary";
import type { AgentStatus } from "@/lib/data/types";
import { useHydrated } from "@/lib/use-hydrated";
import { ScrollStack, type ScrollStackItem } from "@/components/ui/scroll-stack";

export type ScoreTone = "neutral" | "good" | "warn" | "crit";

export interface OverviewDashboardData {
  business: {
    name: string;
    websiteHref: string | null;
    websiteLabel: string | null;
    tags: string[];
    /** The extracted brand logo URL, or null — a monogram stands in. */
    logo: string | null;
    description: string | null;
    /** One clean sentence from the description, or null (`summarySentence`). */
    summary: string | null;
    headline: string | null;
    industry: string | null;
  };
  audit: {
    score: number | null;
    tone: ScoreTone;
    totalIssues: number;
    pagesCrawled: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    analysedAt: string | null;
  } | null;
  geo: {
    score: number | null;
    tone: ScoreTone;
    aiBotsAllowed: number | null;
    aiBotsTotal: number | null;
    totalIssues: number | null;
    subScoreLabel: string | null;
    subScoreValue: number | null;
  } | null;
  ads: {
    state: "not-connected" | "no-conversions" | "available";
    conversions: number;
    cpa: string | null;
  };
  agents: {
    needsSetup: number;
    /** Every agent offered — the number on the Agents tab. */
    total: number;
    tiles: { id: string; name: string; description: string; status: AgentStatus }[];
    moreCount: number;
  };
  actions: {
    title: string;
    reason: string;
    href: string;
    cta: string;
    kind: ActionKind;
  }[];
  openCount: number;
  opportunities: Opportunity[];
}

const KIND_STYLE: Record<
  ActionKind,
  { icon: IconKind; solidBg: string; soft: string; badge: string }
> = {
  critical: { icon: "critical", solidBg: "bg-crit", soft: "bg-crit-soft", badge: "Critical" },
  ads: { icon: "ads", solidBg: "bg-warn", soft: "bg-warn-soft", badge: "Needs setup" },
  seo: { icon: "seo", solidBg: "bg-accent", soft: "bg-accent-soft", badge: "Needs setup" },
  generic: { icon: "generic", solidBg: "bg-info", soft: "bg-info-soft", badge: "Needs setup" },
};

const AGENT_STATUS_TONE: Record<AgentStatus, PillTone> = {
  ready: "good",
  // Grey, not red: an agent nobody has set up yet is waiting, not failing.
  // Nine red pills read as nine errors (2026-10-13).
  "needs-setup": "neutral",
  blocked: "warn",
  recommended: "info",
};

/**
 * Has the entrance animation already played in this document?
 *
 * Module scope, deliberately: a client-side navigation back to `/overview`
 * remounts this component but reuses the same module instance, so the flag
 * survives exactly as long as it should. A full reload gets a fresh module
 * and a fresh entrance, which is right — that IS a first visit.
 *
 * Why gate it at all: an animation review (2026-09-20) flagged this as the
 * screen's worst motion problem. `/overview` is the home tab, opened tens of
 * times a day, and replaying a staggered entrance on a screen the router
 * cache has already made instant costs the reader time on every single
 * return. First visit earns delight; the twentieth does not.
 */
/**
 * The anchor the welcome band's scroll cue points at, and the id on the first
 * stacked card. One constant so the link and its target cannot drift.
 */

let entranceHasPlayed = false;

/** `"reveal-up"` on the first mount of a document, `""` after that. */
function useEntranceClass(): string {
  const [play] = useState(() => !entranceHasPlayed);
  useEffect(() => {
    entranceHasPlayed = true;
  }, []);
  return play ? "reveal-up" : "";
}

/**
 * Reveals an element the first time it scrolls into view, then stops watching
 * it. Returns the ref to attach and whether it has been seen.
 *
 * Why not Motion's `whileInView`: predetermined motion belongs in CSS in this
 * codebase — see the lane-wipe note in `globals.css`, where Motion silently
 * overwrote `transform-origin` on the element it was animating. A CSS
 * transition is also interruptible, so a card scrolled half in and back out
 * stops rather than snapping.
 *
 * It fires ONCE and never reverses. Scrolling is a high-frequency
 * interaction; re-revealing on every pass is the thing that makes scroll
 * animation feel cheap, and it is the same objection the entrance gate above
 * answers. `enabled` is false on a return visit, and then this resolves to
 * "already shown" on the first render with no observer created at all.
 */
function useRevealOnView(enabled: boolean) {
  const ref = useRef<HTMLElement | null>(null);
  // Starts SHOWN, so the server-rendered markup is readable with no
  // JavaScript at all. The hidden state is applied by the effect below, and
  // only to a card that is genuinely off-screen — see the note in
  // `globals.css` on why the default is not `opacity: 0`.
  const [state, setState] = useState<"shown" | "pending">("shown");

  useEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") return;

    // A card already on screen must not blink out and fade back in, so one
    // below the trigger line is the only kind that gets armed.
    //
    // `height > 0` guards a race: this effect runs immediately after mount,
    // and the page body arrives behind a Suspense boundary, so the rect can
    // still be all zeros — and a zero `top` reads as "already in view",
    // which silently disabled the reveal. When the element has no layout yet,
    // arm it and let the observer decide; it reports the current state on its
    // first callback, so a card that turns out to be visible reveals at once.
    const rect = node.getBoundingClientRect();
    if (rect.height > 0 && rect.top < window.innerHeight - 80) return;

    setState("pending");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setState("shown");
            observer.disconnect();
          }
        }
      },
      // Fire as the card's TOP EDGE crosses a line 80px above the fold, so
      // the reveal runs while the card is sliding into view rather than after
      // it has arrived. The first version used `threshold: 0.15` with the
      // bottom pulled up 10%, which on an 872px viewport meant the card was
      // already ~130px on screen before it began — so on any brisk scroll it
      // finished below where the eye was and looked like nothing happened.
      { threshold: 0, rootMargin: "0px 0px -80px 0px" },
    );
    observer.observe(node);

    // Last resort, and deliberately far longer than any plausible read.
    // If the observer never reports — a detached node, a scroll container it
    // cannot see, a browser quirk — the card must not stay hidden. Content
    // outlives the animation.
    //
    // It was 2s, which was its own bug: anyone who paused on the hero for a
    // couple of seconds would have the cards below reveal themselves
    // unwatched, which is the exact failure this whole change set out to fix.
    // 10s is past the point where a stuck card is a real fault rather than a
    // slow reader.
    const failsafe = window.setTimeout(() => setState("shown"), 10_000);

    return () => {
      observer.disconnect();
      window.clearTimeout(failsafe);
    };
  }, [enabled]);

  return { ref, state };
}

/**
 * One agent tile, revealing itself as it scrolls into view.
 *
 * It owns its own `useRevealOnView` because the tiles are rendered from a
 * `.map()` in the parent, and a hook cannot be called inside one. That is
 * also why this is a component rather than a loop variable.
 */
function AgentTile({
  tile,
  index,
}: {
  tile: OverviewDashboardData["agents"]["tiles"][number];
  index: number;
}) {
  const reveal = useRevealOnView(true);
  return (
    <Link
      {...revealProps(reveal, index * 60)}
      href={`/agents/${tile.id}`}
      className="reveal-on-view flex flex-col gap-1 rounded-lg border border-border bg-surface-raised p-3.5 transition-colors hover:bg-border/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
    >
      <span className="text-sm font-medium text-ink">{tile.name}</span>
      <span className="text-xs text-ink-soft">{tile.description}</span>
      <StatusPill tone={AGENT_STATUS_TONE[tile.status]} dot live={tile.status === "ready"}>
        {agentStatusText(tile.status)}
      </StatusPill>
    </Link>
  );
}

/** The "+N more" tile, revealing after the tiles it follows. */
function MoreAgentsTile({ index, children }: { index: number; children: React.ReactNode }) {
  const reveal = useRevealOnView(true);
  return (
    <Link
      {...revealProps(reveal, index * 60)}
      href="/agents"
      className="reveal-on-view flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border p-3.5 text-center transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
    >
      {children}
    </Link>
  );
}

/**
 * The three props every scroll-revealed card needs, so a call site cannot
 * attach the ref and forget the attribute the CSS actually keys on.
 */
function revealProps(
  reveal: { ref: React.MutableRefObject<HTMLElement | null>; state: "shown" | "pending" },
  delayMs: number,
) {
  return {
    ref: reveal.ref as Ref<never>,
    "data-inview": reveal.state === "pending" ? "pending" : "true",
    style: {
      // `--delay` is a TIME, read by the triggered fallback.
      "--delay": `${delayMs}ms`,
      // `--range-end` is a SCROLL DISTANCE, read by the scroll-driven path:
      // how far through this card's entry into the viewport its reveal
      // finishes. A later end means the card lags the one beside it, which
      // is how a row staggers when the clock is the scrollbar rather than a
      // timer. Derived from the same index so the two paths agree on order.
      // Widened from 40%: this is the scroll-driven twin of the 0.7s
      // transition above, and the two have to feel like one animation.
      // A short range is a FAST animation when the scrollbar is the
      // clock, however gentle the easing looks.
      "--range-end": `${62 + Math.round(delayMs / 6)}%`,
    } as CSSProperties,
  };
}

/**
 * True when the visitor has asked their OS for reduced motion. Read once on
 * mount rather than at module scope: this component renders on the server
 * first, where `matchMedia` does not exist, and a value read during render
 * would differ between the two passes and break hydration.
 */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

type IconKind = "critical" | "ads" | "seo" | "generic" | "search" | "spark" | "chart" | "users" | "globe" | "check";

/**
 * The icon set, from Phosphor.
 *
 * These were ten hand-rolled inline SVG paths. Phosphor is a real icon
 * family, so the set is optically consistent — stroke weight, corner radius
 * and optical size agree across every glyph, which hand-drawn paths never
 * quite do once there are ten of them.
 *
 * One weight for the whole app, `regular`, and one size, 18. Mixing weights
 * is the thing that makes an icon set look assembled rather than chosen.
 */
const ICONS: Record<IconKind, PhosphorIcon> = {
  critical: WarningCircle,
  ads: ArrowUpRight,
  seo: SquaresFour,
  generic: Globe,
  search: MagnifyingGlass,
  spark: Sparkle,
  chart: ChartLineUp,
  users: UsersThree,
  globe: Globe,
  check: Check,
};

function Icon({ kind }: { kind: IconKind }) {
  const Glyph = ICONS[kind];
  return <Glyph size={18} weight="regular" aria-hidden="true" />;
}

/** A section header's icon, in its own small soft-coloured circle. */
function IconChip({ kind, tone }: { kind: IconKind; tone: "crit" | "accent" | "info" }) {
  const classes = {
    crit: "bg-crit-soft text-crit",
    accent: "bg-accent-soft text-accent",
    info: "bg-info-soft text-info",
  }[tone];
  return (
    <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${classes}`}>
      <Icon kind={kind} />
    </span>
  );
}

const TONE_TEXT: Record<ScoreTone, string> = {
  good: "text-good",
  warn: "text-warn",
  crit: "text-crit",
  neutral: "text-ink-soft",
};

/**
 * A single 0-100 score, animated. No `ScoreRing`/`ProgressRing` exists
 * elsewhere in this app to reuse — the horizontal bars on the audit and GEO
 * pages are the established pattern for a real percentage, but the design
 * here asked for a ring specifically, so this is new.
 *
 * `value === null` renders "Not scored yet" rather than an animated zero —
 * the same rule `Measure` on the previous version of this page already
 * followed: a score the backend never computed is not a bad score, and a
 * ring filled to zero says otherwise.
 */
function ScoreRing({
  value,
  tone,
  label,
  animateIn,
}: {
  value: number | null;
  tone: ScoreTone;
  label: string;
  /** False on a return visit, so the arc is simply drawn at its value. */
  animateIn: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  // The arc is drawn empty on the first paint and filled one frame later, so
  // the CSS transition has two values to move between. Painting the final
  // offset straight away leaves nothing to transition FROM, which is why an
  // earlier version of this ring appeared full instantly.
  //
  // The figure in the middle no longer counts up. It was a 900ms
  // requestAnimationFrame loop on the main thread during hydration, animating
  // the same number this arc already reports — two animations for one value,
  // and the cheaper one is the arc. (Animation review, 2026-09-20.)
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const percentage = value == null ? 0 : Math.max(0, Math.min(100, value));
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  const shown = filled || reduced || !animateIn ? percentage : 0;
  const offset = circumference - (shown / 100) * circumference;

  return (
    <div
      className="relative flex size-36 shrink-0 items-center justify-center"
      aria-label={`${label}: ${value == null ? "not scored yet" : `${value} out of 100`}`}
    >
      <svg viewBox="0 0 144 144" className="size-36 -rotate-90">
        <circle cx="72" cy="72" r={radius} className="fill-none stroke-surface-raised" strokeWidth="10" />
        {value != null && (
          <circle
            cx="72"
            cy="72"
            r={radius}
            strokeWidth="10"
            strokeLinecap="round"
            className={`fill-none transition-[stroke-dashoffset] duration-[250ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${TONE_TEXT[tone]}`}
            stroke="currentColor"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        )}
      </svg>
      <div className="absolute flex flex-col items-center">
        {value == null ? (
          <span className="text-sm text-ink-soft">Not scored yet</span>
        ) : (
          <>
            <span className={`text-3xl font-bold tabular-nums ${TONE_TEXT[tone]}`}>{value}</span>
            <span className="text-xs text-ink-soft">/ 100</span>
          </>
        )}
      </div>
    </div>
  );
}

type PillTone = "crit" | "warn" | "good" | "info" | "accent" | "neutral";

const PILL_TONE: Record<PillTone, { pill: string; dot: string }> = {
  crit: { pill: "bg-crit-soft text-crit", dot: "bg-crit" },
  warn: { pill: "bg-warn-soft text-warn", dot: "bg-warn" },
  good: { pill: "bg-good-soft text-good", dot: "bg-good" },
  info: { pill: "bg-info-soft text-info", dot: "bg-info" },
  accent: { pill: "bg-accent-soft text-accent", dot: "bg-accent" },
  neutral: { pill: "bg-surface-raised text-ink-soft", dot: "bg-ink-soft/60" },
};

/**
 * A status pill in SENTENCE case, local to this screen.
 *
 * `components/ui/badge.tsx` is the app's shared pill and is `uppercase`
 * everywhere it appears. The approved design for this page shows sentence
 * case throughout ("Critical", "Needs setup", "Not started"), and
 * `CLAUDE.md` already records the intention to drop those 10px caps —
 * so this page is built the way the design asks rather than changing a
 * shared component every other screen renders. `dot` adds the small
 * coloured marker the design puts beside an agent's status, which is also
 * what keeps the status from resting on colour alone.
 */
function StatusPill({
  tone,
  dot = false,
  live = false,
  children,
}: {
  tone: PillTone;
  dot?: boolean;
  /** Pulse the dot. Only for a state that means something is actually running. */
  live?: boolean;
  children: React.ReactNode;
}) {
  const style = PILL_TONE[tone];
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.pill}`}
    >
      {dot && (
        <span
          className={`size-1.5 shrink-0 rounded-full ${style.dot} ${live ? "status-breathe" : ""}`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

/**
 * One priority action as a row: what kind of problem, what to do, why, and
 * the one button. The first row is the one to start with, so it is tinted
 * and says so; the list is already in priority order (`buildActions`).
 */
function PriorityRow({
  action,
  index,
  entrance,
}: {
  action: OverviewDashboardData["actions"][number];
  index: number;
  /** `"reveal-up"` on a first visit, `""` on a return. */
  entrance: string;
}) {
  const style = KIND_STYLE[action.kind];
  const first = index === 0;
  return (
    <li
      className={`${entrance} flex flex-col gap-4 rounded-lg p-4 sm:flex-row sm:items-center ${
        first ? style.soft : "border border-border bg-surface"
      }`}
      style={{ "--delay": `${index * 60}ms` } as CSSProperties}
    >
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-white ${style.solidBg}`}>
        <Icon kind={style.icon} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={action.kind === "critical" ? "crit" : "warn"}>{style.badge}</StatusPill>
          {first && <span className="text-xs font-semibold text-ink">Start here</span>}
        </div>
        <h3 className="mt-1.5 text-base font-bold leading-snug tracking-tight text-ink">{action.title}</h3>
        <p className="mt-0.5 text-sm text-ink-soft">{action.reason}</p>
      </div>
      {/* Magnetic: the one control on this screen worth the physics, because
          it is the thing the whole row is asking you to press. See
          `magnetic-link.tsx` for why the springs live outside React. */}
      <MagneticLink
        href={action.href}
        className={`inline-flex min-h-11 shrink-0 items-center gap-1 self-start whitespace-nowrap rounded-md px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none sm:self-center ${style.solidBg}`}
      >
        {action.cta} <span aria-hidden="true">→</span>
      </MagneticLink>
    </li>
  );
}

export function OverviewDashboard({
  data,
  hero,
}: {
  data: OverviewDashboardData;
  /** The opening text, rendered on the server. It scrolls away above the stack. */
  hero?: React.ReactNode;
}) {
  const topActions = useMemo(() => data.actions.slice(0, 3), [data.actions]);
  // Empty string on every visit after the first in this document — see
  // `useEntranceClass`. The sections keep their `--delay` either way; with no
  // animation attached it is inert.
  const entrance = useEntranceClass();
  // One per below-fold card. Top level, never in a loop or a conditional.
  //
  // These are NOT gated to the first visit, unlike the mount entrance above,
  // and the difference is deliberate. The mount entrance costs the reader on
  // arrival whether they wanted it or not, which is why it plays once per
  // document. A scroll reveal only happens if you scroll, fires once per card
  // per visit, and is the thing that makes the lower half of this screen feel
  // authored rather than dumped. Gating both made the feature effectively
  // invisible — the second scroll of a session showed nothing at all.

  /*
   * The four rows are a card-by-card scroll stack, the same mechanism the
   * Business profile uses: each row pins under the header and the next rises
   * up over it. Asked for directly, 2026-09-22.
   *
   * The rows keep their own internal layout — the figures stay a three-up row
   * and the agents block stays two-up — so what stacks is the ROW and the
   * comparison inside each one survives.
   *
   * `dwell` is how far the page scrolls with a row pinned, and it is ALSO the
   * blank space you see under that row before the next one starts rising. It
   * was 36vh, which at a 1050px window is nearly 400px of empty canvas under
   * a short row — reported as "a lot and lot of space" on 2026-09-23.
   *
   * A few rem instead (fixed, not vh — a vh gap is a bigger hole on exactly
   * the short laptop windows that can least afford it): a normal gap between two cards rather than a
   * hole. Cutting it does not make the transition abrupt, which is the part
   * that is easy to get wrong here — the next card rises over a FULL VIEWPORT
   * of scroll whatever this is set to (see `enterFrom` in
   * `scroll-stack.tsx`). The dwell only controls how long a row sits pinned
   * and whole before the next one starts covering it. Same rise, same fade,
   * far less dead canvas.
   *
   * The LAST one is the exception, and it is longer rather than shorter. Its
   * landing point sits below the fold like every other row's, but there is
   * nothing after it to scroll through, so with a short dwell the page simply
   * runs out before that row reaches the pin: it stops halfway up with dead
   * canvas above it and the header floating over nothing. Reported on
   * 2026-09-23 as "the last card is not coming completely up".
   *
   * The dwell is the page height that lets it finish the climb. The space it
   * buys ends up BELOW the last row, which is where empty space at the end of
   * a document belongs, rather than above it.
   */
  const rows: ScrollStackItem[] = [
    /*
     * Priority actions, straight from `buildActions()` — unchanged logic,
     * one row per action. Each row keeps its kind's solid icon circle and
     * button colour; the first row also takes the kind's soft tint.
     *
     * There is no "Priority status" summary panel beside these, although
     * the approved design showed one. It was built and then removed on
     * 2026-09-20: every row it held restated a card sitting inches to its
     * left — the badge word ("Critical", "Needs setup") is on the card,
     * and its "next step" ("Review", "Connect account", "Configure
     * agent") is the card's own button. "0 of 3 done" was the only line
     * that was not a duplicate, and the heading above already says how
     * many things need attention. Reinstating it means finding something
     * for it to say that a card cannot.
     */
    {
      key: "priority",
      // First: what to do next is what a customer opens this page for, and
      // it sat fourth, under two large report cards (2026-10-13).
      id: FIRST_SECTION_ID,
      dwell: "4rem",
      content: (
        /*
         * Redesigned 2026-09-28. It was a dark band with up to three tall
         * cards in a fixed three-column grid, so two actions left a third of
         * the band empty, and the band was the one dark block on a page of
         * white cards. Now it is a white card like its neighbours: the count
         * and what it means on the left, the actions as a numbered list on
         * the right. A list has no empty columns at any count, and it reads
         * top to bottom in the order to do things.
         */
        <section
          className={`${entrance} grid gap-6 rounded-lg border border-border bg-surface p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-10`}
          style={{ "--delay": "60ms" } as CSSProperties}
        >
          <div>
            <h2 className="text-sm font-semibold text-accent-ink">Priority actions</h2>
            {data.openCount === 0 ? (
              <p className="mt-2 text-2xl font-bold tracking-tight text-ink">Nothing needs your attention</p>
            ) : (
              <p className="mt-2 flex items-baseline gap-3 text-ink">
                <span className="text-6xl font-bold leading-none tabular-nums tracking-tight">{data.openCount}</span>
                <span className="text-xl font-bold leading-tight tracking-tight">
                  {data.openCount === 1 ? "thing needs" : "things need"}
                  <br />
                  your attention
                </span>
              </p>
            )}
            <p className="mt-3 max-w-prose text-sm text-ink-soft">
              {data.openCount === 0
                ? "Your site is analysed, your accounts are connected and every agent has run."
                : "Worked out from your audit, your connected accounts and your agents, most urgent first."}
            </p>
          </div>

          {topActions.length > 0 ? (
            <ol className="flex flex-col gap-3" aria-label="Priority actions">
              {topActions.map((action, index) => (
                <PriorityRow key={action.title} action={action} index={index} entrance={entrance} />
              ))}
            </ol>
          ) : (
            <div className="flex items-center gap-4 rounded-lg bg-good-soft p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-good text-white">
                <Icon kind="check" />
              </span>
              <p className="text-sm font-semibold text-good">You&apos;re all caught up.</p>
            </div>
          )}
        </section>
      ),
    },
    /*
     * Website audit + AI visibility. Cost per conversion was a third card
     * here; it is a performance figure and lives on Performance only
     * (removed from the Summary on 2026-10-12).
     */
    /*
     * The cards still reveal individually (`.reveal-on-view`), which is
     * what they did when this row started below the fold. They are above
     * it now, so the reveal fires almost immediately on load rather than
     * on arrival, and that is the intent: three figures settling in
     * sequence reads as the screen reporting, not as a page still
     * loading.
     */
    /*
     * Two equal columns (design given 2026-10-09): each card now carries a
     * headline, a severity list or drawing, a tile row and a call to action,
     * which does not fit a third of the page. The call to action is
     * `mt-auto`, so both cards end level. One column below `lg`.
     */
    {
      key: "figures",
      dwell: "4rem",
      content: (
        <section className="grid gap-4 lg:grid-cols-2">
          {/* No per-card fade on this row. The stack already carries it up
              over the welcome band, and these cards are tall enough that a
              fade tied to their own entry left them see-through for most of
              the climb, with the band's text showing through (2026-10-09). */}
          <AuditCard audit={data.audit} animateIn={entrance !== ""} />
          <GeoCard geo={data.geo} animateIn={entrance !== ""} />

        </section>
      ),
    },
    /*
     * Your business: who this account is, from the real profile. Third, after
     * what to do and how the site is doing (2026-10-13).
     */
    {
      key: "business",
      dwell: "6rem",
      content: (
        <section
          className={`${entrance} overflow-hidden rounded-lg border border-border bg-surface`}
          // A beat behind the hero above it. At the same delay the two arrive
          // as one block popping rather than as a sequence.
          style={{ "--delay": "90ms" } as CSSProperties}
        >
          {/* The section's name, what it answers, and the one action that
              belongs to it. It carried a "01" while no other section had a
              number, and a spaced-capitals heading (2026-10-13). Edit goes to
              the real profile editor, not to a placeholder. */}
          <header className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
            <IconChip kind="globe" tone="accent" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold tracking-tight text-ink">Your business</h2>
              <p className="text-sm text-ink-soft">What we understand from your website.</p>
            </div>
            <Link
              href="/overview/business-profile?edit=1"
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-border bg-surface px-3.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
            >
              <PencilSimple size={16} aria-hidden="true" />
              Edit
            </Link>
          </header>

          {/* One row on a wide screen — identity, what they do, key
              opportunities and the scan card side by side, not stacked. The
              description is clamped to two lines here on purpose: this is a
              glance, and the full text (routinely 700+ characters of crawled
              prose) already has a reading surface on Business profile. */}
          <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-center lg:gap-0 lg:divide-x lg:divide-border">
            <div className="lg:w-[27%] lg:shrink-0 lg:pr-8">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-good-soft px-2.5 py-1 text-xs font-semibold text-good">
                <span className="status-breathe size-1.5 rounded-full bg-good" aria-hidden="true" />
                Client identified
              </span>
              {/* Logo beside the name, as drawn. The extracted logo is often a
                  wordmark, so it sits inside the square on its own terms; a
                  monogram stands in until the crawl finds one.

                  A real logo sits on a LIGHT tile, as on Business profile: most
                  are drawn dark for a site's white header, and on the dark
                  tile they vanished (2026-10-09). The dark tile stays for the
                  monogram, whose white letter it was made for. */}
              <div className="mt-3 flex items-center gap-3">
                <span
                  className={`flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md p-2 ${
                    data.business.logo ? "border border-border bg-surface-raised" : "bg-ink"
                  }`}
                >
                  {data.business.logo ? (
                    // A crawled third-party URL: `next/image` would need every
                    // customer's domain allow-listed in config.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={webHref(data.business.logo)} alt="" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-2xl font-bold text-white" aria-hidden="true">
                      {data.business.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </span>
                <div className="min-w-0">
                  {/* `h3`: the section header above is this card's `h2`. */}
                  <h3 className="break-words text-2xl font-bold tracking-tight text-ink">{data.business.name}</h3>
                  {data.business.websiteHref && (
                    <a
                      href={data.business.websiteHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 rounded text-sm text-ink-soft hover:text-accent-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {data.business.websiteLabel}
                      <ArrowUpRight size={13} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
              {data.business.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {data.business.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-border bg-surface-raised px-2.5 py-1 text-xs font-medium text-ink"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* One clean sentence picked from the crawled text, never the raw
                text: that runs headings and menus together ("About Us We
                Build AI That Works…"). The full text is on Business profile. */}
            {(data.business.summary || data.business.headline) && (
              <div className="lg:w-[28%] lg:shrink-0 lg:px-8">
                <h3 className="text-lg font-bold tracking-tight text-ink">What you do</h3>
                <p className="mt-1.5 line-clamp-4 text-sm leading-relaxed text-ink-soft">
                  {data.business.summary ?? data.business.headline}
                </p>
                <Link
                  href="/overview/business-profile"
                  className="mt-3 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-accent-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  View full description
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
            )}

            <div className="lg:flex-1 lg:px-8">
              <h3 className="text-lg font-bold tracking-tight text-ink">Key opportunities</h3>
              <div className="mt-2 flex flex-col gap-2">
                {data.opportunities.length === 0 ? (
                  <p className="text-sm text-ink-soft">
                    Your first analysis will surface the highest-impact opportunities here.
                  </p>
                ) : (
                  data.opportunities.map((item) => (
                    <div key={item.label} className="flex items-center gap-2 text-sm" title={item.detail}>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                        <Icon kind={opportunityIcon(item.label)} />
                      </span>
                      <p className="font-medium text-ink">{item.label}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* The last column carries no divider in the design: the tinted
                card is its own edge. `lg:!border-l-0` cancels `divide-x`. */}
            <div className="lg:w-80 lg:shrink-0 lg:!border-l-0 lg:pl-4">
            <div className="flex items-start gap-3 rounded-lg border border-good/30 bg-good-soft/40 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-good text-white">
                <Icon kind={data.audit ? "check" : "search"} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">Website analysed</p>
                {data.audit ? (
                  <>
                    <p className="text-xs font-medium text-good">Analysis completed</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      {data.audit.pagesCrawled} {data.audit.pagesCrawled === 1 ? "page" : "pages"} crawled
                    </p>
                    {data.audit.analysedAt && (
                      <p className="text-xs text-ink-soft"><AnalysedAt iso={data.audit.analysedAt} /></p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-ink-soft">Analysis pending</p>
                )}
                <Link
                  href="/overview/website-audit"
                  className="mt-2 inline-block rounded-md border border-border px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
                >
                  View scan details →
                </Link>
              </div>
            </div>
            </div>
          </div>
        </section>
      ),
    },
    /*
     * Agents. "What we understand about you" sat beside them and repeated
     * the business section's description word for word; it went
     * (2026-10-13), and the agents have the full width.
     */
    /*
     * Also below the fold — same treatment as the section above.
     */
    {
      key: "agents",
      dwell: "12rem",
      content: (
        /*
         * One solid card at the full width. p-6 inside, wider than the usual
         * p-4 card, because it is a whole section of its own.
         */
        <section className="rounded-lg border border-border bg-surface p-6">
          <article
            // NOT revealed itself: its tiles are, individually. A revealing
            // parent holds its children at opacity 0 while their own observers
            // fire, so every tile would finish animating unseen inside a
            // transparent card and the group would fade in already settled —
            // the same "animation plays to an empty room" fault this whole
            // change set exists to fix. The frame arrives, then the tiles land
            // in it.
            className="flex flex-col"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <IconChip kind="users" tone="accent" />
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-ink">Agents</h2>
                  <p className="text-xs text-ink-soft">
                    {data.agents.needsSetup > 0
                      ? `${data.agents.needsSetup} of ${data.agents.total} need setup`
                      : "Every agent is set up and running."}
                  </p>
                </div>
              </div>
              <Link href="/agents" className="shrink-0 whitespace-nowrap rounded text-xs font-medium text-accent-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                All agents →
              </Link>
            </div>
            {/* Four across on wide screens: seven agents plus "+N more" is two
                full rows. */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {data.agents.tiles.map((tile, index) => (
                <AgentTile key={tile.id} tile={tile} index={index} />
              ))}
              {data.agents.moreCount > 0 && (
                <MoreAgentsTile index={data.agents.tiles.length}>
                  <span className="text-sm font-semibold text-ink">+{data.agents.moreCount} more</span>
                  <span className="text-xs text-accent-ink">View all agents →</span>
                </MoreAgentsTile>
              )}
            </div>
          </article>

        </section>
      ),
    },
  ];

  // The intro scrolls away first; then every card behaves the same — it pins
  // at one place under the header and the next slides up over it. As a
  // pinned "lead" behind the cards the intro made each card behave
  // differently: one faded it, the next half-faded it, the rest did not.
  return (
    <div className="flex flex-col gap-4">
      {hero}
      <ScrollStack items={rows} />
    </div>
  );
}

const AUDIT_HREF = "/overview/website-audit";
const GEO_HREF = "/overview/geo-analysis";

/** The pill link in a card's top-right corner. */
function CardPillLink({ href, tone, children }: { href: string; tone: "crit" | "accent"; children: React.ReactNode }) {
  const toneClasses =
    tone === "crit"
      ? "border-crit/40 text-crit hover:bg-crit-soft"
      : "border-accent/40 text-accent hover:bg-accent-soft";
  return (
    <Link
      href={href}
      className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border bg-surface px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${toneClasses}`}
    >
      {children}
      <ArrowRight size={14} weight="bold" aria-hidden="true" />
    </Link>
  );
}

/** A card's header: a gradient icon tile, the title and one line under it. */
function CardHeader({
  icon: Glyph,
  tile,
  title,
  subtitle,
  action,
}: {
  icon: PhosphorIcon;
  /** The tile's gradient and icon colour. */
  tile: string;
  title: string;
  subtitle: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className={`flex size-14 shrink-0 items-center justify-center rounded-lg shadow-sm ${tile}`} aria-hidden="true">
          <Glyph size={26} weight="bold" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight text-ink">{title}</h2>
          <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>
        </div>
      </div>
      {/* On a phone the pill moves under the card's figures instead; beside
          a wrapping title it squeezes the title to a word per line. */}
      <div className="hidden sm:block">{action}</div>
    </div>
  );
}

/** The full-width call to action at the foot of a card. */
function CardCta({
  href,
  icon: Glyph,
  title,
  subtitle,
  tone,
}: {
  href: string;
  icon: PhosphorIcon;
  title: string;
  subtitle: string;
  tone: "crit" | "accent";
}) {
  const bar =
    tone === "crit" ? "bg-linear-to-r from-crit to-crit/85" : "bg-linear-to-r from-accent-ink to-accent-vivid";
  return (
    <Link
      href={href}
      className={`group mt-auto flex items-center gap-4 rounded-lg px-4 py-3.5 text-white shadow-md transition-[filter,transform] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.99] motion-reduce:transform-none ${bar}`}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-white/15" aria-hidden="true">
        <Glyph size={22} weight="bold" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold leading-tight sm:text-lg">{title}</span>
        <span className="mt-0.5 block text-sm text-white/85">{subtitle}</span>
      </span>
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-white transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none ${
          tone === "crit" ? "text-crit" : "text-accent"
        }`}
        aria-hidden="true"
      >
        <ArrowRight size={18} weight="bold" />
      </span>
    </Link>
  );
}

type Severity = "critical" | "high" | "medium" | "low";

/**
 * How each severity is drawn. There is one amber token (`warn`), so High and
 * Medium share it and differ by how strong the tint is; the label says which.
 */
const SEVERITY_STYLE: Record<
  Severity,
  { name: string; tileLabel: string; tile: string; number: string; label: string; chip: string; icon: PhosphorIcon }
> = {
  critical: {
    name: "Critical",
    tileLabel: "Critical",
    tile: "bg-crit-soft/70",
    number: "text-crit",
    label: "text-crit",
    chip: "bg-crit-soft text-crit",
    icon: WarningCircle,
  },
  high: {
    name: "High",
    tileLabel: "High",
    tile: "bg-warn-soft/70",
    number: "text-warn",
    label: "text-ink-soft",
    chip: "bg-warn-soft text-warn",
    icon: Warning,
  },
  medium: {
    name: "Medium",
    tileLabel: "Medium",
    tile: "bg-warn-soft/35",
    number: "text-warn",
    label: "text-ink-soft",
    chip: "bg-surface-raised text-ink-soft",
    icon: Info,
  },
  low: {
    name: "Low",
    tileLabel: "Low",
    tile: "bg-info-soft/60",
    number: "text-info",
    label: "text-ink-soft",
    chip: "bg-surface-raised text-ink-soft",
    icon: Info,
  },
};

/** One severity as a tile in the row under the score. */
function SeverityTile({ severity, count }: { severity: Severity; count: number }) {
  const style = SEVERITY_STYLE[severity];
  // The warning mark only where the design puts one: the two that need action.
  const Glyph = severity === "critical" || severity === "high" ? style.icon : null;
  return (
    <Link
      href={AUDIT_HREF}
      className={`group flex items-start justify-between gap-2 rounded-lg px-4 py-3 transition-[filter] hover:brightness-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${style.tile}`}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={`text-3xl font-bold leading-none tabular-nums ${style.number}`}>{count}</span>
          {Glyph && (
            <span className={`flex size-6 items-center justify-center rounded-full ${style.chip}`} aria-hidden="true">
              <Glyph size={14} weight="fill" />
            </span>
          )}
        </span>
        <span className={`mt-1.5 block truncate text-sm ${style.label}`}>{style.tileLabel}</span>
      </span>
      <CaretRight
        size={16}
        weight="bold"
        className={`mt-1 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none ${style.number}`}
        aria-hidden="true"
      />
    </Link>
  );
}

/**
 * The headline beside the score, chosen from the real counts: the worst
 * severity that has anything in it. Never "critical" when there are none.
 */
function auditHeadline(audit: NonNullable<OverviewDashboardData["audit"]>): { title: string; body: string } {
  if (audit.criticalCount > 0) {
    return {
      title: "Your website has critical issues",
      body: "These issues can affect your traffic, rankings and conversions. It's best to fix them now.",
    };
  }
  if (audit.highCount > 0) {
    return {
      title: "Your website has high-priority issues",
      body: "Nothing critical, but these can still hold back your traffic and rankings.",
    };
  }
  if (audit.totalIssues > 0) {
    return {
      title: "Your website is in good shape",
      body: "Only smaller issues are left. Fixing them keeps your site ahead.",
    };
  }
  return { title: "No issues found", body: "The latest audit found nothing to fix." };
}

function AuditCard({
  audit,
  animateIn,
}: {
  audit: OverviewDashboardData["audit"];
  animateIn: boolean;
}) {
  const headline = audit ? auditHeadline(audit) : null;
  return (
    // `bg-surface` UNDER the tint: the tint fades to transparent, and on its
    // own it let the welcome band show through the card as it slid over.
    <article className="flex flex-col gap-5 rounded-lg border border-border bg-surface bg-linear-to-br from-crit-soft/50 via-transparent to-transparent p-5 shadow-sm sm:p-6"
    >
      <CardHeader
        icon={MagnifyingGlass}
        tile="bg-linear-to-br from-crit/70 to-crit text-white"
        title="Website audit"
        subtitle="Find and fix issues before they impact your business."
        action={
          <CardPillLink href={AUDIT_HREF} tone="crit">
            View full audit
          </CardPillLink>
        }
      />

      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <ScoreRing value={audit?.score ?? null} tone={audit?.tone ?? "neutral"} label="Website audit" animateIn={animateIn} />

        <div className="min-w-0 flex-1">
          {audit && headline ? (
            <>
              {audit.totalIssues > 0 && (
                <span className="inline-flex items-center gap-2 rounded-md bg-crit-soft px-3 py-1.5 text-sm font-bold text-crit">
                  <Warning size={18} weight="fill" aria-hidden="true" />
                  {audit.totalIssues} {audit.totalIssues === 1 ? "issue" : "issues"} across {audit.pagesCrawled}{" "}
                  {audit.pagesCrawled === 1 ? "page" : "pages"}
                </span>
              )}
              <h3 className="mt-3 text-lg font-bold leading-snug tracking-tight text-ink">{headline.title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{headline.body}</p>
            </>
          ) : (
            <p className="text-sm text-ink-soft">Run the website audit to populate this section.</p>
          )}
        </div>

      </div>

      {/* ONE set of counts. A severity list beside the headline repeated
          these four numbers (2026-10-13). And they are named for what they
          are: the main findings, which group the issue count above — "69
          issues" beside 2 + 2 + 0 + 0 read as figures that did not add up. */}
      {audit && (
        <div>
          <p className="mb-2 text-xs font-medium text-ink-soft">
            Main findings by severity{" "}
            <span className="tabular-nums">
              ({audit.criticalCount + audit.highCount + audit.mediumCount + audit.lowCount})
            </span>
          </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SeverityTile severity="critical" count={audit.criticalCount} />
          <SeverityTile severity="high" count={audit.highCount} />
          <SeverityTile severity="medium" count={audit.mediumCount} />
          <SeverityTile severity="low" count={audit.lowCount} />
        </div>
        </div>
      )}

      <div className="sm:hidden">
        <CardPillLink href={AUDIT_HREF} tone="crit">
          View full audit
        </CardPillLink>
      </div>

      {/* Only when there is something to fix: "Fix these issues now" under
          "No issues found" would ask for work that does not exist. */}
      {audit && audit.totalIssues > 0 && (
        <CardCta
          href={AUDIT_HREF}
          icon={Wrench}
          title="Fix these issues now"
          subtitle="Improve performance, SEO and user experience"
          tone="crit"
        />
      )}
    </article>
  );
}

/**
 * A word for the AI visibility score. The bands are ours, not the backend's,
 * and only a real score gets one: an unscored site is not "low".
 */
function geoVerdict(score: number | null): string | null {
  if (score == null) return null;
  // The product's bands (80 / 50), shared with the ring's colour and the GEO
  // page, so "moderate" never sits beside a green ring.
  if (score >= 80) return "strong";
  if (score >= 50) return "moderate";
  return "low";
}

/**
 * The drawing beside the verdict: three sources (pages, conversations, the
 * web) feeding one AI answer. Decorative only, so it carries no data and is
 * hidden from assistive tech. From xl only, for the same room reason as the
 * audit card's severity list.
 */
function AiSourcesArt() {
  const node =
    "absolute flex size-11 items-center justify-center rounded-full border border-accent-soft bg-surface shadow-md";
  return (
    <div className="relative hidden size-44 shrink-0 xl:block" aria-hidden="true">
      <svg viewBox="0 0 176 176" className="absolute inset-0 size-full text-accent" fill="none">
        <circle cx="120" cy="88" r="50" stroke="currentColor" strokeOpacity="0.2" strokeDasharray="2 5" />
        <circle cx="120" cy="88" r="38" stroke="currentColor" strokeOpacity="0.12" />
        <path d="M44 22 C 70 22, 66 80, 92 84" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.7" />
        <path d="M44 88 H 92" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.7" />
        <path d="M44 154 C 70 154, 66 96, 92 92" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.7" />
        <circle cx="120" cy="22" r="2.5" fill="currentColor" fillOpacity="0.6" />
        <circle cx="122" cy="154" r="2.5" fill="currentColor" fillOpacity="0.6" />
      </svg>
      <span className={`${node} left-0 top-0 text-accent`}>
        <FileText size={20} weight="fill" />
      </span>
      <span className={`${node} left-0 top-[66px] text-violet`}>
        <ChatCircleDots size={20} weight="fill" />
      </span>
      <span className={`${node} bottom-0 left-0 text-accent`}>
        <Globe size={20} weight="bold" />
      </span>
      <span className="absolute left-[92px] top-[60px] flex size-14 items-center justify-center rounded-full bg-linear-to-br from-accent-vivid to-accent text-white shadow-lg ring-8 ring-accent-soft/60">
        <Sparkle size={26} weight="fill" />
      </span>
    </div>
  );
}

/** One figure in the AI visibility row, with its icon. */
function GeoStatTile({ icon: Glyph, value, label }: { icon: PhosphorIcon; value: string; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-accent-soft/45 px-4 py-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent" aria-hidden="true">
        <Glyph size={22} weight="fill" />
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-bold leading-tight tabular-nums text-ink">{value}</span>
        <span className="block truncate text-sm text-ink-soft">{label}</span>
      </span>
    </div>
  );
}

type GeoStat = { icon: PhosphorIcon; value: string; label: string };

function GeoCard({
  geo,
  animateIn,
}: {
  geo: OverviewDashboardData["geo"];
  animateIn: boolean;
}) {
  const verdict = geoVerdict(geo?.score ?? null);
  // Each figure only when the backend sent it; the row closes up rather than
  // leaving a blank tile.
  const stats: GeoStat[] = [];
  if (geo?.aiBotsTotal != null) {
    stats.push({ icon: Robot, value: `${geo.aiBotsAllowed ?? 0}/${geo.aiBotsTotal}`, label: "AI crawlers allowed" });
  }
  // No "GEO issues" tile: the sentence above it already says the number, and
  // the two side by side read as the same figure twice (2026-10-13).
  if (geo?.subScoreValue != null && geo.subScoreLabel) {
    stats.push({ icon: Globe, value: String(geo.subScoreValue), label: geo.subScoreLabel });
  }
  const statColumns = ["", "", "sm:grid-cols-2", "sm:grid-cols-3"][stats.length] ?? "sm:grid-cols-3";

  return (
    <article className="flex flex-col gap-5 rounded-lg border border-border bg-surface bg-linear-to-br from-warn-soft/45 via-transparent to-transparent p-5 shadow-sm sm:p-6"
    >
      <CardHeader
        icon={Sparkle}
        tile="bg-linear-to-br from-warn-soft to-warn/35 text-warn"
        title="AI visibility"
        subtitle="Check how easily AI answer engines can find and quote your site."
        action={
          <CardPillLink href={GEO_HREF} tone="accent">
            View analysis
          </CardPillLink>
        }
      />

      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <ScoreRing value={geo?.score ?? null} tone={geo?.tone ?? "neutral"} label="AI visibility" animateIn={animateIn} />

        <div className="min-w-0 flex-1 rounded-lg bg-warn-soft/45 p-4">
          {verdict ? (
            <p className="flex items-center gap-3 text-base font-bold text-warn">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-warn-soft" aria-hidden="true">
                <ChartBar size={20} weight="fill" />
              </span>
              Your AI visibility is {verdict}
            </p>
          ) : (
            <p className="text-base font-bold text-ink">Not scored yet</p>
          )}
          <p className="mt-2 text-sm text-ink-soft">
            {geo?.totalIssues != null && geo.totalIssues > 0
              ? `There ${geo.totalIssues === 1 ? "is 1 GEO issue" : `are ${geo.totalIssues} GEO issues`} limiting your visibility. Optimize now to get more AI mentions and traffic.`
              : "How well AI answer engines can read and quote your site."}
          </p>
        </div>

        <AiSourcesArt />
      </div>

      {stats.length > 0 && (
        <div className={`grid gap-2 ${statColumns}`}>
          {stats.map((stat) => (
            <GeoStatTile key={stat.label} icon={stat.icon} value={stat.value} label={stat.label} />
          ))}
        </div>
      )}

      <div className="sm:hidden">
        <CardPillLink href={GEO_HREF} tone="accent">
          View analysis
        </CardPillLink>
      </div>

      {geo && (
        <CardCta
          href={GEO_HREF}
          icon={Lightning}
          title="Improve your AI visibility"
          subtitle="Get more mentions in ChatGPT, Gemini and Google AI"
          tone="accent"
        />
      )}
    </article>
  );
}

/**
 * A meaningful icon per opportunity, matched on the exact labels
 * `buildOpportunities` (`lib/data/overview-summary.ts`) produces. Falls back
 * to a generic spark for any label that module doesn't emit yet, rather than
 * throwing — the two are meant to stay in sync, not coupled by a shared type.
 */
function opportunityIcon(label: string): IconKind {
  if (label.includes("AI search")) return "spark";
  if (label.includes("SEO")) return "seo";
  if (label.includes("paid channels")) return "ads";
  if (label.includes("AI agents")) return "users";
  return "spark";
}

function agentStatusText(status: AgentStatus): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "blocked":
      return "Blocked";
    case "recommended":
      return "Recommended";
    default:
      return "Not started";
  }
}

/**
 * "Last analysed", formatted the way `website-audit/page.tsx` already does
 * for the same field, plus a time-of-day if the ISO string actually carries
 * one (a bare date parses to local midnight, which this treats as "no time
 * to show" rather than printing a fake 12:00 AM).
 */
function AnalysedAt({ iso }: { iso: string }) {
  // The time of day is the viewer's own: printed only once the browser
  // renders, so the server's UTC and the browser's zone never disagree
  // mid-hydration (audit, 2026-09-29).
  return <>{formatAnalysedAt(iso, useHydrated())}</>;
}

function formatAnalysedAt(iso: string, withTime: boolean): string {
  const date = new Date(iso);
  const hasTime = date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0;
  const dateText = withTime
    ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  if (!hasTime || !withTime) return dateText;
  // The locale is pinned for the same reason `lib/format.ts` pins it: this is a
  // client component, so an unpinned locale is formatted with Node's on the
  // server and the viewer's in the browser, and React re-renders the subtree on
  // the mismatch. `en-GB` matches the date beside it.
  const timeText = date.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
  return `${dateText}, ${timeText}`;
}
