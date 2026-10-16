import { render, screen } from "@testing-library/react";
import { AnalysingState, AnalysisFailedState } from "./states";

/**
 * These two states are what the three Intelligence screens show while the
 * single website-analyze job is in flight or after it fails. The copy is the
 * feature — a user who clicks SEO before the data lands must be told it is
 * coming, not shown "no analysis yet".
 */
describe("AnalysingState", () => {
  it("says the data is being fetched and that the page will update itself", () => {
    render(<AnalysingState />);

    expect(screen.getByText(/Analysing your site/i)).toBeInTheDocument();
    expect(screen.getByText(/fetching the data/i)).toBeInTheDocument();
    expect(screen.getByText(/updates itself/i)).toBeInTheDocument();
  });

  it("is a live region, so a screen reader announces it without a focus change", () => {
    render(<AnalysingState />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("names what is being analysed", () => {
    render(<AnalysingState what="your website" />);

    expect(screen.getByText(/Analysing your website/i)).toBeInTheDocument();
  });

  it("promises no percentage — the backend emits no progress counters", () => {
    const { container } = render(<AnalysingState />);

    expect(container.textContent).not.toMatch(/%/);
    expect(container.querySelector("progress")).toBeNull();
  });
});

describe("AnalysisFailedState", () => {
  it("shows the backend's own message, which is written for users", () => {
    render(<AnalysisFailedState message="Website could not be reached" />);

    expect(screen.getByText(/Website could not be reached/i)).toBeInTheDocument();
  });

  it("falls back to try-again copy when the backend sent no message", () => {
    render(<AnalysisFailedState />);

    expect(screen.getByText(/try again in a few minutes/i)).toBeInTheDocument();
  });

  it("treats a blank message as no message rather than rendering an empty line", () => {
    render(<AnalysisFailedState message="   " />);

    expect(screen.getByText(/try again in a few minutes/i)).toBeInTheDocument();
  });

  it("is an alert, and renders the retry control it is given", () => {
    render(<AnalysisFailedState action={<button type="button">Try again</button>} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
