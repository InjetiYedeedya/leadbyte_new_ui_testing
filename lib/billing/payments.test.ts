import { ApiError, ApiTimeoutError } from "@/lib/api/client";

const apiRequest = vi.hoisted(() => vi.fn());
const assertBillingSafe = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, apiRequest };
});
vi.mock("@/lib/billing/guard", () => ({ assertBillingSafe }));

const {
  createRazorpayOrder,
  createRazorpaySubscription,
  createStripeSubscription,
  verifyRazorpayPayment,
  verifyRazorpaySubscription,
  verifyStripeSubscription,
} = await import("./payments");
const { BillingCallError, billingErrorMessage } = await import("./billing-call");

const ORDER_INPUT = {
  email: "priya@acme.in",
  companyName: "Acme",
  billingFirstName: "Priya",
  billingLastName: "S",
  address: "1 MG Road",
  zipCode: "560001",
  gstin: "",
  billingPeriod: "monthly" as const,
  items: [{ id: "meta-ads", title: "Meta Ads", charge: 800 }],
  expectedTotal: 800,
};

beforeEach(() => {
  apiRequest.mockReset();
  assertBillingSafe.mockReset();
});

describe("every payment call", () => {
  it("checks billing is safe before sending anything", async () => {
    assertBillingSafe.mockImplementation(() => {
      throw new Error("billing disabled");
    });
    await expect(createRazorpayOrder(ORDER_INPUT)).rejects.toThrow("billing disabled");
    await expect(createStripeSubscription({ agentId: "x", currency: "USD", expectedAmount: 8, expectedRenewal: 10 }, "https://a")).rejects.toThrow("billing disabled");
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe("createRazorpayOrder", () => {
  it("sends the INR contract and returns what the popup needs", async () => {
    apiRequest.mockResolvedValue({ key_id: "rzp_test_1", razorpay_order_id: "order_9", amount: 80000, prefill: { email: "priya@acme.in" } });
    const order = await createRazorpayOrder({ ...ORDER_INPUT, couponCode: "DIWALI20" });
    expect(order).toEqual({ keyId: "rzp_test_1", orderId: "order_9", amount: 80000, prefill: { email: "priya@acme.in" } });
    const [path, options] = apiRequest.mock.calls[0]!;
    expect(path).toBe("/razorpay/create-order");
    expect(options.body).toMatchObject({
      currency: "INR",
      country: "IN",
      expected_total: 800,
      coupon_code: "DIWALI20",
      cart_items: [{ id: "meta-ads", title: "Meta Ads", expected_price: 800 }],
    });
    expect("gstin" in options.body).toBe(false);
  });

  it("refuses an answer with no order in it", async () => {
    apiRequest.mockResolvedValue({ success: true });
    await expect(createRazorpayOrder(ORDER_INPUT)).rejects.toBeInstanceOf(BillingCallError);
  });

  it("reads a changed price as a refusal, with the customer's message", async () => {
    apiRequest.mockRejectedValue(new ApiError(409, "PRICE_CHANGED", "Price changed"));
    const error = await createRazorpayOrder(ORDER_INPUT).catch((e: unknown) => e);
    expect((error as InstanceType<typeof BillingCallError>).refusal).toBe("price-changed");
    expect(billingErrorMessage(error, "x")).toMatch(/price was just updated/);
  });

  it("says a timeout may still have gone through, rather than that it failed", async () => {
    apiRequest.mockRejectedValue(new ApiTimeoutError("/razorpay/create-order", 30000));
    const error = await createRazorpayOrder(ORDER_INPUT).catch((e: unknown) => e);
    expect(billingErrorMessage(error, "x")).toMatch(/taking longer than usual/);
  });
});

describe("autopay", () => {
  const INPUT = { agentId: "meta-ads", currency: "USD" as const, expectedAmount: 8, expectedRenewal: 10 };

  it("sends the first month and the renewal, and returns Stripe's page", async () => {
    apiRequest.mockResolvedValue({ session_url: "https://checkout.stripe.com/s" });
    expect(await createStripeSubscription(INPUT, "https://app.leadbyte.ai")).toEqual({ sessionUrl: "https://checkout.stripe.com/s" });
    expect(apiRequest.mock.calls[0]![1].body).toEqual({
      agent_id: "meta-ads",
      currency: "USD",
      expected_amount: 8,
      expected_renewal_amount: 10,
      success_url: "https://app.leadbyte.ai/autopay-success",
    });
  });

  it("keeps the backend's code for an agent already on autopay", async () => {
    apiRequest.mockRejectedValue(new ApiError(409, "ALREADY_SUBSCRIBED", "You already have autopay for this agent"));
    const error = (await createRazorpaySubscription({ ...INPUT, currency: "INR" }).catch((e: unknown) => e)) as InstanceType<typeof BillingCallError>;
    expect(error.code).toBe("ALREADY_SUBSCRIBED");
    expect(billingErrorMessage(error, "x")).toBe("You already have autopay for this agent");
  });

  it("reads Stripe's return as started or still processing", async () => {
    apiRequest.mockResolvedValueOnce({ status: "processing" });
    expect(await verifyStripeSubscription("cs_1")).toEqual({ status: "processing" });
    apiRequest.mockResolvedValueOnce({ status: "active", next_charge_at: "2026-10-28T00:00:00Z", renewal_amount: 10 });
    expect(await verifyStripeSubscription("cs_1")).toEqual({ status: "active", nextChargeAt: "2026-10-28T00:00:00Z", renewalAmount: 10 });
  });
});

describe("verification refusals", () => {
  const PROOF = { razorpay_payment_id: "pay_1", razorpay_order_id: "order_1", razorpay_signature: "sig" };

  it("does not pass a Razorpay payment the backend refused with a 200", async () => {
    apiRequest.mockResolvedValueOnce({ success: false, error: "Invalid signature" });
    const error = await verifyRazorpayPayment(PROOF).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BillingCallError);
    expect(billingErrorMessage(error, "x")).toBe("Invalid signature");
  });

  it("does not pass a payment marked verified: false", async () => {
    apiRequest.mockResolvedValueOnce({ success: true, verified: false });
    await expect(verifyRazorpayPayment(PROOF)).rejects.toBeInstanceOf(BillingCallError);
  });

  it("does not pass a refused Razorpay subscription", async () => {
    apiRequest.mockResolvedValueOnce({ success: false });
    await expect(verifyRazorpaySubscription(PROOF)).rejects.toBeInstanceOf(BillingCallError);
  });

  it("does not read a failed Stripe subscription as active", async () => {
    apiRequest.mockResolvedValueOnce({ status: "incomplete" });
    await expect(verifyStripeSubscription("cs_1")).rejects.toBeInstanceOf(BillingCallError);
    apiRequest.mockResolvedValueOnce({ success: false, error: "No such session" });
    await expect(verifyStripeSubscription("cs_1")).rejects.toBeInstanceOf(BillingCallError);
  });
});
