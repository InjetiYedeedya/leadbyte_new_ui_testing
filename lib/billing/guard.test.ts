import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These tests protect against a specific, expensive failure: shipping code that
 * charges a real card because the configured backend holds an `sk_live_` key.
 *
 * The guard must default to OFF. If someone deletes the env var, billing must
 * stop, not fall through to live.
 */

const ORIGINAL = process.env.LEADBYTE_BILLING_MODE;

vi.mock("@/lib/api/config", () => ({
  LEADBYTE_API_URL: "https://backend.example",
}));

const { assertBillingSafe, billingMode, isBillingAvailable, BillingDisabledError } =
  await import("./guard");

beforeEach(() => {
  delete process.env.LEADBYTE_BILLING_MODE;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.LEADBYTE_BILLING_MODE;
  else process.env.LEADBYTE_BILLING_MODE = ORIGINAL;
});

describe("billing guard", () => {
  it("is disabled when nothing is configured", () => {
    // The default must be OFF. The configured backend runs a live Stripe key.
    expect(billingMode()).toBe("disabled");
    expect(isBillingAvailable()).toBe(false);
  });

  it("throws rather than allowing a call through by default", () => {
    expect(() => assertBillingSafe()).toThrow(BillingDisabledError);
  });

  it("explains what to do in the error, not just that it failed", () => {
    try {
      assertBillingSafe();
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).toContain("sk_test_");
      expect((error as Error).message).toContain("LEADBYTE_BILLING_MODE=test");
    }
  });

  it("allows calls once test mode is explicitly set", () => {
    process.env.LEADBYTE_BILLING_MODE = "test";
    expect(billingMode()).toBe("test");
    expect(() => assertBillingSafe()).not.toThrow();
  });

  it("allows live only when live is explicitly chosen", () => {
    process.env.LEADBYTE_BILLING_MODE = "live";
    expect(() => assertBillingSafe()).not.toThrow();
  });

  it("does not treat a typo or unknown value as permission", () => {
    // "TEST_MODE", "yes", "1" and friends must not unlock real charges.
    for (const value of ["TEST_MODE", "yes", "1", "true", "enabled", " "]) {
      process.env.LEADBYTE_BILLING_MODE = value;
      expect(billingMode()).toBe("disabled");
      expect(() => assertBillingSafe()).toThrow(BillingDisabledError);
    }
  });

  it("accepts the value regardless of casing or padding", () => {
    process.env.LEADBYTE_BILLING_MODE = "  TeSt  ";
    expect(billingMode()).toBe("test");
  });
});
