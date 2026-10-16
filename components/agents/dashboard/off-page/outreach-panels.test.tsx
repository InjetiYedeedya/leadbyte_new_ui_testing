import { render, screen } from "@testing-library/react";
import { OutreachPanels } from "./outreach-panels";
import { CompetitorsPanel } from "./competitors-panel";

/**
 * The outreach panels read the record the day the backend can find it. What
 * matters on screen: rates against the right step, zeros drawn as zeros, and
 * a shrinking backlink profile said plainly in the warn tone.
 */

describe("OutreachPanels", () => {
  it("shows the three cards and the rate from the step before each funnel step", () => {
    render(<OutreachPanels outreach={{ sent: 200, replies: 24, before: 64, now: 78, won: 6 }} />);

    expect(screen.getByText("Emails sent")).toBeInTheDocument();
    expect(screen.getByText("12%")).toBeInTheDocument();
    expect(screen.getByText("24 replies received")).toBeInTheDocument();
    expect(screen.getByText("3.0% of everything sent")).toBeInTheDocument();
    expect(screen.getByText("12% of emails sent got a reply")).toBeInTheDocument();
    expect(screen.getByText("25% of replies became a link")).toBeInTheDocument();
    expect(screen.getByText("+14 (+22%) since the campaign started")).toBeInTheDocument();
  });

  it("draws an all-zero record as a funnel at zero, not an empty state", () => {
    render(<OutreachPanels outreach={{ sent: 0, replies: 0, before: 0, now: 0, won: 0 }} />);

    expect(screen.getByText("Outreach funnel")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Emails sent: 0" })).toBeInTheDocument();
    expect(screen.getByText(/no outreach has gone out/)).toBeInTheDocument();
    expect(screen.getByText("No change since the campaign started")).toBeInTheDocument();
  });

  it("says a dip in the warn tone", () => {
    render(<OutreachPanels outreach={{ sent: 10, replies: 1, before: 80, now: 76, won: 0 }} />);

    const line = screen.getByText("−4 (−5.0%) since the campaign started");
    expect(line.className).toContain("text-warn");
  });

  it("prints a missing figure as a dash, never 0", () => {
    render(<OutreachPanels outreach={{ sent: 10, replies: null, before: null, now: null, won: null }} />);

    expect(screen.getByText("no reply count recorded")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Replies: not recorded" })).toBeInTheDocument();
    expect(screen.getByText("This record has no backlink counts yet.")).toBeInTheDocument();
  });
});

describe("CompetitorsPanel", () => {
  it("says the read failed rather than that there are none", () => {
    render(<CompetitorsPanel outcome={{ ok: false, error: "500", rows: [] }} competitors={[]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your competitors");
  });

  it("lists competitors with a dash for a missing figure", () => {
    render(
      <CompetitorsPanel
        outcome={{ ok: true, error: null, rows: [] }}
        competitors={[{ name: "rival.com", authorityScore: 41, referringDomains: null }]}
      />,
    );
    expect(screen.getByText("rival.com")).toBeInTheDocument();
    expect(screen.getByText("41")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
