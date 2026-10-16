/**
 * The one spinner for "this control is working".
 *
 * ## Why it is a component
 *
 * It was written out by hand in `SubmitButton`, `AnalyzeButton` and the
 * creative picker, in three sizes and two colour schemes — and nine other
 * controls that knew they were pending showed nothing at all, swapping their
 * label to "Starting…" and otherwise sitting there. A word changing inside a
 * button is easy to miss on a click you have just made; a moving thing is not.
 *
 * ## Why it is `currentColor`
 *
 * The ring takes its colour from the text it sits beside, so one component
 * works on an accent-filled button (white text), a bordered one (ink) and a
 * destructive one (crit) with nothing passed. The hand-written copies each
 * hard-coded their own — which is why the accent version had to be rewritten
 * the first time a button changed colour.
 *
 * Reduced motion stops it rotating. That leaves a static ring, which still
 * reads as a state and does not pretend to be progress — the same rule as the
 * analysis screen: no figure without a source.
 *
 * Not part of the page-loading animation (see CLAUDE.md, "Loading is ONE
 * animation"): this reports an action someone just took, which is the
 * documented exception.
 */

const SIZES = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  // The dashboard card's loader (`panel-loading.tsx`) — a card-sized wait,
  // where a button-sized ring reads as a stray glyph.
  lg: "h-7 w-7",
} as const;

export function Spinner({ size = "sm" }: { size?: keyof typeof SIZES }) {
  return (
    <span
      // Decorative: the button already reports itself with `aria-busy`, and a
      // screen reader announcing a ring adds nothing.
      aria-hidden="true"
      // `inline-block` is load-bearing, not tidiness. A bare `<span>` is
      // `display: inline`, and **width and height do not apply to a
      // non-replaced inline element** — so `h-3.5 w-3.5` are ignored and only
      // the border renders, giving a 3px-wide bar the height of the line. It
      // looked correct everywhere for a while by pure luck: every button put it
      // inside an `inline-flex`, which blockifies its children as flex items.
      // The first caller without a flex parent — the ring beside a nav tab —
      // drew a thin vertical dash next to the label instead (measured
      // 2026-09-15: 3.2 x 20 there against 14 x 14 in a button). Carrying its
      // own display means it can never again depend on where it is put.
      className={`${SIZES[size]} inline-block shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current motion-reduce:animate-none`}
    />
  );
}
