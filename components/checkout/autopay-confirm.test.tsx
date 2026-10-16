import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AutopayConfirm } from "./autopay-confirm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/razorpay-browser", () => ({ payWithRazorpay: vi.fn() }));

function renderConfirm(overrides: Partial<React.ComponentProps<typeof AutopayConfirm>> = {}) {
  const props: React.ComponentProps<typeof AutopayConfirm> = {
    agentId: "meta-ads",
    currency: "USD",
    first: 8,
    renewal: 10,
    offers: [],
    check: vi.fn(),
    startStripe: vi.fn().mockResolvedValue({ ok: false, message: "You already have autopay for this agent" }),
    startRazorpay: vi.fn(),
    confirmRazorpay: vi.fn(),
    ...overrides,
  };
  render(<AutopayConfirm {...props} />);
  return props;
}

describe("AutopayConfirm", () => {
  it("shows today's discounted month and the full price after", () => {
    renderConfirm();
    expect(screen.getByText("$8")).toBeInTheDocument();
    expect(screen.getByText("$10/mo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start autopay and pay $8" })).toBeInTheDocument();
  });

  it("uses a coupon's first-month amount for today", async () => {
    const check = vi.fn().mockResolvedValue({
      ok: true,
      quote: { code: "AUTO10", description: "", subtotal: 8, discount: 2, total: 6, lines: [], firstMonth: 6, renewal: 10 },
    });
    renderConfirm({ check });
    fireEvent.change(screen.getByLabelText("Coupon code"), { target: { value: "auto10" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Start autopay and pay $6" })).toBeInTheDocument());
    expect(check).toHaveBeenCalledWith("meta-ads", "USD", "auto10");
  });

  it("starts USD autopay on Stripe with the applied code, and shows a refusal", async () => {
    const props = renderConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Start autopay and pay $8" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("You already have autopay for this agent"));
    expect(props.startStripe).toHaveBeenCalledWith("meta-ads", "USD", "");
    expect(props.startRazorpay).not.toHaveBeenCalled();
  });

  it("starts INR autopay through Razorpay, not Stripe", async () => {
    const startRazorpay = vi.fn().mockResolvedValue({ ok: false, message: "Payments aren't switched on in this environment yet." });
    const props = renderConfirm({ currency: "INR", first: 640, renewal: 800, startRazorpay });
    fireEvent.click(screen.getByRole("button", { name: "Start autopay and pay ₹640" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("switched on"));
    expect(props.startStripe).not.toHaveBeenCalled();
  });
});
