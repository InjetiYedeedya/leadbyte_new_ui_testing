import { countOf, formatAmount, formatCount, formatMoney } from "./format";

describe("formatMoney", () => {
  it("says nothing rather than zero when there is no figure", () => {
    // A CPA of 0 and "you have had no conversions" are completely different
    // claims. The live Advertising screen printed the second one as "₹0".
    expect(formatMoney(null)).toBe("—");
  });

  it("keeps the pennies on a sub-unit amount", () => {
    // ₹205 across 534 clicks is a CPC of 0.38, which rounded to "0" — the
    // screen then reported a cost per click of nothing on real spend.
    expect(formatMoney(205 / 534)).toBe("0.38");
  });

  it("keeps two decimals up to ten, where they still carry information", () => {
    expect(formatMoney(9.456)).toBe("9.46");
  });

  it("drops decimals once the whole number is what matters", () => {
    expect(formatMoney(14.3)).toBe("14");
    expect(formatMoney(3240.7)).toBe("3,241");
  });

  it("groups large amounts the way the rest of the app does", () => {
    // en-IN, pinned — see the note in this module.
    expect(formatMoney(197508)).toBe("1,97,508");
  });

  it("prints a real zero as zero", () => {
    // Zero spend is a fact; only null is unknown.
    expect(formatMoney(0)).toBe("0");
  });
});

describe("formatCount", () => {
  it("groups counts with the pinned locale", () => {
    expect(formatCount(285140)).toBe("2,85,140");
  });
});

describe("formatAmount", () => {
  it("still rounds to whole units", () => {
    expect(formatAmount(3240.7)).toBe("3,241");
  });
});

describe("countOf", () => {
  it("uses the singular for exactly one", () => {
    // The whole reason this helper exists: "1 issues explained", "1 pages",
    // "1 rows" and "1 of 1 pages have no Schema.org markup" all shipped.
    expect(countOf(1, "issue")).toBe("1 issue");
    expect(countOf(1, "page")).toBe("1 page");
    expect(countOf(1, "row")).toBe("1 row");
  });

  it("uses the plural for everything else, including zero", () => {
    expect(countOf(0, "issue")).toBe("0 issues");
    expect(countOf(2, "issue")).toBe("2 issues");
  });

  it("takes an irregular plural where an s will not do", () => {
    expect(countOf(1, "entry", "entries")).toBe("1 entry");
    expect(countOf(3, "entry", "entries")).toBe("3 entries");
  });

  it("groups a long count, so a big number stays readable", () => {
    expect(countOf(1284, "issue")).toBe("1,284 issues");
  });
});
