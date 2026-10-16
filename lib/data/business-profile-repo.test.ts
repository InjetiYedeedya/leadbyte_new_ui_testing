import { describe, expect, it } from "vitest";
import { getBusinessProfileRepo } from "./business-profile-repo";

describe("BusinessProfileRepo", () => {
  it("returns the seeded NovaFlow profile for businessId 'novaflow'", async () => {
    const repo = getBusinessProfileRepo();
    const profile = await repo.get("novaflow");
    expect(profile).not.toBeNull();
    expect(profile?.businessName).toBe("NovaFlow");
    expect(profile?.websiteAuditScore).toBe(72);
    expect(profile?.geoVisibilityScore).toBe(61);
  });

  it("returns null for an unknown businessId", async () => {
    const repo = getBusinessProfileRepo();
    const profile = await repo.get("does-not-exist");
    expect(profile).toBeNull();
  });
});
