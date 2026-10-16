import { render } from "@testing-library/react";
import { PresenceFlow } from "./presence-flow";
import type { PresenceNode } from "@/lib/data/overview-summary";

const node = (over: Partial<PresenceNode> = {}): PresenceNode => ({
  id: "website",
  label: "Website",
  value: "17 pages",
  state: "active",
  strength: 0.4,
  ...over,
});

const four: PresenceNode[] = [
  node(),
  node({ id: "visibility", label: "AI visibility", value: "62 / 100", strength: 0.62 }),
  node({ id: "opportunities", label: "Opportunities", value: "3 found", strength: 0.75 }),
  node({ id: "growth", label: "Growth", value: null, state: "dormant", strength: 0 }),
];

describe("PresenceFlow", () => {
  it("draws one point per node and keeps its viewBox fixed", () => {
    // Fixed geometry is load-bearing: ScrollStack measures the cards below
    // this drawing and never re-measures for anything above them, so a height
    // that changes after mount shifts every landing point.
    const { container } = render(<PresenceFlow nodes={four} label="Presence" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("viewBox", "0 0 440 232");
    expect(container.querySelectorAll("circle")).toHaveLength(4);
    expect(container.querySelectorAll("path")).toHaveLength(3);
  });

  it("contains no rect at all", () => {
    // The intro this replaced was a picture of floating stacked cards, the
    // motif the brief banned most explicitly. A rect creeping in here is that
    // illustration coming back.
    const { container } = render(<PresenceFlow nodes={four} label="Presence" />);
    expect(container.querySelectorAll("rect")).toHaveLength(0);
  });

  it("dashes the segment into a dormant node and prints no figure for it", () => {
    const { container } = render(<PresenceFlow nodes={four} label="Presence" />);
    const dashed = [...container.querySelectorAll("path")].filter((p) =>
      p.getAttribute("stroke-dasharray"),
    );
    expect(dashed).toHaveLength(1);
    expect(container.textContent).toContain("Growth");
    expect(container.textContent).not.toContain("0 conversions");
  });

  it("spends the accent on the furthest node that has data", () => {
    const { container } = render(<PresenceFlow nodes={four} label="Presence" />);
    const accented = [...container.querySelectorAll("circle")].filter(
      (c) => c.getAttribute("fill") === "var(--color-accent)",
    );
    expect(accented).toHaveLength(1);
  });

  it("renders nothing for fewer than two nodes", () => {
    // One point is not a flow.
    const { container } = render(<PresenceFlow nodes={[node()]} label="Presence" />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("reads as one sentence, not eight orphan words", () => {
    const { container } = render(<PresenceFlow nodes={four} label="Your presence" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "Your presence");
    expect(svg.querySelector("g")).toHaveAttribute("aria-hidden", "true");
  });

  it("is decoration when given no label", () => {
    const { container } = render(<PresenceFlow nodes={four} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("role", "presentation");
  });

  it("offers a shorter density for narrow columns", () => {
    // `full`'s labels fall under 9px in a ~350px column, which is why this
    // exists rather than scaling the same drawing down.
    const { container } = render(<PresenceFlow nodes={four} density="rail" label="Presence" />);
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", "0 0 360 84");
  });
});
