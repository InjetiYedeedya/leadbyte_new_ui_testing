export interface StageInputs {
  auditComplete: boolean;
  connectionsResolved: boolean;
  strategyGenerated: boolean;
  agentActive: boolean;
}

export interface StageFlag {
  id: string;
  label: string;
  complete: boolean;
  /** Where this stage is done. The rail links to it, so "Connections · 04" is
      a way IN to the connections screen rather than a label describing one. */
  href: string;
}

export interface StageFlagsResult {
  stages: StageFlag[];
  completeCount: number;
  total: 4;
  allComplete: boolean;
}

/**
 * Single source of truth for onboarding-stage completion.
 *
 * Four stages. Website, Intelligence and Marketing were removed on 2026-09-04:
 * they were not steps anyone had to take, so they only ever reported on data
 * arriving. `StageInputs` lost its three matching fields with them, which is
 * why `computeStageInputs` no longer reads the profile or advertising repos.
 *
 * IMPORTANT: this must always be derived from real state (the StageInputs
 * passed in), never inferred from which route/tab the user is currently
 * on. A positional version of this logic was built and shipped once during
 * design validation and was a real bug — see the design spec's "Lessons
 * carried into code."
 */
export function getStageFlags(inputs: StageInputs): StageFlagsResult {
  const stages: StageFlag[] = [
    {
      id: "audit",
      label: "Audit",
      complete: inputs.auditComplete,
      href: "/overview/website-audit",
    },
    {
      id: "connections",
      label: "Connections",
      complete: inputs.connectionsResolved,
      href: "/intelligence/connections",
    },
    {
      id: "strategy",
      label: "Strategy",
      complete: inputs.strategyGenerated,
      href: "/growth/strategy",
    },
    { id: "agents", label: "Agents", complete: inputs.agentActive, href: "/agents" },
  ];

  const completeCount = stages.filter((s) => s.complete).length;

  return {
    stages,
    completeCount,
    total: 4,
    allComplete: completeCount === 4,
  };
}
