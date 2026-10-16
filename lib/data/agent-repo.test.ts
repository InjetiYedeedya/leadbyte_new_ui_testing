import {
  AGENT_DEFINITIONS,
  agentsNeedingAttention,
  getAgentRepo,
  visibleAgentDefinitions,
} from "@/lib/data/agent-repo";
import type { AgentStatus } from "@/lib/data/types";

/**
 * Multi-business isolation for agent activity.
 *
 * This is the rule that has now been broken twice in different places, and it
 * is worth a test rather than a comment: fixture activity belongs to the seeded
 * demo business, `novaflow`, and to nobody else. `initialStateFor` respected it;
 * `activate()` did not, so activating an agent on a real account wrote
 * NovaFlow's log into it — "Scored 612 inbound leads", against an account that
 * had scored none — and the screen presented it as the customer's own.
 *
 * A wrong empty state looks unfinished. A wrong RUN looks like a lie, which is
 * why this is the half that needed the test.
 */
describe("agent activity is per business", () => {
  it("gives a real account no fixture history before activation", async () => {
    const state = await getAgentRepo().getState("some-real-business", "lead-qualification");

    expect(state.runs).toEqual([]);
    expect(state.status).toBe("needs-setup");
  });

  it("does not copy the demo business's activity when a real account activates", async () => {
    const repo = getAgentRepo();
    await repo.activate("another-real-business", "lead-qualification");

    const state = await repo.getState("another-real-business", "lead-qualification");
    // Ready, because they asked for it — but with nothing claimed on their
    // behalf until the agent's own backend reports what it did.
    expect(state.status).toBe("ready");
    expect(state.runs).toEqual([]);
  });

  it("still seeds the demo business, which the mock mode depends on", async () => {
    const state = await getAgentRepo().getState("novaflow", "lead-qualification");

    expect(state.runs.length).toBeGreaterThan(0);
    expect(state.runs[0]!.entries.length).toBeGreaterThan(0);
  });

  it("keeps each agent's activity to that agent", async () => {
    // A shared fallback once showed Lead Qualification's page the Google Ads
    // activity log. Every agent's fixture is keyed to it, with no fallback.
    const [lead, googleAds] = await Promise.all([
      getAgentRepo().getState("novaflow", "lead-qualification"),
      getAgentRepo().getState("novaflow", "google-ads"),
    ]);

    const leadTitles = lead.runs.flatMap((run) => run.entries.map((e) => e.title));
    const adsTitles = googleAds.runs.flatMap((run) => run.entries.map((e) => e.title));

    expect(leadTitles.some((title) => adsTitles.includes(title))).toBe(false);
  });
});

describe("agentsNeedingAttention", () => {
  const state = (status: AgentStatus) => ({ agentId: status, status, runs: [] });

  it("counts the agents that cannot proceed without the customer", () => {
    expect(
      agentsNeedingAttention([state("needs-setup"), state("blocked"), state("ready")]),
    ).toBe(2);
  });

  it("does not count a recommended agent", () => {
    // A suggestion is not a blocked task. Badging it would make the number
    // impossible to clear, which trains people to ignore the badge.
    expect(agentsNeedingAttention([state("recommended"), state("ready")])).toBe(0);
  });

  it("is zero when everything is running", () => {
    expect(agentsNeedingAttention([state("ready"), state("ready")])).toBe(0);
  });

  it("is zero for a business with no agents", () => {
    expect(agentsNeedingAttention([])).toBe(0);
  });
});

describe("hidden agents", () => {
  // The bug this guards: the Agents page filtered Writer and Coding out with a
  // `const` of its own, and the tab badge counted `listStates()`. On any
  // account but the seeded demo every agent starts `needs-setup`, so the badge
  // read 9 beside a page listing 7.
  it("keeps them out of every list the repo hands out", async () => {
    const repo = getAgentRepo();

    const listed = repo.listDefinitions().map((d) => d.id);
    expect(listed).not.toContain("writer");
    expect(listed).not.toContain("coding");

    const states = await repo.listStates("some-other-business");
    expect(states.map((s) => s.agentId)).not.toContain("writer");
    expect(states.map((s) => s.agentId)).not.toContain("coding");
  });

  it("offers the AEO agent, and gives it a state like any other", async () => {
    // Added 2026-09-21. It is listed, so it must also appear in `listStates`
    // — the badge counts states while the page lists definitions, and a
    // definition with no state is exactly how those two last disagreed.
    const repo = getAgentRepo();
    expect(repo.listDefinitions().map((d) => d.id)).toContain("aeo");

    const states = await repo.listStates("not-novaflow");
    expect(states.map((s) => s.agentId)).toContain("aeo");
    // No fixture history and no seeded status, so it starts where a real
    // account starts rather than inheriting another agent's demo log.
    const aeo = states.find((s) => s.agentId === "aeo");
    expect(aeo?.status).toBe("needs-setup");
    expect(aeo?.runs).toEqual([]);
  });

  it("counts attention against what is on screen, not what exists", async () => {
    // A business with no fixtures: every offered agent starts needing setup.
    const states = await getAgentRepo().listStates("not-novaflow");
    expect(agentsNeedingAttention(states)).toBe(visibleAgentDefinitions().length);
    expect(agentsNeedingAttention(states)).toBeLessThan(AGENT_DEFINITIONS.length);
  });

  it("still resolves a hidden agent by id, so its page keeps working", async () => {
    // Hidden is not deleted: the definition, the state and the route all live.
    expect(AGENT_DEFINITIONS.some((d) => d.id === "writer")).toBe(true);
    const state = await getAgentRepo().getState("novaflow", "writer");
    expect(state.agentId).toBe("writer");
  });
});

describe("the order agents are offered in", () => {
  // Set by the product team (2026-09-30). The Agents list keeps this order
  // inside its Ready / Needs-setup groups, so a reshuffle of the array is a
  // change to what customers see first.
  it("is OpenAI, Meta, Google, Lead, the SEO pair, LinkedIn, Social, then the rest", () => {
    expect(visibleAgentDefinitions().map((d) => d.id)).toEqual([
      "openai-ads",
      "meta-ads",
      "google-ads",
      "lead-qualification",
      "on-page-seo",
      "off-page-seo",
      "linkedin-ads",
      "social-media",
      "aeo",
      "blog-posting",
    ]);
  });
});

describe("Meta Ads start screen copy (LBS-1255)", () => {
  it("carries the approved headline, reason and benefit", () => {
    const meta = AGENT_DEFINITIONS.find((d) => d.id === "meta-ads");
    expect(meta?.description).toBe("Automate The Campaign Creation. Monitor. Optimize. Grow.");
    expect(meta?.whyThisAgent).toMatch(/^Launch your Meta campaigns faster/);
    expect(meta?.benefits?.[0]?.title).toBe("Save time with automation");
  });
});
