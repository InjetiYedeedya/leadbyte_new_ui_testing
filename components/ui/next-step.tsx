import Link from "@/components/ui/app-link";
import { NEXT_STEP_ORDER } from "@/lib/nav";

/**
 * Where to go next, beside the page's heading.
 *
 * ## Why it exists
 *
 * The Overview tabs are a reading order — summary, then the business we
 * extracted, then what is wrong with the site, then how machines see it — but
 * nothing on the page said so. Landing on Business profile gave the customer
 * a full screen of correct information and no idea whether they were finished
 * with it. The tab strip is navigation, not a next step: it says where you CAN
 * go, never where to go now.
 *
 * ## Why it sits beside the heading, not at the foot
 *
 * It was a full-width card at the bottom first, which is where a "read on"
 * link conventionally goes — and it is the wrong place for this one. The
 * customer's question is not "what do I read after finishing this page", it is
 * "am I meant to be doing something here" — and that question is asked on
 * arrival, before any of the content has been read. An answer that only
 * appears after scrolling past a brand sheet arrives too late to be the
 * reassurance it was added to be.
 *
 * So it is a compact control in the heading row: visible in the first
 * viewport, and small enough that it reads as a way out rather than as the
 * page's main action. The one-line description that made sense on a
 * full-width card is dropped — at this size the label carries it, and the
 * destination tab is one click away either way.
 *
 * ## Where it goes
 *
 * It walks `NEXT_STEP_ORDER`: the Overview tabs, then Performance, Strategy
 * and Agents (2026-09-28, asked for on every page that has a next page).
 * Agents is last, so it renders nothing there.
 *
 * ## Why GEO analysis does not use it
 *
 * It briefly pointed out of the section to the Connections page instead,
 * which was wrong for a reason worth keeping written down: that page is an
 * inventory of integrations, and it shows what we are about to ask Google for
 * before the customer has chosen to ask for anything. Leaving the section is a
 * step with a dialog behind it, so the GEO page owns that control itself
 * (`ConnectGoogle`) and this component stays what it is — the tab chain, and
 * only the tab chain.
 */

/**
 * Two weights, for two surroundings.
 *
 * `quiet` is the original and stays the default: a bordered link sitting in a
 * heading row, deliberately small so it reads as a way out rather than as the
 * page's main action. `solid` is for a panel that has already made the case
 * for going (the Business profile hero), where a ghost button on a tinted
 * card reads as disabled. The words and the destination are identical either
 * way — only the weight changes.
 */
const TONE = {
  quiet:
    "border border-border bg-surface text-ink hover:border-accent/40 hover:bg-surface-raised",
  // White on `accent`, which is the pairing `accent-ink` exists to guarantee
  // is readable. Never a tinted text colour on a tinted fill.
  solid: "bg-accent text-white hover:bg-accent-ink",
} as const;

export function NextStep({
  current,
  tone = "quiet",
}: {
  current: string;
  tone?: keyof typeof TONE;
}) {
  const index = NEXT_STEP_ORDER.findIndex((step) => step.href === current);
  const next = index === -1 ? undefined : NEXT_STEP_ORDER[index + 1];
  if (!next) return null;

  return (
    <Link
      href={next.href}
      // Gone on paper: the audit and GEO pages print to PDF, and a link is
      // not a control in a printed report.
      className={`group inline-flex shrink-0 items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent print:hidden ${TONE[tone]}`}
    >
      <span className={tone === "solid" ? "text-white/70" : "text-ink-soft"}>Next</span>
      <span>{next.label}</span>
      {/* Decorative: the link's own text already says where it goes, so a
          screen reader reading "arrow" here would add nothing. */}
      <span
        aria-hidden="true"
        className={`hover-nudge transition-transform duration-150 motion-reduce:transform-none ${tone === "solid" ? "text-white/70" : "text-ink-soft"}`}
      >
        →
      </span>
    </Link>
  );
}
