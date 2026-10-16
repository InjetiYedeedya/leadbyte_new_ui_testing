/**
 * A board of cards in balanced columns, with no gap at the bottom of the
 * short one.
 *
 * ## Why this replaced weighing the cards
 *
 * Three screens used to deal their cards into columns using a `weight` per
 * card — a rough row count, guessed from the data, standing in for how tall
 * the card would render. It was always an approximation, and an approximation
 * is exactly what a column layout cannot absorb: a card estimated at four
 * units that renders at twelve leaves the other column short by eight, and on
 * a real account that is a screen-and-a-half of white space below the last
 * card in one column while the other is still going.
 *
 * Measuring for real would need the DOM, which would make every one of these
 * screens a Client Component and cost a round trip before anything rendered.
 *
 * CSS multi-column does the measuring in the browser, at layout time, for
 * free. `column-fill: balance` is the default and is precisely this job:
 * work out the height that fills every column evenly, then flow into it. No
 * estimate to drift, and it is correct for an account with three cards and an
 * account with ten without anybody tuning anything.
 *
 * ## What it costs, and why that is the right trade
 *
 * The flow decides WHICH column a card lands in — a caller can order the
 * cards, but cannot pin one to the right-hand side. That is the price of
 * balancing on real heights rather than guesses, and it buys a layout that
 * cannot leave a hole in any account's data.
 *
 * Reading order is preserved and is the natural one: down the first column,
 * then down the second, in DOM order. Which is also the order a screen reader
 * and the keyboard follow, and the order the page prints in.
 *
 * ## The two rules that make it behave
 *
 * - **`break-inside: avoid` on every child.** Without it a column boundary
 *   falls in the middle of a card and splits it across both columns, which is
 *   worse than the gap it replaced.
 * - **Vertical space is a margin, not a grid gap.** Columns have no
 *   row-gap, so each card carries its own `mb-4`; the container pulls the
 *   last one back with `-mb-4` so the board's bottom edge lines up with
 *   `PageContainer`'s own rhythm rather than sitting 16px below it.
 *
 * One column below `sm`, where two would leave each card too narrow to read.
 *
 * ## Sealing the bottom edge
 *
 * Balancing whole cards can only ever get close: the browser fills to a target
 * height and the last card that fits overshoots it, so two columns still end a
 * couple of hundred pixels apart and the board finishes on a ragged edge.
 *
 * `spanAll` is the answer to that rather than more arithmetic. A card marked
 * with it gets `column-span: all` and runs the full width BELOW both columns,
 * which closes the board on a straight line whatever the columns above it did.
 * It suits the card that usually wants it anyway — a grid of images is better
 * wide than boxed into half a page.
 */
export function CardColumns({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mb-4 columns-1 gap-4 sm:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
      {children}
    </div>
  );
}

/**
 * Wrap the one card that should run full width, below both columns.
 *
 * `column-span: all` takes the card out of the flow of either column and
 * gives it the whole board, and everything after it starts fresh underneath —
 * which is what turns a ragged bottom edge into a straight one. Put it last.
 */
export function SpanAllColumns({ children }: { children: React.ReactNode }) {
  /**
   * `mt-4` is not decoration, it is the gap that `mb-4` cannot supply here.
   *
   * Every card carries its own bottom margin, which is what spaces the cards
   * inside a column. A column BOX, though, ends flush with its content: the
   * last card's bottom margin is dropped at the fragment boundary rather than
   * pushing the column taller. So the spanning card was laid out immediately
   * under whichever column ran longest, touching it, while every other gap on
   * the board was 16px.
   *
   * Measured on a real account (2026-09-21): the right-hand column ended at
   * 1415px and "Images on your site" began at 1415px exactly. Zero. It is the
   * one edge on the board that had no gap at all, which is why the page read
   * as misaligned even though every card's width, corner and inset matched.
   *
   * The margin goes on the TOP of the spanning card rather than the bottom of
   * the cards above it, because there is no way to know from a card which one
   * will end up last in its column.
   */
  return <div className="mt-4 [column-span:all]">{children}</div>;
}
