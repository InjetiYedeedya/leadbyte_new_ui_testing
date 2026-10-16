import { ApiError, ApiTimeoutError } from "@/lib/api/client";
import type { PricingAgent } from "@/lib/data/pricing-catalog";

const apiRequest = vi.hoisted(() => vi.fn());
const assertBillingSafe = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, apiRequest };
});

// This module's OWN job is never calling Stripe when billing is disabled —
// that rule lives in guard.ts and is tested there (`guard.test.ts`). Mocked
// here as a no-op so these tests exercise the request/response handling
// instead of re-testing the guard.
vi.mock("@/lib/billing/guard", () => ({ assertBillingSafe }));

const { createStripeCheckoutSession, verifyStripePayment, StripeCheckoutError } = await import(
  "./stripe-checkout"
);

const AGENT: PricingAgent = {
  id: "meta-ads",
  title: "AI Automation for Meta Ads",
  tag: "Popular",
  description: "",
  features: [],
  monthlyPrice: 10,
  wasPrice: 100,
  isCustom: false,
};

beforeEach(() => {
  apiRequest.mockReset();
  assertBillingSafe.mockReset();
});

const INPUT_BASE = {
  companyName: "Acme Inc",
  ein: "12-3456789",
  billingFirstName: "Jane",
  billingLastName: "Doe",
  address: "1 Main St",
  zipCode: "90210",
  email: "jane@acme.com",
  userId: "uid",
  items: [{ id: "meta-ads", title: "AI Automation for Meta Ads", monthlyPrice: 10, charge: 10 }],
  currency: "USD" as const,
  billingPeriod: "monthly" as const,
  amount: 10,
  baseUrl: "https://app.leadbyte.ai",
};

describe("createStripeCheckoutSession", () => {
  it("sends the coupon when one was applied, and nothing when not", async () => {
    apiRequest.mockResolvedValue({ success: true, session_url: "https://checkout.stripe.com/x", order_id: "ORD-1" });
    await createStripeCheckoutSession({ ...INPUT_BASE, couponCode: "DIWALI20" });
    expect(apiRequest.mock.calls[0]![1].body.coupon_code).toBe("DIWALI20");
    await createStripeCheckoutSession(INPUT_BASE);
    expect("coupon_code" in apiRequest.mock.calls[1]![1].body).toBe(false);
  });

  it("reads a changed price as a refusal the customer acts on", async () => {
    apiRequest.mockRejectedValue(new ApiError(409, "PRICE_CHANGED", "Price changed"));
    const error = await createStripeCheckoutSession(INPUT_BASE).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StripeCheckoutError);
    expect((error as InstanceType<typeof StripeCheckoutError>).refusal).toBe("price-changed");
    expect((error as InstanceType<typeof StripeCheckoutError>).userMessage).toMatch(/price was just updated/);
  });

  it("reads a refused coupon as one to remove", async () => {
    apiRequest.mockRejectedValue(new ApiError(400, "COUPON_EXPIRED", "This coupon has expired"));
    const error = (await createStripeCheckoutSession(INPUT_BASE).catch((e: unknown) => e)) as InstanceType<typeof StripeCheckoutError>;
    expect(error.refusal).toBe("coupon");
    expect(error.userMessage).toBe("This coupon has expired. The coupon was removed.");
  });

  const INPUT = {
    companyName: "Acme Inc",
    ein: "12-3456789",
    billingFirstName: "Jane",
    billingLastName: "Doe",
    address: "1 Main St",
    zipCode: "90210",
    email: "jane@acme.com",
    userId: "uid",
    items: [{ id: AGENT.id, title: AGENT.title, monthlyPrice: 10, charge: 10 }],
    currency: "USD" as const,
    billingPeriod: "monthly" as const,
    amount: 10,
    baseUrl: "https://app.leadbyte.ai",
  };

  it("checks billing is safe before building anything", async () => {
    assertBillingSafe.mockImplementation(() => {
      throw new Error("billing disabled");
    });
    await expect(createStripeCheckoutSession(INPUT)).rejects.toThrow("billing disabled");
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("sends the exact contract the backend expects", async () => {
    apiRequest.mockResolvedValue({ success: true, session_url: "https://checkout.stripe.com/x", order_id: "ORD-1" });

    await createStripeCheckoutSession(INPUT);

    expect(apiRequest).toHaveBeenCalledWith(
      "/stripe/create-checkout-session",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          company_name: "Acme Inc",
          ein: "12-3456789",
          billing_first_name: "Jane",
          billing_last_name: "Doe",
          address: "1 Main St",
          zip_code: "90210",
          email: "jane@acme.com",
          user_id: "uid",
          billing_period: "monthly",
          amount: 10,
          base_url: "https://app.leadbyte.ai",
          success_url: "https://app.leadbyte.ai/payment-success",
          cart_items: [{ id: "meta-ads", title: "AI Automation for Meta Ads", price: 10, expected_price: 10 }],
          currency: "USD",
          expected_total: 10,
        }),
      }),
    );
  });

  it("returns the session url and order id on success", async () => {
    apiRequest.mockResolvedValue({
      success: true,
      session_url: "https://checkout.stripe.com/x",
      order_id: "ORD-1",
    });
    const result = await createStripeCheckoutSession(INPUT);
    expect(result).toEqual({ sessionUrl: "https://checkout.stripe.com/x", orderId: "ORD-1" });
  });

  it("marks a timeout as timedOut rather than a plain failure", async () => {
    apiRequest.mockRejectedValue(new ApiTimeoutError("/stripe/create-checkout-session", 30000));
    const error = await createStripeCheckoutSession(INPUT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StripeCheckoutError);
    expect((error as InstanceType<typeof StripeCheckoutError>).timedOut).toBe(true);
  });

  it("carries the backend's own error text to the caller", async () => {
    apiRequest.mockRejectedValue(new ApiError(400, undefined, "Missing required field: ein"));
    const error = await createStripeCheckoutSession(INPUT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StripeCheckoutError);
    expect((error as InstanceType<typeof StripeCheckoutError>).userMessage).toBe(
      "Missing required field: ein",
    );
  });

  it("treats success:false in a 200 response as a failure, not a session", async () => {
    apiRequest.mockResolvedValue({ success: false, error: "Card processing unavailable" });
    const error = await createStripeCheckoutSession(INPUT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StripeCheckoutError);
    expect((error as InstanceType<typeof StripeCheckoutError>).userMessage).toBe(
      "Card processing unavailable",
    );
  });
});

