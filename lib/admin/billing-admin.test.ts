import {
  buildCouponWrite,
  buildPricingWrite,
  couponAudience,
  couponSummary,
  mapAdminCoupons,
  mapAdminPricing,
  mapPriceHistory,
  mapRedemptions,
  normaliseAgentId,
} from "@/lib/admin/billing-admin";

const form = (fields: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

describe("mapAdminPricing", () => {
  it("reads each agent's prices, discount and version, in sort order", () => {
    const rows = mapAdminPricing({
      agents: [
        { agent_id: "google-ads", title: "Google Ads", active: true, sort_order: 2, prices: { USD: 10 }, discount: null, yearly_discount_percent: 15, version: 1, updated_by: "a@b.c" },
        { agent_id: "meta-ads", title: "Meta Ads", active: false, sort_order: 1, prices: { INR: 800, USD: 10 }, discount: { type: "fixed", amount: { INR: 100 }, label: "Diwali", ends_at: "2026-11-01T23:59:59Z" }, yearly_discount_percent: 20, version: 4, updated_by: "" },
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(["meta-ads", "google-ads"]);
    expect(rows[0]).toMatchObject({ inr: 800, usd: 10, discountKind: "fixed", discountInr: 100, discountUsd: null, discountEnds: "2026-11-01", yearlyPercent: 20, version: 4, active: false });
    expect(rows[1]).toMatchObject({ inr: null, discountKind: "none" });
  });

  it("reads anything else as no rows", () => {
    expect(mapAdminPricing(null)).toEqual([]);
  });
});

describe("buildPricingWrite", () => {
  const base = { inr: "800", usd: "10", discountKind: "none", yearlyPercent: "15", version: "4", active: "on" };

  it("builds the body, with the version for the lock", () => {
    expect(buildPricingWrite(form(base))).toEqual({
      ok: true,
      body: { prices: { INR: 800, USD: 10 }, discount: null, yearly_discount_percent: 15, active: true, expected_version: 4 },
    });
  });

  it("reads an empty price as not sold in that currency", () => {
    const write = buildPricingWrite(form({ ...base, inr: "" }));
    expect(write.ok && write.body.prices).toEqual({ INR: null, USD: 10 });
  });

  it("uses only the fields of the chosen discount type", () => {
    const write = buildPricingWrite(form({ ...base, discountKind: "percent", discountPercent: "20", discountInr: "50", discountLabel: "Launch", discountEnds: "2026-10-31" }));
    expect(write.ok && write.body.discount).toMatchObject({ type: "percent", percent: 20, label: "Launch" });
    expect(write.ok && "amount" in (write.body.discount as object)).toBe(false);
  });

  it("refuses a discount bigger than the price, a % out of range, and a bad yearly %", () => {
    const write = buildPricingWrite(form({ ...base, discountKind: "fixed", discountInr: "900", yearlyPercent: "95" }));
    expect(write.ok).toBe(false);
    expect(!write.ok && write.errors).toEqual(["The ₹ discount must be less than the ₹ price.", "The yearly discount must be between 0 and 90."]);
    const pct = buildPricingWrite(form({ ...base, discountKind: "percent", discountPercent: "95" }));
    expect(!pct.ok && pct.errors).toContain("A % discount must be between 1 and 90.");
  });

  it("reads an unticked box as inactive", () => {
    const { active, ...rest } = base;
    void active;
    const write = buildPricingWrite(form(rest));
    expect(write.ok && write.body.active).toBe(false);
  });

  it("normalises a new agent id", () => {
    expect(normaliseAgentId("  Blog Posting! ")).toBe("blogposting");
    expect(normaliseAgentId("blog-posting")).toBe("blog-posting");
  });
});

describe("mapPriceHistory", () => {
  it("reads each change's before and after", () => {
    expect(
      mapPriceHistory({ history: [{ changed_at: "2026-09-28T10:00:00Z#abc", changed_by: "admin@x.io", previous: { prices: { INR: 800 } }, new: { prices: { INR: 900, USD: 11 } } }] }),
    ).toEqual([{ at: "2026-09-28T10:00:00Z", by: "admin@x.io", inr: { from: 800, to: 900 }, usd: { from: null, to: 11 } }]);
  });
});

describe("coupons", () => {
  const raw = {
    coupons: [
      { code: "diwali20", description: "Festive", discount_type: "percent", percent_off: 20, amount_off: null, allowed_emails: [], show_in_list: true, applies_to_agents: [], currencies: [], flows: ["one_time"], starts_at: null, ends_at: null, max_redemptions: 100, max_per_user: 1, active: true, redemption_count: 7, version: 2 },
      { code: "VIP", discount_type: "fixed", amount_off: { INR: 200, USD: 3 }, allowed_emails: ["a@b.c", "d@e.f"], flows: ["autopay"], active: false },
    ],
  };

  it("reads each coupon and describes it", () => {
    const [festive, vip] = mapAdminCoupons(raw);
    expect(festive).toMatchObject({ code: "DIWALI20", percent: 20, redemptions: 7, maxRedemptions: 100, version: 2 });
    expect(couponSummary(festive!)).toBe("20% off");
    expect(couponAudience(festive!)).toBe("Everyone (shown to all)");
    expect(couponSummary(vip!)).toBe("₹200 off / $3 off");
    expect(couponAudience(vip!)).toBe("2 emails only");
  });

  const valid = { code: "diwali 20", kind: "percent", percent: "20", inr: "on", usd: "on", oneTime: "on", perUser: "1", active: "on" };

  it("builds a coupon, with every currency as the empty list", () => {
    const write = buildCouponWrite(form(valid));
    expect(write.ok && write.code).toBe("DIWALI20");
    expect(write.ok && write.body).toMatchObject({ discount_type: "percent", percent_off: 20, currencies: [], flows: ["one_time"], max_per_user: 1, active: true, show_in_list: false });
  });

  it("never lists a coupon meant for named emails", () => {
    const write = buildCouponWrite(form({ ...valid, emails: "Priya@Acme.in\nraj@acme.in", listed: "on" }));
    expect(write.ok && write.body).toMatchObject({ allowed_emails: ["priya@acme.in", "raj@acme.in"], show_in_list: false });
  });

  it("reports every problem at once", () => {
    const write = buildCouponWrite(form({ code: "x", kind: "fixed", emails: "nope", starts: "2026-10-10", ends: "2026-10-01", perUser: "0" }));
    expect(!write.ok && write.errors).toEqual([
      "A code needs at least 3 letters or digits.",
      "An amount coupon needs a ₹ or $ amount.",
      '"nope" is not an email address.',
      "Choose at least one currency.",
      "Choose one-time checkout, autopay, or both.",
      "The coupon ends before it starts.",
      "Uses per customer must be at least 1.",
    ]);
  });

  it("reads usage rows", () => {
    expect(mapRedemptions({ redemptions: [{ redeemed_at: "2026-09-28T10:00:00Z", email: "a@b.c", flow: "autopay", currency: "INR", discount: 160, amount_paid: 640 }] })).toEqual([
      { at: "2026-09-28T10:00:00Z", who: "a@b.c", flow: "Autopay", currency: "INR", saved: 160, paid: 640 },
    ]);
  });
});
