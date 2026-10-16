import { readSourceOutcome, rowsFrom } from "@/lib/api/read-cascade";

describe("rowsFrom", () => {
  it("reads a list from the documented envelope", () => {
    expect(rowsFrom({ success: true, data: [{ Keyword: "teeth whitening" }] })).toEqual([
      { Keyword: "teeth whitening" },
    ]);
  });

  it("reads a bare array, which some routes answer with", () => {
    expect(rowsFrom([{ a: 1 }])).toEqual([{ a: 1 }]);
  });

  it("wraps a single record, because `get` returns one and `query` returns many", () => {
    // The cascade tries a get-style route and a query-style route for the same
    // table. One object and a list of one are the same answer.
    expect(rowsFrom({ success: true, data: { email: "a@b.com" } })).toEqual([
      { email: "a@b.com" },
    ]);
  });

  it("is empty for an absent or unreadable payload", () => {
    expect(rowsFrom(null)).toEqual([]);
    expect(rowsFrom({ success: true })).toEqual([]);
    expect(rowsFrom({ success: true, data: null })).toEqual([]);
    expect(rowsFrom("nope")).toEqual([]);
  });

  it("is empty when the backend says the call did not succeed", () => {
    expect(rowsFrom({ success: false, error: "nope", data: [{ a: 1 }] })).toEqual([]);
  });
});

describe("readSourceOutcome", () => {
  it("reports ok with the rows it found", () => {
    const outcome = readSourceOutcome({ rows: [{ a: 1 }], error: null });
    expect(outcome).toEqual({ ok: true, error: null, rows: [{ a: 1 }] });
  });

  it("distinguishes empty from failed — the whole point of the map", () => {
    // A tab that cannot tell "you have no campaigns" from "we couldn't ask"
    // shows an empty state over a broken read, which is the bug this exists to
    // prevent.
    const empty = readSourceOutcome({ rows: [], error: null });
    expect(empty.ok).toBe(true);
    expect(empty.rows).toEqual([]);

    const failed = readSourceOutcome({ rows: [], error: new Error("timeout") });
    expect(failed.ok).toBe(false);
    expect(failed.error).toBe("timeout");
  });

  it("keeps rows that arrived before a later failure", () => {
    // The cascade can succeed on one route and fail on the next. Rows in hand
    // are still rows.
    const outcome = readSourceOutcome({ rows: [{ a: 1 }], error: new Error("scan failed") });
    expect(outcome.ok).toBe(true);
    expect(outcome.rows).toEqual([{ a: 1 }]);
  });

  it("summarises an error that is not an Error", () => {
    expect(readSourceOutcome({ rows: [], error: "boom" }).error).toBe("boom");
  });
});

describe("rowsFrom — the other envelopes the backend sends", () => {
  it("reads Items, data.Items, data.data and a JSON string", async () => {
    const { rowsFrom } = await import("./read-cascade");
    expect(rowsFrom({ Items: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    expect(rowsFrom({ success: true, data: { Items: [{ a: 1 }, { a: 2 }] } })).toHaveLength(2);
    expect(rowsFrom({ data: { data: [{ a: 1 }] } })).toEqual([{ a: 1 }]);
    expect(rowsFrom({ data: '[{"a":1}]' })).toEqual([{ a: 1 }]);
    expect(rowsFrom({ Item: { a: 1 } })).toEqual([{ a: 1 }]);
  });

  it("does not count an empty object as a row", async () => {
    const { rowsFrom } = await import("./read-cascade");
    expect(rowsFrom({ success: true, data: {} })).toEqual([]);
    expect(rowsFrom([{}, { a: 1 }])).toEqual([{ a: 1 }]);
  });

  it("still reads nothing from an explicit failure", async () => {
    const { rowsFrom } = await import("./read-cascade");
    expect(rowsFrom({ success: false, data: [{ a: 1 }] })).toEqual([]);
  });
});
