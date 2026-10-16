import { render, screen } from "@testing-library/react";
import { NextStep } from "./next-step";

/**
 * The button walks one fixed reading order: the Overview tabs, then
 * Performance, Strategy and Agents. Each page names itself and the button
 * works out where that leads, so the order lives in one place.
 */

describe("NextStep", () => {
  it.each([
    ["/overview", "/overview/business-profile", "Business profile"],
    ["/overview/business-profile", "/overview/website-audit", "Website audit"],
    ["/overview/geo-analysis", "/analytics", "Performance"],
    ["/analytics", "/growth/strategy", "Strategy"],
    ["/growth/strategy", "/agents", "Agents"],
  ])("goes from %s to %s", (current, href, label) => {
    render(<NextStep current={current} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveTextContent(`Next${label}`);
  });

  it("renders nothing on the last page", () => {
    const { container } = render(<NextStep current="/agents" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a page outside the order", () => {
    const { container } = render(<NextStep current="/settings" />);
    expect(container).toBeEmptyDOMElement();
  });
});
