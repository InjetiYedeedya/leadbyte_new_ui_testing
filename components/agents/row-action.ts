/**
 * The one class string for an agent row's primary action.
 *
 * ## Why this is a shared constant and not four copies
 *
 * The Agents list renders either "Open" (a link, from the page itself) or
 * "Configure" (a button, from each of the three configure islands) in the
 * same column of the same row. They were four separate class strings that
 * happened to agree on padding, which is not the same as being the same
 * control — and they did not agree on WIDTH, because a button with no width
 * of its own is as wide as its label. "Open" came out at four characters and
 * "Configure" at nine, so a column of stacked rows had buttons of two
 * different sizes down it.
 *
 * ## What the classes are doing
 *
 * - `h-9` fixes the height rather than letting `py-1.5` plus a line box
 *   decide it. The spinner `PendingLink` shows on press is taller than the
 *   text beside it, so the pressed button used to grow.
 * - `min-w-[7.5rem]` + `justify-center` fixes the width. 7.5rem clears
 *   "Configure" at `text-sm` with room to spare, so the longest label is not
 *   sitting against the edge, and shorter ones centre inside it.
 * - `rounded-md` is the app's CONTROL radius, set in `@theme`. These were on
 *   a bare `rounded` (0.25rem), which is neither of the two radii the design
 *   system has and made them visibly sharper than every other control on the
 *   screen.
 *
 * Anything added to this column uses this. A fifth spelling is how the first
 * four happened.
 *
 * ## Why `.tsx` for a file with no JSX in it
 *
 * Every other file in this repo that holds Tailwind classes is a `.tsx`, and
 * a shared class string is only worth having if the scanner is certain to
 * see it. Keeping the extension the rest of the codebase uses removes the
 * question rather than answering it.
 */
const BASE =
  "inline-flex h-9 min-w-[6.75rem] items-center justify-center gap-2 whitespace-nowrap rounded-md border " +
  "px-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 active:scale-[0.98] motion-reduce:transform-none";

/** The quiet default: a row that leads somewhere rather than doing something. */
export const AGENT_ROW_ACTION =
  `${BASE} border-border bg-surface text-accent-ink hover:bg-surface-raised ` +
  "focus-visible:outline-accent";

/** A ready agent: the button RUNS it, which is the page's main action. */
export const AGENT_ROW_ACTION_PRIMARY =
  `${BASE} border-accent bg-accent text-surface hover:bg-accent-ink focus-visible:outline-accent`;

/**
 * An agent that cannot run until it is set up. Colour is never the only
 * signal — the row also carries the "Needs setup" state in words — but this is
 * the one row in the list with an errand attached, and it reads as one.
 */
export const AGENT_ROW_ACTION_ATTENTION =
  `${BASE} border-crit bg-crit text-surface hover:bg-crit/90 focus-visible:outline-crit`;

/**
 * An agent waiting on its setup, on the agents page (2026-10-15 design): a
 * soft blue button. Setting up is the next step, not an error — the amber is
 * kept for the card's "Needs setup" pill, which says it in words.
 */
export const AGENT_ROW_ACTION_SETUP =
  `${BASE} border-accent/20 bg-accent-soft text-accent-ink hover:border-accent/40 hover:bg-accent-soft/70 focus-visible:outline-accent`;
