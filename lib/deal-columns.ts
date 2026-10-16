/**
 * Splits a list of blocks across columns so both sides end at roughly the
 * same place.
 *
 * ## Why this exists
 *
 * Two screens had their blocks assigned to a column BY HAND, from heights
 * measured on one account — the brand sheet and the website audit. That is
 * right for that account and wrong for every other. A profile with no
 * competitors and no images, or an audit with no per-page report, put
 * everything in one column and left the other empty, and on the audit the
 * right-hand column could render nothing at all. Tuning a layout to one
 * workspace's data is what breaks the moment somebody else signs in.
 *
 * ## What `weight` is
 *
 * A rough row count taken from the DATA that fills a block — how many
 * competitors, how many keywords, how many crawled pages. NOT a pixel
 * measurement: it only has to RANK the blocks against each other, and a real
 * measurement would need the DOM, which would make every one of these screens
 * a client component.
 *
 * ## Why greedy, and why it is stable
 *
 * Largest first into whichever column is currently shortest — the standard
 * greedy partition. It is deterministic for a given input, so the server and
 * the client agree and there is no hydration mismatch. `sort` is called on a
 * copy: sorting the caller's array in place would reorder the blocks on the
 * page as a side effect of laying them out.
 */
export interface WeightedBlock<T> {
  key: string;
  /** Roughly how tall this block will be, in arbitrary units. */
  weight: number;
  block: T;
}

export function dealColumns<T>(
  blocks: readonly WeightedBlock<T>[],
  columnCount = 2,
): WeightedBlock<T>[][] {
  const columns: { weight: number; items: WeightedBlock<T>[] }[] = Array.from(
    { length: Math.max(1, columnCount) },
    () => ({ weight: 0, items: [] }),
  );

  for (const entry of [...blocks].sort((a, b) => b.weight - a.weight)) {
    // `reduce` rather than a sort: the shortest column, with the FIRST one
    // winning a tie, so the left side fills first and a single block does not
    // land in column two beside an empty column one.
    const target = columns.reduce((shortest, column) =>
      column.weight < shortest.weight ? column : shortest,
    );
    target.items.push(entry);
    target.weight += entry.weight;
  }

  return columns.map((column) => column.items);
}

/**
 * Lays blocks out in an order somebody CHOSE, rather than the order their
 * sizes imply.
 *
 * ## Why this exists beside `dealColumns`
 *
 * Balancing ranks by size, which is right for the audit and GEO screens —
 * their blocks are interchangeable reports, and the only thing that matters is
 * that neither column runs off the bottom of the other. The business profile
 * is not that. Its cards tell a story in a deliberate order: the facts about
 * the business first, then the brand read off those facts, and the market and
 * contact details beside them. No `weight` can express that, because the cards
 * a reader wants first are not the tallest ones — "Business information" kept
 * landing below the competitor list purely because competitors carry more rows.
 *
 * Inflating a weight to force a card up was the alternative and it is a lie:
 * the number is a height estimate, and a false one unbalances the columns for
 * every account whose data differs.
 *
 * ## The trap this must not fall into
 *
 * A fixed plan is what `dealColumns` was written to REPLACE. Both of these
 * screens once assigned blocks to a column by hand, from heights measured on
 * one account, and an account with different data put everything in one column
 * and left the other empty. Two rules keep that from coming back:
 *
 * - **A key the account has no block for is skipped, not reserved.** Every
 *   card but the business facts is conditional, so a named key with nothing
 *   behind it is the normal case rather than a mistake.
 * - **A column that ends up empty throws the plan away** and the whole set is
 *   balanced instead. One full column beside an empty one is the exact defect;
 *   an order nobody notices is lost is a far smaller cost than a broken page.
 *
 * A block whose key the plan never names is still placed — into the shortest
 * column, the same choice balancing would make — so a card added later appears
 * on the page even if nobody remembers to update the plan.
 */
export function fixedColumns<T>(
  blocks: readonly WeightedBlock<T>[],
  /** One list of keys per column, in the order they should be read. */
  plan: readonly (readonly string[])[],
): WeightedBlock<T>[][] {
  const byKey = new Map(blocks.map((entry) => [entry.key, entry]));
  const named = new Set(plan.flat());

  const columns = plan.map((keys) =>
    keys.map((key) => byKey.get(key)).filter((entry): entry is WeightedBlock<T> => Boolean(entry)),
  );

  // Anything the plan does not mention, dealt the way `dealColumns` would.
  for (const entry of blocks.filter((block) => !named.has(block.key))) {
    const shortest = columns.reduce((best, column) =>
      total(column) < total(best) ? column : best,
    );
    shortest.push(entry);
  }

  // The plan is only worth keeping if it fills every column. When it does not,
  // balancing is strictly better than a page with a hole in it.
  const anyEmpty = columns.some((column) => column.length === 0);
  if (anyEmpty && blocks.length > 0) {
    return dealColumns(blocks, plan.length);
  }

  return columns;
}

function total<T>(column: readonly WeightedBlock<T>[]): number {
  return column.reduce((sum, entry) => sum + entry.weight, 0);
}
