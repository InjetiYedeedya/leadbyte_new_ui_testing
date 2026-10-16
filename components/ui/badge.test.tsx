import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";

describe("Badge", () => {
  it("renders its label text", () => {
    render(<Badge variant="agent-ready">Ready</Badge>);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("applies variant-specific styling for a verdict badge", () => {
    render(<Badge variant="verdict-scale">Scale</Badge>);
    const badge = screen.getByText("Scale");
    expect(badge.className).toContain("bg-good-soft");
    expect(badge.className).toContain("text-good");
  });

  it("applies variant-specific styling for a critical confidence badge", () => {
    render(<Badge variant="confidence-low">Low confidence</Badge>);
    const badge = screen.getByText("Low confidence");
    expect(badge.className).toContain("bg-crit-soft");
  });

  it("gives each admin severity a distinct weight, with critical the loudest", () => {
    render(
      <>
        <Badge variant="severity-critical">Critical</Badge>
        <Badge variant="severity-low">Low</Badge>
      </>,
    );
    expect(screen.getByText("Critical").className).toContain("bg-crit-soft");
    expect(screen.getByText("Low").className).toContain("bg-surface-raised");
  });

  it("keeps a missing purchase quiet rather than alarming", () => {
    render(<Badge variant="purchase-no">No purchase</Badge>);
    expect(screen.getByText("No purchase").className).not.toContain("crit");
  });
});
