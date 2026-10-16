import {
  DEFAULT_CURRENCY,
  budgetMinimum,
  currencySymbol,
  formatBudget,
  normaliseCurrency,
} from "./openai-currency";

describe("normaliseCurrency", () => {
  it("upper-cases a valid three-letter code", () => {
    expect(normaliseCurrency("usd")).toBe("USD");
    expect(normaliseCurrency(" inr ")).toBe("INR");
  });

  it("falls back to the default for anything that is not a code", () => {
    expect(normaliseCurrency("")).toBe(DEFAULT_CURRENCY);
    expect(normaliseCurrency(null)).toBe(DEFAULT_CURRENCY);
    expect(normaliseCurrency(undefined)).toBe(DEFAULT_CURRENCY);
    expect(normaliseCurrency("$")).toBe(DEFAULT_CURRENCY);
    expect(normaliseCurrency("dollars")).toBe(DEFAULT_CURRENCY);
  });
});

describe("currencySymbol / formatBudget", () => {
  it("uses a glyph when known and the bare code otherwise", () => {
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("INR")).toBe("₹");
    expect(currencySymbol("AUD")).toBe("AUD");
  });

  it("spaces a code but not a glyph", () => {
    expect(formatBudget(25, "USD")).toBe("$25");
    expect(formatBudget(500, "INR")).toBe("₹500");
    expect(formatBudget(25, "AUD")).toBe("AUD 25");
  });
});

describe("budgetMinimum", () => {
  it("enforces USD's published floors", () => {
    expect(budgetMinimum("USD", "daily")).toBe(25);
    expect(budgetMinimum("USD", "lifetime")).toBe(100);
    // Case and default both resolve to USD.
    expect(budgetMinimum("usd", "daily")).toBe(25);
    expect(budgetMinimum("", "lifetime")).toBe(100);
  });

  it("returns 0 (no extra floor) for a currency with no published minimum", () => {
    expect(budgetMinimum("INR", "daily")).toBe(0);
    expect(budgetMinimum("INR", "lifetime")).toBe(0);
  });
});
