import {
  PRICING_AGENTS,
  billedPrice,
  findAgent,
  totalForSelection,
  yearlySavingsForSelection,
} from "@/lib/data/pricing-catalog";
import { ALL_AGENT_IDS } from "@/lib/entitlements/agents";

/**
 * The pricing page's math, tested apart from the page itself — this repo
 * doesn't test pages, but this is exactly the kind of pure logic it does.
 */

describe("PRICING_AGENTS", () => {
  it("uses only ids the entitlement engine already recognises", () => {
    // The guardrail the catalog's own doc comment promises: if entitlements
    // ever renames or drops an id, this fails here rather than the pricing
    // page quietly drifting from what the entitlement engine can resolve.
    for (const agent of PRICING_AGENTS) {
      expect(ALL_AGENT_IDS).toContain(agent.id);
    }
  });

  it("has exactly one custom, priceless entry", () => {
    const custom = PRICING_AGENTS.filter((a) => a.isCustom);
    expect(custom).toHaveLength(1);
    expect(custom[0]!.monthlyPrice).toBeNull();
    expect(custom[0]!.wasPrice).toBeNull();
  });

  it("prices every non-custom agent", () => {
    for (const agent of PRICING_AGENTS) {
      if (agent.isCustom) continue;
      expect(agent.monthlyPrice).not.toBeNull();
      expect(agent.wasPrice).not.toBeNull();
    }
  });
});

describe("billedPrice", () => {
  it("is the plain monthly price when billed monthly", () => {
    const agent = findAgent("meta-ads")!;
    expect(billedPrice(agent, "monthly")).toBe(10);
  });

  it("matches the backend: the discounted monthly rate rounded, times twelve", () => {
    const agent = findAgent("meta-ads")!;
    // round($10 * 0.85) * 12 = $9 * 12 = $108. The backend charges this, so
    // showing $102 would quote less than the card is charged.
    expect(billedPrice(agent, "yearly")).toBe(108);
  });

  it("passes null straight through for the custom entry, in both periods", () => {
    const custom = findAgent("custom")!;
    expect(billedPrice(custom, "monthly")).toBeNull();
    expect(billedPrice(custom, "yearly")).toBeNull();
  });
});

describe("totalForSelection", () => {
  it("is zero for an empty selection", () => {
    expect(totalForSelection([], "monthly")).toBe(0);
    expect(totalForSelection([], "yearly")).toBe(0);
  });

  it("sums every real agent selected, monthly", () => {
    const realIds = PRICING_AGENTS.filter((a) => !a.isCustom).map((a) => a.id);
    // Ten $10/mo agents today (AEO joined 2026-09-25). Written as the exact expected figure, not a
    // re-derived formula, so a copy/paste price change is caught here.
    expect(totalForSelection(realIds, "monthly")).toBe(100);
  });

  it("sums every real agent selected, yearly, at the backend's rounded rate", () => {
    const realIds = PRICING_AGENTS.filter((a) => !a.isCustom).map((a) => a.id);
    expect(totalForSelection(realIds, "yearly")).toBe(1080);
  });

  it("does not let custom join the total, even when explicitly selected", () => {
    const withCustom = totalForSelection(["meta-ads", "custom"], "monthly");
    const withoutCustom = totalForSelection(["meta-ads"], "monthly");
    expect(withCustom).toBe(withoutCustom);
  });

  it("drops an unrecognised id rather than throwing", () => {
    expect(() => totalForSelection(["not-a-real-agent"], "monthly")).not.toThrow();
    expect(totalForSelection(["not-a-real-agent"], "monthly")).toBe(0);
    // And a good id beside a bad one still counts the good one.
    expect(totalForSelection(["meta-ads", "not-a-real-agent"], "monthly")).toBe(10);
  });
});

describe("yearlySavingsForSelection", () => {
  it("is zero for an empty selection", () => {
    expect(yearlySavingsForSelection([])).toBe(0);
  });

  it("is $12/yr for one $10/mo agent", () => {
    // $10 * 12 = $120 paid monthly across a year; $108 paid yearly. $12 saved.
    expect(yearlySavingsForSelection(["meta-ads"])).toBe(12);
  });

  it("is zero for a selection that is only the custom entry", () => {
    expect(yearlySavingsForSelection(["custom"])).toBe(0);
  });
});

describe("findAgent", () => {
  it("finds a known id", () => {
    expect(findAgent("google-ads")?.title).toBe("AI Automation for Google Ads");
  });

  it("returns undefined for an unknown id", () => {
    expect(findAgent("not-a-real-agent")).toBeUndefined();
  });
});
