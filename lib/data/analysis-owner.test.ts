import { analysisBelongsTo, analysisOwner, profileRowBelongsTo } from "./analysis-owner";

describe("analysisOwner", () => {
  it("reads the uid the crawl ran for off brand_profile", () => {
    expect(analysisOwner({ brand_profile: { user_id: "uid-a" } })).toBe("uid-a");
  });

  it("falls back to a top-level user_id", () => {
    expect(analysisOwner({ user_id: "uid-b", brand_profile: {} })).toBe("uid-b");
  });

  it("is null when the payload names nobody", () => {
    expect(analysisOwner({ brand_profile: { user_id: "  " } })).toBeNull();
    expect(analysisOwner(null)).toBeNull();
  });
});

describe("profileRowBelongsTo", () => {
  it("refuses a row stored under another email", () => {
    expect(profileRowBelongsTo({ email: "team@zippygo.ai" }, "new@ntimes.ai")).toBe(false);
  });

  it("accepts the account's own row, whatever the case", () => {
    expect(profileRowBelongsTo({ email: "Vignesh@NTimes.ai" }, "vignesh@ntimes.ai")).toBe(true);
  });

  it("lets a row with no email through, and a non-email account id (mock mode)", () => {
    expect(profileRowBelongsTo({ websiteUrl: "x.io" }, "a@b.io")).toBe(true);
    expect(profileRowBelongsTo({ email: "rhea@novaflow.io" }, "novaflow")).toBe(true);
  });
});

describe("analysisBelongsTo", () => {
  it("refuses another account's analysis", () => {
    expect(analysisBelongsTo({ brand_profile: { user_id: "zippygo-uid" } }, "new-uid")).toBe(false);
  });

  it("accepts the account's own analysis", () => {
    expect(analysisBelongsTo({ brand_profile: { user_id: "uid-a" } }, "uid-a")).toBe(true);
  });

  it("lets a payload with no owner through rather than hiding it", () => {
    expect(analysisBelongsTo({ brand_profile: {} }, "uid-a")).toBe(true);
  });

  it("lets everything through when the session has no uid (mock mode)", () => {
    expect(analysisBelongsTo({ brand_profile: { user_id: "uid-a" } }, undefined)).toBe(true);
  });
});
