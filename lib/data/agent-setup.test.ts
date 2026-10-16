import { AGENT_BACKENDS, agentBackend } from "@/lib/data/agent-setup";

/**
 * These pin the inconsistencies in the backend's own contract. Every one of
 * them looks like a typo and is not, so every one of them is a thing a future
 * change might "tidy" into a silently broken agent.
 */
describe("AGENT_BACKENDS", () => {
  it("keeps Lead Qualification's SCREAMING_SNAKE agent_type", () => {
    // The three ad agents use lower_snake. The backend switches on the exact
    // string, so these are not interchangeable.
    expect(AGENT_BACKENDS["lead-qualification"].agentType).toBe("LEAD_QUALIFICATION");
  });

  it("keeps the ad agents' lower_snake agent_type", () => {
    expect(AGENT_BACKENDS["google-ads"].agentType).toBe("google_ads");
    expect(AGENT_BACKENDS["meta-ads"].agentType).toBe("meta_ads");
    expect(AGENT_BACKENDS["linkedin-ads"].agentType).toBe("linkedin_ads");
  });

  it("posts Google and Meta to `adsreceiver`, with no hyphen", () => {
    expect(AGENT_BACKENDS["google-ads"].triggerPath).toBe("/api/webhook/adsreceiver");
    expect(AGENT_BACKENDS["meta-ads"].triggerPath).toBe("/api/webhook/adsreceiver");
  });

  it("posts LinkedIn to `ads-receiver`, WITH a hyphen", () => {
    // Not a typo in our code — the backend spells LinkedIn's differently from
    // the other two. Making all three match breaks one of them.
    expect(AGENT_BACKENDS["linkedin-ads"].triggerPath).toBe("/api/webhook/ads-receiver");
  });

  it("sends the ad agents through a chat webhook first", () => {
    expect(AGENT_BACKENDS["google-ads"].chatPath).toBe("/api/webhook/google-ads-chat");
    expect(AGENT_BACKENDS["meta-ads"].chatPath).toBe("/api/webhook/meta-ads-chat");
    expect(AGENT_BACKENDS["linkedin-ads"].chatPath).toBe("/api/webhook/linkedin-ads-chat");
  });

  it("sends Lead Qualification straight to main, with no chat hop", () => {
    expect(AGENT_BACKENDS["lead-qualification"].chatPath).toBeUndefined();
    expect(AGENT_BACKENDS["lead-qualification"].triggerPath).toBe("/api/webhook/main");
  });

  it("names each agent's own save table", () => {
    expect(Object.values(AGENT_BACKENDS).map((b) => b.table)).toEqual([
      "leadbyte_lead_qualification",
      // The two SEO agents share the generic `main` webhook until they get one
      // of their own, but their tables are already the real ones.
      "leadbyte_on_page_seo",
      "leadbyte_off_page_seo",
      "leadbyte_social_media",
      "leadbyte_google_ads",
      "leadbyte_meta_ads",
      "leadbyte_linkedin_ads",
      "leadbyte_openai_ads",
    ]);
  });

  /**
   * OpenAI Ads is in the map with no endpoints on purpose — there is no n8n
   * workflow for it yet. What this pins is that it fails LOUDLY rather than
   * posting a real campaign to a guessed URL, which is the failure mode
   * CLAUDE.md keeps warning about.
   */
  /**
   * Social Media is the one non-ad agent with a webhook of its own — the other
   * three share `/api/webhook/main` and are routed by `agent_type`. Pinned
   * because the distinction is easy to "tidy" into `main`, which would send it
   * somewhere that has never handled it.
   */
  it("routes Social Media as the legacy app did: main for full, its own semi, activation beside a run", () => {
    // Full automation is the shared `main` workflow with agent_type SOCIAL_MEDIA;
    // semi has its own. `social-media-activation` is the first-time YouTube
    // request, never a run — it was the only call before 2026-10-01, which is
    // why nothing was posted.
    expect(AGENT_BACKENDS["social-media"].triggerPath).toBe("/api/webhook/main");
    expect(AGENT_BACKENDS["social-media"].semiPath).toBe("/api/webhook/social-media-semi");
    expect(AGENT_BACKENDS["social-media"].activationPath).toBe("/api/webhook/social-media-activation");
    expect(AGENT_BACKENDS["social-media"].agentType).toBe("SOCIAL_MEDIA");
    expect(AGENT_BACKENDS["social-media"].chatPath).toBeUndefined();
  });

  it("leaves OpenAI Ads without endpoints until the backend team supplies them", () => {
    expect(AGENT_BACKENDS["openai-ads"].chatPath).toBeUndefined();
    expect(AGENT_BACKENDS["openai-ads"].semiPath).toBeUndefined();
    expect(AGENT_BACKENDS["openai-ads"].triggerPath).toBe("");
    // The discriminator and the table follow the ad agents' lower_snake
    // convention, so filling the paths in is the only edit needed.
    expect(AGENT_BACKENDS["openai-ads"].agentType).toBe("openai_ads");
  });
});

describe("agentBackend", () => {
  it("resolves the agent ids the app already routes on", () => {
    expect(agentBackend("google-ads")?.table).toBe("leadbyte_google_ads");
  });

  it("returns null for an agent with no backend yet", () => {
    // The remaining agents are documented but not wired. A page must be able
    // to ask without a crash, and fall back to its current behaviour.
    expect(agentBackend("podcast")).toBeNull();
    expect(agentBackend("writer")).toBeNull();
    expect(agentBackend("")).toBeNull();
  });
});
