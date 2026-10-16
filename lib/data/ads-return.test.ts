import { ADS_RETURN_MAX_AGE, adsReturnPath, adsReturnValue } from "./ads-return";

const NOW = 1_800_000_000_000;

describe("adsReturnPath", () => {
  it("returns to the agent the connect was started from", () => {
    expect(adsReturnPath(adsReturnValue("googleAds", NOW), "googleAds", NOW + 60_000)).toBe(
      "/agents/google-ads?connected=1",
    );
    expect(adsReturnPath(adsReturnValue("metaAds", NOW), "metaAds", NOW)).toBe(
      "/agents/meta-ads?connected=1",
    );
    expect(adsReturnPath(adsReturnValue("linkedInAds", NOW), "linkedInAds", NOW)).toBe(
      "/agents/linkedin-ads?connected=1",
    );
  });

  it("keeps the usual landing with no note, another platform's note, or an old one", () => {
    expect(adsReturnPath(null, "googleAds", NOW)).toBeNull();
    expect(adsReturnPath(adsReturnValue("googleAds", NOW), "metaAds", NOW)).toBeNull();
    expect(
      adsReturnPath(adsReturnValue("googleAds", NOW), "googleAds", NOW + ADS_RETURN_MAX_AGE * 1000),
    ).toBeNull();
    expect(adsReturnPath("googleAds|not-a-time", "googleAds", NOW)).toBeNull();
  });

  it("can only ever name one of the three agent pages", () => {
    // A value shaped like a path is not a platform, so it goes nowhere.
    expect(adsReturnPath(`https://evil.example|${NOW}`, "googleAds", NOW)).toBeNull();
  });
});
