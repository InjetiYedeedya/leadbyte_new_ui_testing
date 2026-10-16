import { parseConnectedData, tableRows } from "@/lib/data/connected-data";

describe("parseConnectedData", () => {
  it("reads the tables out of a wrapped payload", () => {
    const parsed = parseConnectedData({
      email: "a@b.com",
      data: { search_console_breakdown: [{ type: "query" }] },
    });
    expect(parsed.email).toBe("a@b.com");
    expect(parsed.tables.search_console_breakdown).toHaveLength(1);
    expect(parsed.hasRows).toBe(true);
  });

  it("reads a table present but null as empty, not missing", () => {
    const parsed = parseConnectedData({ data: { ga4_daily: null } });
    expect(parsed.tables.ga4_daily).toEqual([]);
    expect(parsed.hasRows).toBe(false);
  });

  it("survives a payload that is not shaped like one", () => {
    expect(parseConnectedData(null).tables).toEqual({});
    expect(parseConnectedData("nope").hasRows).toBe(false);
  });
});

describe("tableRows", () => {
  it("is empty for a table the bundle did not carry", () => {
    expect(tableRows(parseConnectedData({ data: {} }), "ga4_daily")).toEqual([]);
  });
});

describe("empty versus failed", () => {
  it("a parsed bundle is a successful read, even with no rows", () => {
    // "Connected, nothing in it yet" is a real answer and must not look like a
    // failure. The distinction is what `ok` exists for — a screen showing
    // "no data yet" over a broken read reports something we do not know.
    const parsed = parseConnectedData({ email: "a@b.com", data: { ga4_daily: [] } });
    expect(parsed.ok).toBe(true);
    expect(parsed.error).toBeNull();
    expect(parsed.hasRows).toBe(false);
  });
});
