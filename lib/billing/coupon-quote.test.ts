import { mapCouponOffers, mapCouponQuote, normaliseCouponCode } from "@/lib/billing/coupon-quote";

describe("mapCouponOffers", () => {
  const raw = {
    coupons: [
      { code: "diwali20", description: "Festive", discount_type: "percent", percent_off: 20, amount_off: null, flows: ["one_time", "autopay"], ends_at: null, personal: false },
      { code: "FLAT200", description: "", discount_type: "fixed", percent_off: null, amount_off: { INR: 200 }, flows: ["one_time"], ends_at: "2026-10-31T23:59:59Z", personal: true },
      { code: "AUTOONLY", discount_type: "percent", percent_off: 10, flows: ["autopay"] },
    ],
  };

  it("keeps the coupons for this step, labelled in the currency being paid", () => {
    expect(mapCouponOffers(raw, "INR", "one_time")).toEqual([
      { code: "DIWALI20", description: "Festive", label: "20% off", personal: false, endsAt: null },
      { code: "FLAT200", description: "", label: "₹200 off", personal: true, endsAt: "2026-10-31T23:59:59Z" },
    ]);
  });

  it("drops a fixed coupon with no amount in this currency", () => {
    expect(mapCouponOffers(raw, "USD", "one_time").map((o) => o.code)).toEqual(["DIWALI20"]);
  });

  it("keeps autopay coupons apart from one-time ones", () => {
    expect(mapCouponOffers(raw, "USD", "autopay").map((o) => o.code)).toEqual(["DIWALI20", "AUTOONLY"]);
  });

  it("reads anything unexpected as no offers", () => {
    expect(mapCouponOffers(null, "USD", "one_time")).toEqual([]);
  });
});

describe("mapCouponQuote", () => {
  const quote = {
    coupon: { code: "diwali20", description: "Festive" },
    subtotal: 20,
    discount: 4,
    total: 16,
    lines: [{ id: "meta-ads", title: "Meta", charge: 10, discount: 2, final: 8 }, { id: "", discount: 1 }],
  };

  it("reads a quote, per line", () => {
    expect(mapCouponQuote(quote)).toEqual({
      code: "DIWALI20",
      description: "Festive",
      subtotal: 20,
      discount: 4,
      total: 16,
      lines: [{ id: "meta-ads", discount: 2, final: 8 }],
      firstMonth: null,
      renewal: null,
    });
  });

  it("reads an autopay quote's first month and renewal", () => {
    const q = mapCouponQuote({ ...quote, first_month_amount: 6, renewal_amount: 10 })!;
    expect([q.firstMonth, q.renewal]).toEqual([6, 10]);
  });

  it("refuses a quote that does not add up", () => {
    expect(mapCouponQuote({ ...quote, total: 25 })).toBeNull();
    expect(mapCouponQuote({ ...quote, total: -1 })).toBeNull();
    expect(mapCouponQuote({ subtotal: 1, discount: 0, total: 1 })).toBeNull();
  });
});

describe("normaliseCouponCode", () => {
  it("upper-cases and strips anything a code cannot contain", () => {
    expect(normaliseCouponCode("  diwali 20! ")).toBe("DIWALI20");
    expect(normaliseCouponCode(undefined)).toBe("");
  });
});
