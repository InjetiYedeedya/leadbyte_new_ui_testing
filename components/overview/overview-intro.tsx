import { CaretDown } from "@phosphor-icons/react/ssr";
import { formatCount } from "@/lib/format";
import { DEFAULT_BUSINESS_NAME } from "@/lib/data/overview-summary";
import type { HeroStat } from "@/lib/data/overview-summary";

/**
 * The introduction above the Overview's four stacked cards.
 *
 * ## What it is for
 *
 * The page opens straight into a sticky card stack. Without an introduction
 * the first thing on screen is a data card, nothing frames what the screen
 * is, and the stacking choreography is invisible — a reader who does not
 * scroll never learns there are four sections. This names the business, says
 * what was analysed, shows the figures behind it and points down.
 *
 * ## Why it is NOT part of the stack
 *
 * A stacked item is pinned and then covered by the next card. A "scroll to
 * explore" cue that pins under the nav and then has a data card slide over it
 * reads as a rendering fault rather than an invitation, and a fifth stacked
 * item would cost a returning reader a full screen of travel before any data.
 * It is an ordinary block rendered before `ScrollStack`, and nothing here may
 * change the stack's behaviour.
 *
 * ## Why there is no banner, wash or blob
 *
 * There was one — a full-bleed blue gradient with two blurred circles — and
 * it was the thing that made this page read as a generic AI-SaaS hero rather
 * than a business-intelligence workspace. It is gone entirely: the intro is
 * an ordinary block on the page background, on the same gutter as every other
 * page. The composition is carried by typography, a single hairline above the
 * figures, and whitespace. There is exactly ONE accent element in the whole
 * block, inside the drawing.
 *
 * Removing the negative-margin full-bleed also removed the horizontal-scroll
 * hazard it carried, which is the bug `sub-tab-bar.tsx` documents at length.
 *
 * ## Height is a contract
 *
 * The first card must PEEK above the fold, which is what tells the reader
 * there is more. That only holds while this block stays around 300px, so:
 * **no viewport units anywhere in here** (`min-h-screen`, `h-[100svh]` and
 * friends turn a comfortable peek into a full-screen banner on a tall
 * monitor), and no image or asset that could resize after mount: `ScrollStack`
 * never re-measures for anything above it, so a late height change breaks
 * every card's landing point.
 *
 * There is no drawing. A four-node signal line sat beside the copy and was
 * removed on request (2026-09-23); `PresenceFlow` is kept, unused.
 *
 * ## Why a Server Component
 *
 * No state, no events. The icons come from `@phosphor-icons/react/ssr`, the
 * entrance animation is a CSS class handed down so the once-per-document gate
 * stays in one place.
 */
export function OverviewIntro({
  businessName,
  websiteLabel,
  websiteHref,
  stats,
  analysed,
  entranceClass,
  firstSectionId,
}: {
  businessName: string;
  /** The customer's domain, or null when the profile has none yet. */
  websiteLabel: string | null;
  websiteHref: string | null;
  /** From `buildHeroStats`. Empty renders no strip. */
  stats: HeroStat[];
  /**
   * Whether an analysis has actually run.
   *
   * "Here's what we found" claims a finding, and on an account whose crawl
   * has never run the sections below are all empty states. The claim is
   * branched rather than hedged, because a softened version would be wrong in
   * both directions.
   */
  analysed: boolean;
  /** `reveal-up` on the first mount of a document, `""` after. */
  entranceClass: string;
  /** The anchor the scroll cue points at: the first card of the stack. */
  firstSectionId: string;
}) {
  // The page falls back to a generic name when the profile has none. Compared
  // against the shared constant rather than string-matched, so the two cannot
  // drift into "…about Your business."
  const named = businessName !== DEFAULT_BUSINESS_NAME;
  const subject = named ? businessName : "your business";

  const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as React.CSSProperties;

  return (
    <section className="pb-3 sm:pb-4">
      <div className={`min-w-0 ${entranceClass}`} style={delay(0)}>
        {/* Not accent-coloured. A coloured eyebrow reads as a badge, and
            badges are what this redesign is getting away from. */}
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
          Business overview
        </p>

        {/* `text-3xl` is the top of the type scale. No accent word: the
            hierarchy is carried by weight and measure. */}
        <h1 className="mt-2 max-w-[18ch] sm:mt-3 break-words text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">
          {analysed
            ? `Here's what we found about ${subject}.`
            : `We're getting to know ${subject}.`}
        </h1>

        {websiteLabel &&
          (websiteHref ? (
            <a
              href={websiteHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block break-all text-sm text-accent-ink underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {websiteLabel}
            </a>
          ) : (
            <span className="mt-2 inline-block break-all text-sm text-ink-soft">
              {websiteLabel}
            </span>
          ))}

        <p className="mt-2.5 max-w-[54ch] sm:mt-3 text-sm leading-relaxed text-ink-soft">
          {analysed
            ? "We analysed your online presence and pulled out the things worth your attention."
            : "Your first analysis is on the way. The sections below fill in as it lands."}
        </p>

        {/* One hairline, the only rule in the block. Figures and nouns only:
            the icon circles that used to sit here were 36px of height and
            read as chips. */}
        {stats.length > 0 && (
          <dl
            className={`mt-6 flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-3.5 sm:gap-x-10 ${entranceClass}`}
            style={delay(120)}
          >
            {stats.map((stat) => (
              <div key={stat.key} className="flex min-w-0 flex-col-reverse">
                <dt className="mt-1 truncate text-xs text-ink-soft">
                  {stat.value === 1 ? stat.noun : stat.nounPlural}
                </dt>
                <dd className="text-lg font-semibold tabular-nums leading-none text-ink">
                  {formatCount(stat.value)}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <a
          href={`#${firstSectionId}`}
          className="group mt-5 inline-flex items-center gap-2 rounded-md text-sm font-medium text-accent-ink underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent print:hidden"
        >
          Scroll to explore
          <CaretDown size={16} aria-hidden="true" className="scroll-cue" />
        </a>
      </div>
    </section>
  );
}
