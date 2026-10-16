import { render, screen } from "@testing-library/react";
import { AGENT_FOR_CONNECTION, RunAgentLink } from "./run-agent-link";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/intelligence/connections" }));

describe("RunAgentLink (LBS-1254)", () => {
  it("opens the agent that uses the connection", () => {
    render(<RunAgentLink {...AGENT_FOR_CONNECTION.metaAds} />);
    const link = screen.getByRole("link", { name: "Run the Meta Ads agent" });
    expect(link.getAttribute("href")).toBe("/agents/meta-ads");
    expect(link.textContent).toContain("Run agent");
  });

  it("sends every social platform to the one Social Media agent", () => {
    for (const key of ["facebook", "instagram", "youtube"] as const) {
      expect(AGENT_FOR_CONNECTION[key].agentId).toBe("social-media");
    }
  });
});
