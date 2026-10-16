import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentPricingBoard } from "./agent-pricing-board";
import type { PricingAgent } from "@/lib/data/pricing-catalog";
import { catalogSheet } from "@/lib/billing/price-sheet";

/**
 * The one interactive piece of the pricing page — selection, the billing
 * toggle, and getting a real selection to checkout.
 */

const AGENTS: PricingAgent[] = [
  {
    id: "meta-ads",
    title: "AI Automation for Meta Ads",
    tag: "Popular",
    description: "Runs Meta campaigns.",
    features: ["Budget & bid control"],
    monthlyPrice: 10,
    wasPrice: 100,
    isCustom: false,
  },
  {
    id: "custom",
    title: "Custom AI",
    tag: "Premium",
    description: "A workflow built around what you need.",
    features: ["Dedicated strategist"],
    monthlyPrice: null,
    wasPrice: null,
    isCustom: true,
  },
];

describe("AgentPricingBoard", () => {
  it("renders every agent's title, tag and features", () => {
    render(<AgentPricingBoard sheet={catalogSheet(AGENTS)} signedIn={false} />);
    expect(screen.getByText("AI Automation for Meta Ads")).toBeTruthy();
    expect(screen.getByText("Popular")).toBeTruthy();
    expect(screen.getByText("Budget & bid control")).toBeTruthy();
    expect(screen.getByText("Custom AI")).toBeTruthy();
  });

  it("shows no summary or CTA until something is selected", () => {
    render(<AgentPricingBoard sheet={catalogSheet(AGENTS)} signedIn={false} />);
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it("adding an agent shows the summary; removing it hides it again", async () => {
    const user = userEvent.setup();
    render(<AgentPricingBoard sheet={catalogSheet(AGENTS)} signedIn={true} />);

    await user.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(screen.getByText("1 agent selected")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Remove from cart" }));
    expect(screen.queryByText("1 agent selected")).toBeNull();
  });

  it("switching to Annually recomputes the total and shows the savings line", async () => {
    const user = userEvent.setup();
    render(<AgentPricingBoard sheet={catalogSheet(AGENTS)} signedIn={true} />);

    await user.click(screen.getByRole("button", { name: "Add to cart" }));
    // "$10/mo" appears twice — once on the card, once in the summary — since
    // there is only one agent selected at that price.
    expect(screen.getAllByText("$10/mo")).toHaveLength(2);

    await user.click(screen.getByRole("radio", { name: "Annually" }));
    expect(screen.getAllByText("$108/yr")).toHaveLength(2);
    expect(screen.getByText("Save $12/yr with annual billing.")).toBeTruthy();

    await user.click(screen.getByRole("radio", { name: "Monthly" }));
    expect(screen.queryByText(/Save \$/)).toBeNull();
  });

  it("never gives Custom AI an Add/Remove control, and it never joins the total", async () => {
    const user = userEvent.setup();
    render(<AgentPricingBoard sheet={catalogSheet(AGENTS)} signedIn={false} />);

    expect(screen.getAllByRole("button", { name: "Add to cart" })).toHaveLength(1);
    expect(screen.getByText("Custom pricing")).toBeTruthy();

    // Selecting the one real agent still totals to just that agent's price —
    // the card's own price and the summary total read the same number.
    await user.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(screen.getAllByText("$10/mo")).toHaveLength(2);
  });

  it("signed out: offers /signup instead of a checkout form", async () => {
    const user = userEvent.setup();
    render(<AgentPricingBoard sheet={catalogSheet(AGENTS)} signedIn={false} />);
    await user.click(screen.getByRole("button", { name: "Add to cart" }));

    const link = screen.getByRole("link", { name: "Sign up to get started" });
    expect(link.getAttribute("href")).toBe("/signup");
    // Nothing here should look like it submits — there is no account yet
    // to attach a cart to.
    expect(screen.queryByRole("button", { name: "Proceed to checkout" })).toBeNull();
  });

  it("signed in: offers a real Continue-to-checkout form carrying the selection", async () => {
    const user = userEvent.setup();
    const { container } = render(<AgentPricingBoard sheet={catalogSheet(AGENTS)} signedIn={true} />);
    await user.click(screen.getByRole("button", { name: "Add to cart" }));

    const submit = screen.getByRole("button", { name: "Proceed to checkout" });
    const form = submit.closest("form");
    expect(form).toBeTruthy();

    // The selection and billing period ride along as hidden fields, not
    // positional arguments — see startCheckout's own doc comment for why.
    const agentIds = form!.querySelector<HTMLInputElement>('input[name="agentIds"]');
    const billingPeriod = form!.querySelector<HTMLInputElement>('input[name="billingPeriod"]');
    expect(JSON.parse(agentIds!.value)).toEqual(["meta-ads"]);
    expect(billingPeriod!.value).toBe("monthly");

    // container is asserted against, not just screen, so a stray second
    // form elsewhere on the page would not hide a duplicate.
    expect(container.querySelectorAll("form")).toHaveLength(1);
  });

  it("carries the yearly period into the hidden field once toggled", async () => {
    const user = userEvent.setup();
    render(<AgentPricingBoard sheet={catalogSheet(AGENTS)} signedIn={true} />);
    await user.click(screen.getByRole("button", { name: "Add to cart" }));
    await user.click(screen.getByRole("radio", { name: "Annually" }));

    const submit = screen.getByRole("button", { name: "Proceed to checkout" });
    const billingPeriod = submit
      .closest("form")!
      .querySelector<HTMLInputElement>('input[name="billingPeriod"]');
    expect(billingPeriod!.value).toBe("yearly");
  });
});
