import {
  autopayFor,
  catalogSheet,
  chargeFor,
  defaultCurrency,
  discountText,
  formatCurrency,
  mapLivePricing,
  sheetTotal,
  wasFor,
  type AgentPriceLine,
} from "@/lib/billing/price-sheet";
import type { PricingAgent } from "@/lib/data/pricing-catalog";

const catalog: PricingAgent[] = [
  { id: "meta-ads", title: "Meta Ads", tag: "Popular", description: "Catalog copy", features: ["A", "B"], monthlyPrice: 10, wasPrice: 100, isCustom: false },
  { id: "custom", title: "Custom AI", tag: "Premium", description: "", features: [], monthlyPrice: null, wasPrice: null, isCustom: true },
];

const live = {
  agents: [
    {
      agent_id: "google-ads",
      title: "Google Ads",
      description: "",
      sort_order: 2,
      prices: { USD: { base_monthly_price: 20, discount: null, monthly_price: 20, yearly_discount_percent: 15, yearly_price_per_month: 17, yearly_total: 204, pricing_version: 3 } },
    },
    {
      agent_id: "meta-ads",
      title: "Meta Ads (live)",
      description: "",
      sort_order: 1,
      prices: {
        USD: {
          base_monthly_price: 10,
          discount: { type: "percent", percent: 20, amount: null, label: "Launch", ends_at: null },
          monthly_price: 8,
          yearly_discount_percent: 15,
          yearly_price_per_month: 7,
          yearly_total: 84,
          pricing_version: 5,
        },
        INR: { base_monthly_price: 800, discount: null, monthly_price: 800, yearly_discount_percent: 15, yearly_price_per_month: 680, yearly_total: 8160, pricing_version: 5 },
      },
    },
  ],
};

describe("mapLivePricing", () => {
  it("orders by sort_order, borrows catalog copy, and keeps the custom card", () => {
    const sheet = mapLivePricing(live, "USD", catalog)!;
    expect(sheet.source).toBe("live");
    expect(sheet.agents.map((a) => a.id)).toEqual(["meta-ads", "google-ads", "custom"]);
    const meta = sheet.agents[0]!;
    expect(meta.title).toBe("Meta Ads (live)");
    expect(meta.description).toBe("Catalog copy");
    expect(meta.features).toEqual(["A", "B"]);
    expect(meta.discount).toEqual({ kind: "percent", percent: 20, amount: null, label: "Launch", endsAt: null });
    expect(meta.version).toBe(5);
  });

  it("leaves out agents not sold in this currency", () => {
    const sheet = mapLivePricing(live, "INR", catalog)!;
    expect(sheet.agents.map((a) => a.id)).toEqual(["meta-ads", "custom"]);
  });

  it("returns null for a response with nothing usable, so the catalog stands in", () => {
    expect(mapLivePricing({}, "USD", catalog)).toBeNull();
    expect(mapLivePricing({ agents: [] }, "USD", catalog)).toBeNull();
    expect(mapLivePricing(live, "INR", [])!.agents).toHaveLength(1);
  });

  it("treats a discount with no size as no discount", () => {
    const raw = { agents: [{ agent_id: "x", prices: { USD: { base_monthly_price: 5, monthly_price: 5, discount: { type: "percent", percent: 0 } } } }] };
    expect(mapLivePricing(raw, "USD", [])!.agents[0]!.discount).toBeNull();
  });
});

describe("catalogSheet", () => {
  it("is USD, derives today's 90% off, and prices a year at 15% off", () => {
    const sheet = catalogSheet(catalog);
    const meta = sheet.agents[0]!;
    expect(sheet.currency).toBe("USD");
    expect(meta.discount?.percent).toBe(90);
    expect(meta.yearlyTotal).toBe(108);
    expect(sheet.agents[1]!.monthly).toBeNull();
  });
});

describe("prices", () => {
  const line = mapLivePricing(live, "USD", catalog)!.agents[0] as AgentPriceLine;

  it("charges a month or the year", () => {
    expect(chargeFor(line, "monthly")).toBe(8);
    expect(chargeFor(line, "yearly")).toBe(84);
  });

  it("strikes the undiscounted price, and nothing when there is no discount", () => {
    expect(wasFor(line, "monthly")).toBe(10);
    expect(wasFor(line, "yearly")).toBe(108);
    const plain = mapLivePricing(live, "USD", catalog)!.agents[1]!;
    expect(wasFor(plain, "monthly")).toBeNull();
  });

  it("discounts only the first month of autopay", () => {
    expect(autopayFor(line)).toEqual({ first: 8, renewal: 10 });
  });

  it("totals a selection, ignoring unknown and custom agents", () => {
    const sheet = mapLivePricing(live, "USD", catalog)!;
    expect(sheetTotal(sheet, ["meta-ads", "google-ads", "custom", "nope"], "monthly")).toBe(28);
  });
});

describe("money", () => {
  it("formats with the currency's own symbol and grouping", () => {
    expect(formatCurrency(10, "USD")).toBe("$10");
    expect(formatCurrency(9.5, "USD")).toBe("$9.50");
    expect(formatCurrency(125000, "INR")).toBe("₹1,25,000");
  });

  it("says what a discount is", () => {
    expect(discountText({ kind: "percent", percent: 20, amount: null, label: "", endsAt: null }, "USD")).toBe("20% off");
    expect(discountText({ kind: "fixed", percent: null, amount: 200, label: "", endsAt: null }, "INR")).toBe("₹200 off");
  });

  it("starts in the visitor's choice, else INR for India, else USD", () => {
    expect(defaultCurrency("INR", null)).toBe("INR");
    expect(defaultCurrency(undefined, "in")).toBe("INR");
    expect(defaultCurrency("GBP", "US")).toBe("USD");
    expect(defaultCurrency(undefined, null)).toBe("USD");
  });
});
