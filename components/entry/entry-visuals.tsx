/**
 * The entry screen's illustration: the floating analysis cards either side of
 * the form, the lines that tie them to it, and the "What happens next?" row.
 *
 * Decoration, not status. The cards show WHAT an analysis looks at; nothing
 * has been crawled yet when this screen is showing, so they carry no spinner,
 * tick or progress bar. `aria-hidden` for the same reason.
 *
 * Server Components with no motion of their own, so none of this ships JavaScript.
 */

import {
  CaretRight,
  ChartBar,
  ChatCircleDots,
  FileText,
  Gear,
  Globe,
  Lightbulb,
  MagnifyingGlass,
  Megaphone,
  Sparkle,
  StarFour,
  Target,
  TrendUp,
  UsersThree,
} from "@phosphor-icons/react/ssr";

type Icon = typeof Globe;

/* ---------- the floating cards ---------- */

function AnalysisCard({ icon: IconFor, title, note }: { icon: Icon; title: string; note: string }) {
  return (
    <div className="flex h-[4.75rem] w-full items-center gap-3.5 rounded-lg bg-surface/90 px-4 shadow-[0_22px_48px_-28px_rgb(12_21_63/0.35)] backdrop-blur">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft/60 text-accent-vivid">
        <IconFor className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-ink-soft">{note}</p>
      </div>
    </div>
  );
}

/*
 * Card geometry the connectors are drawn against, in viewBox units of 1/16 rem:
 * each card is 76 tall with a 24 gap, so the centres sit at 38, 138 and 238
 * inside a 276 column. The page's root font-size scales (14-16px), so the SVG
 * is sized in rem (`h-[17.25rem] w-[4.5rem]`) to scale with the cards. Keep
 * `h-[4.75rem]`, `gap-6` and those two sizes in step with these numbers.
 */
const CONNECTOR_WIDTH = 72;
const CARD_CENTRES = [38, 138, 238] as const;
const MEETING_Y = 138;

/** One line per card, from the card's inner edge, all ending at one shared point. */
function Converge({ side }: { side: "left" | "right" }) {
  const mid = CONNECTOR_WIDTH / 2;
  return (
    <svg
      viewBox={`0 0 ${CONNECTOR_WIDTH} 276`}
      className={`pointer-events-none absolute top-0 h-[17.25rem] w-[4.5rem] overflow-visible ${side === "left" ? "left-full" : "right-full -scale-x-100"}`}
    >
      {CARD_CENTRES.map((y) => (
        <g key={y}>
          <path
            d={y === MEETING_Y ? `M 0 ${y} H ${CONNECTOR_WIDTH}` : `M 0 ${y} C ${mid} ${y}, ${mid} ${MEETING_Y}, ${CONNECTOR_WIDTH} ${MEETING_Y}`}
            fill="none"
            className="stroke-accent-vivid/35"
            strokeWidth="1.25"
          />
          <circle cx="0" cy={y} r="4" className="fill-surface stroke-accent-vivid/50" strokeWidth="1.25" />
        </g>
      ))}
      <circle cx={CONNECTOR_WIDTH} cy={MEETING_Y} r="5" className="fill-accent-vivid/70" />
    </svg>
  );
}

/** Left of the form. Only on screens wide enough to hold both columns. */
export function LeftCards() {
  return (
    <div aria-hidden="true" className="absolute left-[4%] top-8 hidden w-[19.5rem] flex-col gap-6 min-[1500px]:flex">
      <AnalysisCard icon={Globe} title="Website Structure" note="Maps how your site is built" />
      <AnalysisCard icon={FileText} title="Content Analysis" note="Reviews what your pages say" />
      <AnalysisCard icon={MagnifyingGlass} title="SEO Signals" note="Finds ranking opportunities" />
      <Converge side="left" />
    </div>
  );
}

/** Right of the form, mirrored. */
export function RightCards() {
  return (
    <div aria-hidden="true" className="absolute right-[4%] top-8 hidden w-[19.5rem] flex-col gap-6 min-[1500px]:flex">
      <AnalysisCard icon={UsersThree} title="Competitor Analysis" note="Compares you with competitors" />
      <AnalysisCard icon={Sparkle} title="AI Visibility" note="Checks your AI search presence" />
      <AnalysisCard icon={Lightbulb} title="Growth Opportunities" note="Highlights where you can grow" />
      <Converge side="right" />
    </div>
  );
}

/** The four-point star, top right. */
export function CornerSparkle() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute right-[5.5%] top-4 hidden lg:block">
      <StarFour weight="regular" className="size-9 text-accent-vivid" />
      {/* The dotted field beside it. */}
      <span className="absolute left-8 top-10 block h-24 w-10 bg-[radial-gradient(circle,var(--color-border)_1.2px,transparent_1.3px)] bg-[length:10px_10px]" />
    </div>
  );
}

/* ---------- what happens next ---------- */

const STEPS: { label: string; icon: Icon; tone: string }[] = [
  { label: "Strategy", icon: Target, tone: "bg-accent-soft/70 text-accent-vivid" },
  { label: "SEO", icon: MagnifyingGlass, tone: "bg-good-soft/70 text-good" },
  { label: "GEO / AIO", icon: Sparkle, tone: "bg-violet-soft text-violet" },
  { label: "Social Media", icon: ChatCircleDots, tone: "bg-crit-soft/70 text-crit" },
  { label: "Ads", icon: Megaphone, tone: "bg-info-soft/80 text-info" },
  { label: "Automation", icon: Gear, tone: "bg-warn-soft/80 text-warn" },
  { label: "Monitoring", icon: ChartBar, tone: "bg-violet-soft text-violet" },
  { label: "Optimization", icon: TrendUp, tone: "bg-good-soft/70 text-good" },
];

export function WhatHappensNext() {
  return (
    <section aria-labelledby="whats-next" className="mx-auto w-full max-w-[1400px] px-6 pb-14 sm:px-10">
      <div className="flex items-center gap-5">
        <h2 id="whats-next" className="shrink-0 text-sm font-medium text-ink-soft">
          What happens next?
        </h2>
        <span aria-hidden="true" className="relative hidden h-px flex-1 bg-accent-soft sm:block">
          <span className="absolute -right-0.5 -top-[3px] size-[7px] rounded-full bg-accent-vivid/60" />
        </span>
      </div>
      <ol className="mt-8 grid grid-cols-2 gap-y-8 sm:grid-cols-4 lg:flex lg:items-start lg:justify-between">
        {STEPS.map(({ label, icon: IconFor, tone }, index) => (
          <li key={label} className="flex items-start lg:flex-1 lg:justify-between">
            <div className="flex w-full flex-col items-center gap-3 lg:w-auto">
              <span className={`flex size-14 items-center justify-center rounded-full ${tone}`}>
                <IconFor aria-hidden="true" className="size-7" />
              </span>
              <span className="text-[15px] text-ink">{label}</span>
            </div>
            {index < STEPS.length - 1 && (
              <CaretRight aria-hidden="true" className="mt-5 hidden size-4 shrink-0 text-border lg:mx-2 lg:block" />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

