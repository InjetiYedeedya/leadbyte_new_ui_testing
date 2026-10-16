import { describe, expect, it } from "vitest";
import { getStageFlags, type StageInputs } from "./stage-flags";

const NONE_COMPLETE: StageInputs = {
  auditComplete: false,
  connectionsResolved: false,
  strategyGenerated: false,
  agentActive: false,
};

const ALL_COMPLETE: StageInputs = {
  auditComplete: true,
  connectionsResolved: true,
  strategyGenerated: true,
  agentActive: true,
};

describe("getStageFlags", () => {
  it("reports 0 of 4 complete and allComplete=false when nothing is done", () => {
    const result = getStageFlags(NONE_COMPLETE);
    expect(result.completeCount).toBe(0);
    expect(result.total).toBe(4);
    expect(result.allComplete).toBe(false);
  });

  it("reports 4 of 4 complete and allComplete=true when everything is done", () => {
    const result = getStageFlags(ALL_COMPLETE);
    expect(result.completeCount).toBe(4);
    expect(result.allComplete).toBe(true);
  });

  it("counts partial completion correctly regardless of which stages are done", () => {
    const result = getStageFlags({
      ...NONE_COMPLETE,
      auditComplete: true,
      strategyGenerated: true,
    });
    expect(result.completeCount).toBe(2);
    expect(result.allComplete).toBe(false);
  });

  it("returns exactly the four stages, in a fixed, stable order", () => {
    const result = getStageFlags(NONE_COMPLETE);
    expect(result.stages.map((s) => s.id)).toEqual([
      "audit",
      "connections",
      "strategy",
      "agents",
    ]);
  });

  it("has no Website, Intelligence or Marketing stage", () => {
    const ids = getStageFlags(NONE_COMPLETE).stages.map((s) => s.id);

    expect(ids).not.toContain("website");
    expect(ids).not.toContain("intelligence");
    expect(ids).not.toContain("marketing");
  });
});

describe("stage destinations", () => {
  it("gives every stage a route, so the rail can be navigated", () => {
    const { stages } = getStageFlags(NONE_COMPLETE);

    expect(stages.every((stage) => stage.href.startsWith("/"))).toBe(true);
  });

  it("points Connections at its page — for a while the rail was its only mention", () => {
    const { stages } = getStageFlags(NONE_COMPLETE);

    expect(stages.find((s) => s.id === "connections")?.href).toBe(
      "/intelligence/connections",
    );
  });
});
