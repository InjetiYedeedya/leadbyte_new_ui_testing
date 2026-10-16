import { readUnlockedAgents, unlockedAgentsHref } from "@/lib/data/unlocked-agents";

describe("unlockedAgentsHref", () => {
  it("names the bought agents once each", () => {
    expect(unlockedAgentsHref(["meta-ads", "google-ads", "meta-ads"])).toBe("/agents?unlocked=meta-ads,google-ads");
  });

  it("is the plain Agents page when nothing is known", () => {
    expect(unlockedAgentsHref([])).toBe("/agents");
    expect(unlockedAgentsHref([" "])).toBe("/agents");
  });
});

describe("readUnlockedAgents", () => {
  it("keeps only known agents", () => {
    expect(readUnlockedAgents("meta-ads,nope,google-ads", ["meta-ads", "google-ads"])).toEqual([
      "meta-ads",
      "google-ads",
    ]);
  });

  it("reads nothing from a missing value", () => {
    expect(readUnlockedAgents(undefined, ["meta-ads"])).toEqual([]);
  });
});
