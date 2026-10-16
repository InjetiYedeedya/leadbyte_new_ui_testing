import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CheckoutSummary } from "./checkout-summary";
import type { CouponCheck } from "@/lib/billing/coupons";

const LINES = [
  { id: "meta-ads", title: "Meta Ads", charge: 10 },
  { id: "google-ads", title: "Google Ads", charge: 10 },
];

const QUOTE: CouponCheck = {
  ok: true,
  quote: {
    code: "DIWALI20",
    description: "",
    subtotal: 20,
    discount: 4,
    total: 16,
    lines: [{ id: "meta-ads", discount: 2, final: 8 }, { id: "google-ads", discount: 2, final: 8 }],
    firstMonth: null,
    renewal: null,
  },
};

function renderSummary(check: (code: string) => Promise<CouponCheck>, offers = [] as { code: string; description: string; label: string; personal: boolean; endsAt: string | null }[]) {
  return render(
    <>
      <form id="pay" />
      <CheckoutSummary formId="pay" lines={LINES} currency="USD" periodSuffix="mo" savings={0} offers={offers} check={check} />
    </>,
  );
}

describe("CheckoutSummary", () => {
  it("totals the cart before any coupon", () => {
    renderSummary(vi.fn());
    expect(screen.getByText("$20/mo")).toBeInTheDocument();
  });

  it("applies a coupon: new total, per-line saving, and the code handed to the pay form", async () => {
    const check = vi.fn().mockResolvedValue(QUOTE);
    const { container } = renderSummary(check);
    fireEvent.change(screen.getByLabelText("Coupon code"), { target: { value: "diwali20" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.getByText(/applied/)).toBeInTheDocument());
    expect(check).toHaveBeenCalledWith("diwali20");
    expect(screen.getByText("$16/mo")).toBeInTheDocument();
    expect(screen.getAllByText("-$2 coupon")).toHaveLength(2);
    const hidden = container.querySelector('input[name="couponCode"]') as HTMLInputElement;
    expect(hidden.value).toBe("DIWALI20");
    expect(hidden.getAttribute("form")).toBe("pay");
  });

  it("says why a coupon was refused, and keeps the original total", async () => {
    renderSummary(vi.fn().mockResolvedValue({ ok: false, message: "This coupon has expired." }));
    fireEvent.change(screen.getByLabelText("Coupon code"), { target: { value: "OLD" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This coupon has expired."));
    expect(screen.getByText("$20/mo")).toBeInTheDocument();
  });

  it("applies an offered coupon in one click, and removes it again", async () => {
    renderSummary(vi.fn().mockResolvedValue(QUOTE), [{ code: "DIWALI20", description: "", label: "20% off", personal: true, endsAt: null }]);
    fireEvent.click(screen.getByRole("button", { name: /DIWALI20 · 20% off/ }));
    await waitFor(() => expect(screen.getByText(/applied/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByText("$20/mo")).toBeInTheDocument();
  });

  it("does not submit the pay form when Enter is pressed in the code box", () => {
    const check = vi.fn().mockResolvedValue(QUOTE);
    renderSummary(check);
    const box = screen.getByLabelText("Coupon code");
    fireEvent.change(box, { target: { value: "X1" } });
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    box.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
