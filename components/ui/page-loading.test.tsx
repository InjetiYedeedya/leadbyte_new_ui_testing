import { render, screen } from "@testing-library/react";
import { PageLoading } from "./page-loading";

/**
 * The one thing on screen while a page loads, so what it claims matters: it
 * names the screen that is coming, announces itself, and shows no figure it
 * does not have.
 */

describe("PageLoading", () => {
  it("names the screen that is loading, so the wait is identifiable", () => {
    render(<PageLoading title="Website audit" />);
    expect(screen.getByRole("heading", { name: "Loading website audit…" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading website audit…");
  });

  it("keeps an acronym's capitals when it goes into the sentence", () => {
    render(<PageLoading title="GEO analysis" />);
    expect(screen.getByRole("heading")).toHaveTextContent("Loading GEO analysis…");
  });

  it("marks the region busy while it stands in for the page", () => {
    const { container } = render(<PageLoading title="Agents" />);
    expect(container.querySelector("main")).toHaveAttribute("aria-busy", "true");
  });

  it("is one animation, not several", () => {
    // The whole point of this component: the app had a navigation bar AND a
    // body skeleton running at once. Any second animated element here would be
    // that mistake growing back.
    const { container } = render(<PageLoading title="Dashboard" />);
    const animated = container.querySelectorAll('[class*="animate-"]');
    // One ring, and nothing else moving.
    expect(animated).toHaveLength(1);
    for (const el of animated) {
      expect(el.getAttribute("class")).toContain("animate-page-loading");
    }
  });

  it("shows no figure it does not have", () => {
    const { container } = render(<PageLoading title="Website audit" />);
    // No percentage, no count, no score — there is no source for any of them.
    expect(container.textContent).not.toMatch(/\d/);
  });

  it("works without a title, for a screen that has not named itself", () => {
    render(<PageLoading />);
    expect(screen.getByRole("heading")).toHaveTextContent("Loading…");
  });
});
