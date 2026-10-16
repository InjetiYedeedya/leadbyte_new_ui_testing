import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatCard } from "./stat-card";
import { Sparkline } from "./sparkline";

describe("StatCard", () => {
  it("renders a value with its label", () => {
    render(<StatCard label="Spend" value="₹3,240" />);
    expect(screen.getByText("Spend")).toBeInTheDocument();
    expect(screen.getByText("₹3,240")).toBeInTheDocument();
  });

  it("shows an em dash for a missing value, never zero", () => {
    // "No conversions yet" and "a CPA of 0" mean opposite things to someone
    // deciding where to spend money.
    render(<StatCard label="CPA" value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("colours a rise green when up is good", () => {
    const { container } = render(
      <StatCard label="Sessions" value="1,200" deltaPercent={12.4} goodDirection="up" />,
    );
    expect(container.querySelector(".text-good")).not.toBeNull();
  });

  it("colours a rise red when up is bad", () => {
    // A rising cost per acquisition is a problem, not an achievement.
    const { container } = render(
      <StatCard label="CPA" value="₹3,240" deltaPercent={12.4} goodDirection="down" />,
    );
    expect(container.querySelector(".text-crit")).not.toBeNull();
  });

  it("colours a fall green when down is good", () => {
    const { container } = render(
      <StatCard label="CPA" value="₹2,100" deltaPercent={-18} goodDirection="down" />,
    );
    expect(container.querySelector(".text-good")).not.toBeNull();
  });

  it("stays neutral for a flat change", () => {
    const { container } = render(<StatCard label="Clicks" value="500" deltaPercent={0} />);
    expect(container.querySelector(".text-good")).toBeNull();
    expect(container.querySelector(".text-crit")).toBeNull();
  });

  it("omits the delta entirely when there is no comparison", () => {
    render(<StatCard label="Clicks" value="500" />);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("describes the change for screen readers", () => {
    render(<StatCard label="Sessions" value="1,200" deltaPercent={12.4} />);
    expect(screen.getByLabelText(/up 12.4 percent/)).toBeInTheDocument();
  });
});

describe("Sparkline", () => {
  it("draws nothing for a single point", () => {
    // One value is not a trend.
    const { container } = render(<Sparkline values={[5]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("draws a line for a series", () => {
    const { container } = render(<Sparkline values={[1, 5, 3, 9]} />);
    expect(container.querySelector("polyline")).not.toBeNull();
  });

  it("handles a flat series without dividing by zero", () => {
    const { container } = render(<Sparkline values={[7, 7, 7]} />);
    const points = container.querySelector("polyline")!.getAttribute("points")!;
    expect(points).not.toContain("NaN");
  });

  it("labels itself with the latest value", () => {
    render(<Sparkline values={[1, 2, 42]} />);
    expect(screen.getByRole("img", { name: /ending at 42/ })).toBeInTheDocument();
  });
});
