import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mapAdCampaigns } from "@/lib/data/dashboard/ads-campaigns";
import { AdsInsightsView } from "./ads-insights-view";

// jsdom has no <dialog> behaviour; give it just enough to open and close.
beforeAll(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

const CAMPAIGNS = mapAdCampaigns(
  [
    { campaign_name: "Paused big spender", status: "PAUSED", cost: 900, impressions: 9000, clicks: 90, ctr: 0.01 },
    { campaign_name: "Live small", status: "ENABLED", cost: 10, impressions: 1000, clicks: 50, ctr: 0.05 },
    { campaign_name: "Live big", status: "ENABLED", cost: 500, impressions: 5000, clicks: 100, ctr: 0.02, access_token: "x" },
  ],
  "google",
);

function setup() {
  render(
    <AdsInsightsView
      platform="google"
      icon={null}
      title="Google Ads — Campaign Insights"
      subtitle="Search and display campaign performance"
      campaigns={CAMPAIGNS}
      dailyByCampaign={{}}
    />,
  );
}

/** Campaign names, in table order. */
function tableOrder(): string[] {
  const table = screen.getByRole("table");
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");
}

describe("AdsInsightsView", () => {
  it("opens on the table in its own order: completed, then running, then paused (2026-10-13)", () => {
    setup();
    expect(screen.getByRole("button", { name: "Data" })).toHaveAttribute("aria-pressed", "true");
    // None of these has a start date, so running keeps the feed's order.
    expect(tableOrder()).toEqual(["Live small", "Live big", "Paused big spender"]);
    // No column is the sort until one is picked.
    expect(screen.getByRole("columnheader", { name: "Cost" })).toHaveAttribute("aria-sort", "none");
  });

  it("sorts by a column once its header is picked, running campaigns still first", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Cost" }));
    expect(screen.getByRole("columnheader", { name: "Cost" })).toHaveAttribute("aria-sort", "descending");
    expect(tableOrder()).toEqual(["Live big", "Live small", "Paused big spender"]);
    await userEvent.click(screen.getByRole("button", { name: "Cost" }));
    expect(screen.getByRole("columnheader", { name: "Cost" })).toHaveAttribute("aria-sort", "ascending");
    expect(tableOrder()).toEqual(["Live small", "Live big", "Paused big spender"]);
  });

  it("switches to the charts and into one campaign's trend and back", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Visualization" }));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Spend by campaign")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Live big" }));
    expect(screen.getByRole("button", { name: "Back to overview" })).toHaveFocus();
    expect(screen.getByText("No daily history for this campaign")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Back to overview" }));
    expect(screen.getByText("Spend by campaign")).toBeInTheDocument();
  });

  it("says so when the filters match nothing", async () => {
    setup();
    await userEvent.type(screen.getByRole("searchbox"), "nothing like this");
    expect(screen.getByText("No campaigns match your filters.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Clear filters/ }));
    expect(tableOrder()).toHaveLength(3);
  });

  it("opens a row's drawer without any credential in its raw fields", async () => {
    setup();
    await userEvent.click(screen.getByText("Live big"));
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(within(dialog).getByText("All data from database")).toBeInTheDocument();
    expect(within(dialog).queryByText("access_token")).toBeNull();
    expect(within(dialog).getByText("campaign_name")).toBeInTheDocument();
  });
});
