import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A fake cookie jar, matching the style `gate.test.ts` already uses — the
 * cart is cookie-backed for the same reason the gate is (surviving a Stripe
 * redirect), so it is tested the same way: against a jar, not a request.
 */

const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  }),
}));

const { clearCart, getCart, setCart } = await import("./cart");

beforeEach(() => {
  jar.clear();
});

describe("cart", () => {
  it("is empty, monthly, for a business that has never set one", async () => {
    expect(await getCart("acme")).toEqual({ agentIds: [], billingPeriod: "monthly", currency: "USD" });
  });

  it("remembers a selection and its billing period", async () => {
    await setCart("acme", { agentIds: ["meta-ads", "google-ads"], billingPeriod: "yearly", currency: "USD" });
    expect(await getCart("acme")).toEqual({
      agentIds: ["meta-ads", "google-ads"],
      billingPeriod: "yearly", currency: "USD",
    });
  });

  it("survives being read twice — reading must not consume it", async () => {
    await setCart("acme", { agentIds: ["meta-ads"], billingPeriod: "monthly", currency: "USD" });
    expect(await getCart("acme")).toEqual({ agentIds: ["meta-ads"], billingPeriod: "monthly", currency: "USD" });
    expect(await getCart("acme")).toEqual({ agentIds: ["meta-ads"], billingPeriod: "monthly", currency: "USD" });
  });

  it("keeps carts isolated per business", async () => {
    await setCart("acme", { agentIds: ["meta-ads"], billingPeriod: "yearly", currency: "USD" });
    expect(await getCart("other")).toEqual({ agentIds: [], billingPeriod: "monthly", currency: "USD" });
  });

  it("clears on request", async () => {
    await setCart("acme", { agentIds: ["meta-ads"], billingPeriod: "monthly", currency: "USD" });
    await clearCart("acme");
    expect(await getCart("acme")).toEqual({ agentIds: [], billingPeriod: "monthly", currency: "USD" });
  });

  it("never stores custom, even if asked to", async () => {
    // The one entry with no fixed price. Written defensively as well as
    // read defensively, so a hand-edited cookie cannot smuggle it in either.
    await setCart("acme", { agentIds: ["meta-ads", "custom"], billingPeriod: "monthly", currency: "USD" });
    expect(await getCart("acme")).toEqual({ agentIds: ["meta-ads"], billingPeriod: "monthly", currency: "USD" });
  });

  it("drops an id that is not a real agent", async () => {
    await setCart("acme", { agentIds: ["meta-ads", "not-a-real-agent"], billingPeriod: "monthly", currency: "USD" });
    expect(await getCart("acme")).toEqual({ agentIds: ["meta-ads"], billingPeriod: "monthly", currency: "USD" });
  });

  it("treats a malformed cookie as an empty cart rather than throwing", async () => {
    jar.set("leadbyte_cart_acme", "{not json");
    expect(await getCart("acme")).toEqual({ agentIds: [], billingPeriod: "monthly", currency: "USD" });
  });

  it("falls back to monthly for an unrecognised billing period", async () => {
    jar.set("leadbyte_cart_acme", JSON.stringify({ agentIds: ["meta-ads"], billingPeriod: "weekly" }));
    expect((await getCart("acme")).billingPeriod).toBe("monthly");
  });

  it("reads a cart saved before currencies existed as USD", async () => {
    jar.set("leadbyte_cart_acme", JSON.stringify({ agentIds: ["meta-ads"], billingPeriod: "monthly" }));
    expect((await getCart("acme")).currency).toBe("USD");
  });

  it("remembers the currency and an applied coupon", async () => {
    await setCart("acme", { agentIds: ["meta-ads"], billingPeriod: "monthly", currency: "INR", couponCode: "DIWALI20" });
    expect(await getCart("acme")).toEqual({
      agentIds: ["meta-ads"],
      billingPeriod: "monthly",
      currency: "INR",
      couponCode: "DIWALI20",
    });
  });

  it("ignores a currency it does not sell in", async () => {
    jar.set("leadbyte_cart_acme", JSON.stringify({ agentIds: [], billingPeriod: "monthly", currency: "GBP" }));
    expect((await getCart("acme")).currency).toBe("USD");
  });
});
