import { ChartBar, FileText, Sparkle } from "@phosphor-icons/react/ssr";
import { formatCount } from "@/lib/format";
import type { HeroStat } from "@/lib/data/overview-summary";
import { NextStep } from "@/components/ui/next-step";

/**
 * The Business overview's opening text, built to the approved design
 * (2026-09-23). It has no picture of its own: it sits on the app's animated
 * background (`app-background.tsx`). A picture band of its own was tried first
 * and read as a second image laid over the first. Since 2026-10-09 it sits
 * on the same frosted panel as every other page (`PageContainer`), because
 * over the busier parts of the footage the text was hard to read.
 *
 * ## What the design asked for that is NOT here, and why
 *
 * - **"4 insights ready".** Nothing anywhere in the app counts insights, so
 *   the third figure is the real priority-action count in the same slot. A
 *   number without a source is the one thing this screen may not show.
 *
 * ## It opens the page; it is not part of the stack
 *
 * The cards below it are a scroll stack (`ScrollStack`), every one pinned at
 * the same place under the header. This header scrolls away first, so a card
 * never slides over text and there is nothing behind a card to show through.
 *
 * ## Why a Server Component
 *
 * Markup only: the entrance is a CSS class handed down.
 *
 * ## What it dropped (2026-10-13)
 *
 * A handwritten "From Insights to Growth", three spaced-capital verbs, a
 * spaced-capital eyebrow and a "Scroll to explore" button. All decoration,
 * and the capitals broke the app's own no-shouting rule. The stack now shows
 * the first card's edge under this text instead of a cue saying there is more.
 */

const STAT_ICON = {
  pages: FileText,
  opportunities: Sparkle,
  actions: ChartBar,
} as const;

const STAT_LABEL: Record<string, readonly [one: string, many: string]> = {
  pages: ["page analysed", "pages analysed"],
  opportunities: ["key opportunity", "key opportunities"],
  actions: ["priority action", "priority actions"],
};

export function OverviewHero({
  websiteLabel,
  stats,
  analysed,
  entranceClass,
}: {
  /** The customer's domain, or null when the profile has none yet. */
  websiteLabel: string | null;
  /** From `buildHeroStats`. Empty renders no strip. */
  stats: HeroStat[];
  /** Whether an analysis has actually run — "ready" is a claim. */
  analysed: boolean;
  entranceClass: string;
}) {
  const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as React.CSSProperties;
  const site = websiteLabel ? <strong className="font-bold">{websiteLabel}</strong> : "your website";

  return (
    // A short header that scrolls away like any page's opening, NOT a panel
    // pinned behind the cards. Pinned and screen-tall (2026-09-23 to
    // 2026-10-13) it left a screen of empty footage on arrival, and every
    // card that rose over it either showed its text through or faded it a
    // different amount — no two cards behaved alike.
    <section className="on-photo flex flex-col gap-5 pb-1 pt-5 sm:pt-8">
      {/* Next sits in its own corner of the text row, never over the
          figures: absolutely placed, it covered the third one. */}
      <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className={`min-w-0 max-w-3xl ${entranceClass}`} style={delay(0)}>
          <h1 className="text-[2rem] font-bold leading-[1.08] tracking-tight text-ink sm:text-[2.75rem]">
            Your business insights are{" "}
            <span className="text-accent-vivid">{analysed ? "ready." : "on the way."}</span>
          </h1>
          <p className="mt-2 max-w-[60ch] text-base font-medium leading-relaxed text-ink">
            {analysed ? (
              <>
                We&apos;ve analysed {site}. Here is what to do next, how your site is doing, and what we
                understand about your business.
              </>
            ) : (
              <>We&apos;re analysing {site} now. The summary below fills in as the results land.</>
            )}
          </p>
        </div>
        <div className="flex shrink-0 justify-end">
          <NextStep current="/overview" />
        </div>
      </div>

      {stats.length > 0 && (
        // Three across at every width: a column on a phone, a row from `sm`.
        <dl className={`grid max-w-3xl grid-cols-3 gap-2 sm:gap-3 ${entranceClass}`} style={delay(120)}>
          {stats.map((stat) => {
            const StatIcon = STAT_ICON[stat.key as keyof typeof STAT_ICON] ?? ChartBar;
            const [one, many] = STAT_LABEL[stat.key] ?? [stat.noun, stat.nounPlural];
            return (
              <div
                key={stat.key}
                className="flex min-w-0 flex-col gap-2 rounded-lg border border-border/70 bg-surface/85 p-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-white">
                  <StatIcon size={18} weight="bold" aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-col-reverse">
                  <dt className="text-xs font-medium leading-snug text-ink-soft sm:text-sm">
                    {stat.value === 1 ? one : many}
                  </dt>
                  <dd className="text-2xl font-bold tabular-nums leading-tight text-ink">{formatCount(stat.value)}</dd>
                </div>
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}
