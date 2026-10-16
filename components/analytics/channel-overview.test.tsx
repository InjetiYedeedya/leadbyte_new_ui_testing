import { render, screen } from "@testing-library/react";
import { ChannelOverview } from "./channel-overview";
import { buildTimeline } from "@/lib/data/analytics-timeline";

describe("ChannelOverview", () => {
  it("keeps source totals and the missing-currency note without manufacturing absent channels", () => {
    render(<ChannelOverview channels={[{
      id: "ads", title: "Paid advertising", source: "Google Ads", description: "Campaign spend",
      stats: [{ label: "Ad spend", value: "12.34", note: "Currency not supplied by source." }],
      bandKey: "spend", exploreLabel: "Explore campaigns", exploreHref: null,
    }]} timeline={buildTimeline([])} />);
    expect(screen.getByText("12.34")).toBeTruthy();
    expect(screen.getByText("Currency not supplied by source.")).toBeTruthy();
    expect(screen.queryByText("Website traffic")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    // No detail view means no link to one.
    expect(screen.queryByRole("link")).toBeNull();
  });

  /**
   * The link is an in-page anchor at the explorer's own tab, never an invented
   * URL for the customer's Analytics or ad account.
   */
  it("links a card to the explore page for its own source", () => {
    render(<ChannelOverview channels={[{
      id: "search", title: "Search visibility", source: "Search Console", description: "Search",
      stats: [{ label: "Search clicks", value: "68" }],
      bandKey: "search", exploreLabel: "Explore search",
      exploreHref: "/analytics/explore?source=search",
    }]} timeline={buildTimeline([])} />);
    expect(screen.getByRole("link", { name: /Explore search/ }).getAttribute("href"))
      .toBe("/analytics/explore?source=search");
  });

  it("breaks the chart at absent dates while retaining genuine zero values", () => {
    const timeline = buildTimeline([
      { key: "sessions", label: "Sessions", format: "count", rows: [
        { date: "2026-09-01", value: 10 }, { date: "2026-09-02", value: 0 },
        { date: "2026-09-04", value: 5 }, { date: "2026-09-05", value: 7 },
      ] },
      { key: "search", label: "Search clicks", format: "count", rows: [{ date: "2026-09-03", value: 2 }] },
    ]);
    render(<ChannelOverview channels={[{
      id: "analytics", title: "Website traffic", source: "Google Analytics", description: "Visits",
      stats: [{ label: "Sessions", value: "22" }], bandKey: "sessions",
      exploreLabel: "Explore website", exploreHref: "/analytics/explore?source=analytics",
    }]} timeline={timeline} />);
    const chart = screen.getByRole("img", { name: /Sessions.*4 reported days/ });
    expect(chart.querySelectorAll("polyline")).toHaveLength(2);
    expect(chart.textContent).toContain("2026-09-02: 0");
    expect(chart.textContent).toContain("2026-09-03: No data");
  });

  it("renders an unknown total as a dash rather than a zero", () => {
    render(<ChannelOverview channels={[{
      id: "analytics", title: "Website traffic", source: "Google Analytics", description: "Visits",
      stats: [{ label: "Sessions", value: null }], bandKey: "sessions",
      exploreLabel: "Explore website", exploreHref: null,
    }]} timeline={buildTimeline([])} />);
    expect(screen.getByText("—")).toBeTruthy();
  });
});
