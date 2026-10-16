import { render, screen } from "@testing-library/react";
import { OverviewIntro } from "./overview-intro";
import type { HeroStat } from "@/lib/data/overview-summary";

/**
 * The introduction above the four stacked cards.
 *
 * What is asserted is what must never regress: that the heading does not claim
 * a finding that has not happened, that nothing is hardcoded to one customer,
 * that no figure appears without a source, and that the scroll cue is a real
 * link to the first card.
 */
const stats: HeroStat[] = [
  { key: "pages", value: 17, noun: "page analysed", nounPlural: "pages analysed" },
  { key: "opportunities", value: 3, noun: "opportunity", nounPlural: "opportunities" },
  { key: "actions", value: 3, noun: "priority action", nounPlural: "priority actions" },
];

function intro(over: Partial<Parameters<typeof OverviewIntro>[0]> = {}) {
  return render(
    <OverviewIntro
      businessName="LeadByte"
      websiteLabel="leadbyte.ai"
      websiteHref="https://leadbyte.ai"
      stats={stats}
      analysed
      entranceClass="reveal-up"
      firstSectionId="summary"
      {...over}
    />,
  );
}

describe("OverviewIntro", () => {
  it("names the business in the heading and links its site", () => {
    intro();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Here's what we found about LeadByte.",
    );
    expect(screen.getByRole("link", { name: "leadbyte.ai" })).toHaveAttribute(
      "href",
      "https://leadbyte.ai",
    );
  });

  it("works for any customer, with nothing hardcoded", () => {
    // The same component must serve a dental practice as readily as a SaaS.
    intro({ businessName: "Acme Dental", websiteLabel: "acmedental.com", websiteHref: null });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Here's what we found about Acme Dental.",
    );
    // No href on record: the domain is still named, but not as a link.
    expect(screen.queryByRole("link", { name: "acmedental.com" })).toBeNull();
    expect(screen.getByText("acmedental.com")).toBeInTheDocument();
  });

  it("reads naturally when the profile has no business name yet", () => {
    // The page falls back to a generic name. Compared against the shared
    // constant, so the heading never reads "…about Your business."
    intro({ businessName: "Your business" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Here's what we found about your business.",
    );
  });

  it("omits the site line entirely when there is no domain on record", () => {
    // "No website on record" would be a defect notice, not a headline.
    intro({ websiteLabel: null });
    expect(screen.queryByText(/leadbyte\.ai/)).toBeNull();
  });

  it("does not claim a finding that has never happened", () => {
    intro({ analysed: false });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "We're getting to know LeadByte.",
    );
    expect(screen.queryByText(/pulled out the things worth/)).toBeNull();
    expect(screen.getByText(/Your first analysis is on the way/)).toBeInTheDocument();
  });

  it("renders each sourced figure once, and invents none", () => {
    intro();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText("pages analysed")).toBeInTheDocument();
    expect(screen.getByText("opportunities")).toBeInTheDocument();
    expect(screen.getByText("priority actions")).toBeInTheDocument();
    // The brief's "N insights ready" has no source anywhere in the app.
    expect(screen.queryByText(/insight/i)).toBeNull();
  });

  it("renders no figures strip when nothing is sourced", () => {
    intro({ stats: [] });
    expect(screen.queryByText("pages analysed")).toBeNull();
  });

  it("points the scroll cue at the first card as a real link", () => {
    intro();
    expect(screen.getByRole("link", { name: /scroll to explore/i })).toHaveAttribute(
      "href",
      "#summary",
    );
  });

  it("carries no banner, wash or floating-card illustration", () => {
    // These are the things a design review named as the problem. The hero
    // wash and the stacked-cards art were removed with this rewrite.
    const { container } = intro();
    expect(container.querySelector(".hero-wash")).toBeNull();
    expect(container.querySelector(".blur-3xl")).toBeNull();
    expect(container.querySelectorAll("rect")).toHaveLength(0);
  });

  it("draws no picture beside the copy", () => {
    // The signal-line drawing was removed on request; the intro is text only.
    const { container } = intro();
    expect(container.querySelector("svg[role='img']")).toBeNull();
  });

  it("shows the figures at every width, not only from sm up", () => {
    // They were hidden on phones while the drawing carried the same numbers.
    intro();
    const strip = screen.getByText("pages analysed").closest("dl");
    expect(strip?.className).not.toMatch(/hidden/);
  });
});