describe("verifyStripePayment", () => {
  const INPUT = { sessionId: "cs_123", orderId: "ORD-1" };

  it("checks billing is safe before calling anything", async () => {
    assertBillingSafe.mockImplementation(() => {
      throw new Error("billing disabled");
    });
    await expect(verifyStripePayment(INPUT)).rejects.toThrow("billing disabled");
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("reports a completed payment with every field the success screen needs", async () => {
    apiRequest.mockResolvedValue({
      success: true,
      transaction_id: "txn_1",
      order_id: "ORD-1",
      amount_paid: 10,
      billing_period: "monthly",
      subscription_end_date: "2026-10-18T00:00:00Z",
    });

    expect(await verifyStripePayment(INPUT)).toEqual({
      status: "completed",
      transactionId: "txn_1",
      orderId: "ORD-1",
      amountPaid: 10,
      billingPeriod: "monthly",
      subscriptionEndDate: "2026-10-18T00:00:00Z",
    });
  });

  it("reports still-processing distinctly from completed or failed", async () => {
    apiRequest.mockResolvedValue({ success: true, status: "processing", order_id: "ORD-1" });
    expect(await verifyStripePayment(INPUT)).toEqual({ status: "processing", orderId: "ORD-1" });
  });

  it("throws with the backend's own explanation when payment was not completed", async () => {
    apiRequest.mockResolvedValue({
      success: false,
      error: "Payment was not completed",
      order_id: "ORD-1",
    });
    const error = await verifyStripePayment(INPUT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StripeCheckoutError);
    expect((error as InstanceType<typeof StripeCheckoutError>).userMessage).toBe(
      "Payment was not completed",
    );
  });

  it("marks a timeout as timedOut", async () => {
    apiRequest.mockRejectedValue(new ApiTimeoutError("/stripe/verify-payment", 30000));
    const error = await verifyStripePayment(INPUT).catch((e: unknown) => e);
    expect((error as InstanceType<typeof StripeCheckoutError>).timedOut).toBe(true);
  });
});
