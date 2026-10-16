import {
  GOOGLE_ADS_GUIDE,
  META_ADS_GUIDE,
  adAccountGuideFor,
  wantsAccountGuide,
} from "./ad-account-guides";

const steps = (guide: typeof GOOGLE_ADS_GUIDE) => guide.parts.flatMap((p) => p.steps);

describe("ad account guides", () => {
  it("numbers every step in order: 8 for Google, 13 for Meta", () => {
    expect(steps(GOOGLE_ADS_GUIDE).map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(steps(META_ADS_GUIDE).map((s) => s.n)).toEqual(
      Array.from({ length: 13 }, (_, i) => i + 1),
    );
  });

  it("offers a guide only for Google Ads and Meta Ads", () => {
    expect(adAccountGuideFor("google-ads")).toBe(GOOGLE_ADS_GUIDE);
    expect(adAccountGuideFor("meta-ads")).toBe(META_ADS_GUIDE);
    expect(adAccountGuideFor("linkedin-ads")).toBeNull();
  });
});

describe("wantsAccountGuide", () => {
  it("opens the guide only for exactly ?account=no", () => {
    expect(wantsAccountGuide("no")).toBe(true);
  });

  it("shows the Connect card for anything else, including the old yes", () => {
    expect(wantsAccountGuide("yes")).toBe(false);
    expect(wantsAccountGuide(undefined)).toBe(false);
    expect(wantsAccountGuide("")).toBe(false);
    expect(wantsAccountGuide("NO")).toBe(false);
    expect(wantsAccountGuide(["no"])).toBe(false);
  });
});
