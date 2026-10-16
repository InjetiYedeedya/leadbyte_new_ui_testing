import { dealColumns, fixedColumns } from "./deal-columns";

/**
 * These tests are about the case that broke: an account whose data is NOT the
 * shape the layout was tuned against.
 */

const b = (key: string, weight: number) => ({ key, weight, block: key });

describe("dealColumns", () => {
  it("keeps two columns close when the blocks are uneven", () => {
    // The real shape: one huge block and several small ones. Assigned by hand
    // this ended 500+ units apart.
    const [left, right] = dealColumns([
      b("pages", 40),
      b("keywords", 25),
      b("findings", 6),
      b("kpi", 5),
    ]);

    const total = (column: typeof left) =>
      column!.reduce((sum, entry) => sum + entry.weight, 0);

    expect(total(left!)).toBe(40);
    expect(total(right!)).toBe(36);
    expect(Math.abs(total(left!) - total(right!))).toBeLessThanOrEqual(6);
  });

  it("puts a lone block in the FIRST column, never the second", () => {
    // The audit bug in miniature: when only the per-page report rendered, a
    // hand-assigned layout left column one empty and column two full.
    const [left, right] = dealColumns([b("only", 10)]);
    expect(left).toHaveLength(1);
    expect(right).toHaveLength(0);
  });

  it("handles no blocks at all", () => {
    // An account with nothing extracted yet still has to render a page.
    const [left, right] = dealColumns([]);
    expect(left).toEqual([]);
    expect(right).toEqual([]);
  });

  it("does not reorder the caller's array", () => {
    // Laying out must not be a side effect on the data. `sort` mutates, so
    // this would silently reshuffle the page's own source order.
    const input = [b("a", 1), b("b", 9)];
    dealColumns(input);
    expect(input.map((entry) => entry.key)).toEqual(["a", "b"]);
  });

  it("is deterministic, so server and client agree", () => {
    // A different split between render passes is a hydration mismatch.
    const input = [b("a", 5), b("b", 5), b("c", 5), b("d", 5)];
    const once = dealColumns(input).map((column) => column.map((e) => e.key));
    const twice = dealColumns(input).map((column) => column.map((e) => e.key));
    expect(once).toEqual(twice);
  });
});

/**
 * The layout a reader was promised, rather than the one the data happened to
 * produce.
 *
 * Balancing ranks by SIZE, which is right when the blocks are interchangeable
 * reports and wrong when they tell a story in an order somebody chose. On the
 * business profile the facts come first, then the brand read off them — an
 * order no weight expresses, because the cards a reader wants first are not
 * the tallest ones.
 *
 * The danger is the bug `dealColumns` was written to kill: a hand-assigned
 * layout tuned to one account, which empties a column on the next one. These
 * tests are mostly about that.
 */
describe("fixedColumns", () => {
  const plan = [
    ["business", "brand"],
    ["competitors", "contact"],
  ];

  it("lays the blocks out in the order named, not by weight", () => {
    const [left, right] = fixedColumns(
      [b("contact", 2), b("competitors", 30), b("brand", 9), b("business", 5)],
      plan,
    );
    expect(left!.map((e) => e.key)).toEqual(["business", "brand"]);
    expect(right!.map((e) => e.key)).toEqual(["competitors", "contact"]);
  });

  it("skips a named block the account has no data for", () => {
    // Every card but the business facts is conditional, so a named key that
    // never made it into the list is the normal case, not a mistake.
    const [left, right] = fixedColumns([b("business", 5), b("competitors", 30)], plan);
    expect(left!.map((e) => e.key)).toEqual(["business"]);
    expect(right!.map((e) => e.key)).toEqual(["competitors"]);
  });

  it("still places a block the plan forgot to name", () => {
    // A card added later must appear, not vanish because nobody updated the
    // plan. It goes to the shortest column, which is what balancing would do.
    const [left, right] = fixedColumns(
      [b("business", 5), b("competitors", 30), b("newcomer", 4)],
      plan,
    );
    const keys = [...left!, ...right!].map((e) => e.key);
    expect(keys).toContain("newcomer");
    expect(left!.map((e) => e.key)).toEqual(["business", "newcomer"]);
  });

  it("falls back to balancing rather than leave a column empty", () => {
    // THE bug this whole module exists for. An account with no competitors and
    // no contact details has nothing for the right-hand column, and a fixed
    // plan would render one full column beside an empty one.
    const [left, right] = fixedColumns([b("business", 5), b("brand", 9)], plan);
    expect(left!.length).toBeGreaterThan(0);
    expect(right!.length).toBeGreaterThan(0);
  });

  it("handles no blocks at all", () => {
    const [left, right] = fixedColumns([], plan);
    expect(left).toEqual([]);
    expect(right).toEqual([]);
  });

  it("does not reorder the caller's array", () => {
    const input = [b("contact", 2), b("business", 5)];
    fixedColumns(input, plan);
    expect(input.map((entry) => entry.key)).toEqual(["contact", "business"]);
  });

  it("is deterministic, so server and client agree", () => {
    const input = [b("business", 5), b("brand", 9), b("competitors", 30), b("contact", 2)];
    const once = fixedColumns(input, plan).map((c) => c.map((e) => e.key));
    const twice = fixedColumns(input, plan).map((c) => c.map((e) => e.key));
    expect(once).toEqual(twice);
  });
});
