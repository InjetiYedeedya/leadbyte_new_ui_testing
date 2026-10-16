import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StageRail } from "./stage-rail";
import { getStageFlags } from "@/lib/onboarding/stage-flags";

describe("StageRail", () => {
  it("renders the stage labels and the N of 4 count when incomplete", () => {
    const flags = getStageFlags({
      auditComplete: true,
      connectionsResolved: false,
      strategyGenerated: false,
      agentActive: false,
    });
    render(<StageRail flags={flags} currentStageId="connections" />);
    expect(screen.getByText("Audit")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("1 of 4 stages complete")).toBeInTheDocument();
  });

  it("shows no Website, Intelligence or Marketing stage", () => {
    const flags = getStageFlags({
      auditComplete: true,
      connectionsResolved: true,
      strategyGenerated: false,
      agentActive: false,
    });
    render(<StageRail flags={flags} currentStageId="strategy" />);

    expect(screen.queryByText("Website")).toBeNull();
    expect(screen.queryByText("Intelligence")).toBeNull();
    expect(screen.queryByText("Marketing")).toBeNull();
  });

  it("renders nothing at all once every stage is complete", () => {
    const flags = getStageFlags({
      auditComplete: true,
      connectionsResolved: true,
      strategyGenerated: true,
      agentActive: true,
    });
    const { container } = render(
      <StageRail flags={flags} currentStageId="agents" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
