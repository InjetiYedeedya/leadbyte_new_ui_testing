import { buildGrantWrite, cleanAgentIds, currentGrant, readGrantDuration } from "./grant";

const NOW = new Date("2026-09-20T00:00:00.000Z");

describe("granting agents", () => {
  it("keeps only agent ids entitlements recognise, in plan order", () => {
    expect(cleanAgentIds(["meta-ads", "admin", "lead-qualification", "meta-ads", "AI Podcast Agent"])).toEqual([
      "lead-qualification",
      "meta-ads",
      "podcast",
    ]);
  });

  it("reads the stored agent list, legacy titles included", () => {
    expect(currentGrant({ subscribed_agents: ["AI Automation for Meta Ads", "junk"] })).toEqual(["meta-ads"]);
    expect(currentGrant({})).toEqual([]);
  });

  it("defaults the duration to a year", () => {
    expect(readGrantDuration("1")).toBe(1);
    expect(readGrantDuration("99")).toBe(12);
  });

  it("writes an active subscription ending N months from now, keeping the rest of the row", () => {
    const write = buildGrantWrite({ user_id: "u1", email: "A@x.test", displayName: "Ann" }, ["meta-ads"], 1, "Admin@ntimes.ai", NOW);
    expect(write).toMatchObject({ userId: "u1", endDate: "2026-10-20T00:00:00.000Z" });
    expect(write!.row).toMatchObject({
      user_id: "u1",
      email: "a@x.test",
      displayName: "Ann",
      subscription_status: "active",
      subscription_end_date: "2026-10-20T00:00:00.000Z",
      subscribed_agents: ["meta-ads"],
      access_granted_by: "admin@ntimes.ai",
    });
  });

  it("revokes by emptying the list and leaving the dates alone", () => {
    const write = buildGrantWrite(
      { uid: "u2", subscription_status: "active", subscription_end_date: "2027-01-01" },
      [],
      12,
      "a@x",
      NOW,
    );
    expect(write!.row).toMatchObject({
      user_id: "u2",
      subscription_status: "active",
      subscription_end_date: "2027-01-01",
      subscribed_agents: [],
    });
    expect(write!.endDate).toBeNull();
  });

  it("refuses a row with no key rather than creating an orphan", () => {
    expect(buildGrantWrite({ email: "x@x.test" }, ["meta-ads"], 12, "a@x", NOW)).toBeNull();
  });
});
