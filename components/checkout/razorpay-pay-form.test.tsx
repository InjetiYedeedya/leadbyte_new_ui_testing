import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RazorpayPayForm } from "./razorpay-pay-form";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
const payWithRazorpay = vi.hoisted(() => vi.fn());
const clearRazorpayOverlay = vi.hoisted(() => vi.fn());
vi.mock("@/lib/razorpay-browser", () => ({ payWithRazorpay, clearRazorpayOverlay }));

const ORDER = { keyId: "rzp_test_1", orderId: "order_9", amount: 80000, prefill: {} };

function renderForm(start: ReturnType<typeof vi.fn>, confirm = vi.fn()) {
  render(
    <RazorpayPayForm
      id="pay"
      payLabel="Pay with Razorpay"
      start={start as unknown as ComponentProps<typeof RazorpayPayForm>["start"]}
      confirm={confirm as unknown as ComponentProps<typeof RazorpayPayForm>["confirm"]}
    >
      <input name="companyName" defaultValue="Acme" aria-label="Company" />
    </RazorpayPayForm>,
  );
  return { confirm };
}

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  clearRazorpayOverlay.mockReset();
  payWithRazorpay.mockReset();
});

describe("RazorpayPayForm", () => {
  it("shows every problem the server found, and opens nothing", async () => {
    renderForm(vi.fn().mockResolvedValue({ ok: false, errors: ["Enter a valid 6-digit PIN code.", "Company name is required."] }));
    fireEvent.click(screen.getByRole("button", { name: "Pay with Razorpay" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("PIN code"));
    expect(screen.getByRole("alert")).toHaveTextContent("Company name is required.");
    expect(payWithRazorpay).not.toHaveBeenCalled();
  });

  it("sends the form, pays the order it gets back, and confirms before moving on", async () => {
    const start = vi.fn().mockResolvedValue({ ok: true, order: ORDER, description: "Meta Ads" });
    payWithRazorpay.mockResolvedValue({ razorpay_payment_id: "pay_1", razorpay_order_id: "order_9", razorpay_signature: "sig" });
    const { confirm } = renderForm(start, vi.fn().mockResolvedValue({ ok: true, orderId: "ORD-1", agentIds: ["meta-ads"] }));
    fireEvent.click(screen.getByRole("button", { name: "Pay with Razorpay" }));
    // Straight to the agents it unlocked, with Razorpay's backdrop cleared.
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/agents?unlocked=meta-ads"));
    expect(clearRazorpayOverlay).toHaveBeenCalled();
    expect((start.mock.calls[0]![0] as FormData).get("companyName")).toBe("Acme");
    expect(payWithRazorpay).toHaveBeenCalledWith(expect.objectContaining({ key: "rzp_test_1", order_id: "order_9", currency: "INR" }));
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ razorpay_signature: "sig" }));
  });

  it("does nothing more when the popup is closed without paying", async () => {
    payWithRazorpay.mockResolvedValue(null);
    const { confirm } = renderForm(vi.fn().mockResolvedValue({ ok: true, order: ORDER, description: "" }));
    fireEvent.click(screen.getByRole("button", { name: "Pay with Razorpay" }));
    await waitFor(() => expect(payWithRazorpay).toHaveBeenCalled());
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says when the payment could not be confirmed", async () => {
    payWithRazorpay.mockResolvedValue({ razorpay_payment_id: "p", razorpay_order_id: "o", razorpay_signature: "s" });
    renderForm(
      vi.fn().mockResolvedValue({ ok: true, order: ORDER, description: "" }),
      vi.fn().mockResolvedValue({ ok: false, message: "We couldn't confirm the payment yet." }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Pay with Razorpay" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("couldn't confirm"));
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
