import { launchTarget } from "./ads-launch-target";

describe("launchTarget", () => {
  it("creates every Google and Meta campaign through the receiver, full or semi", () => {
    // Google semi went to `google-ads-semi` and never reached `adsreceiver`
    // (backend team, 2026-09-30). This is the line that must never flip back.
    expect(launchTarget("google-ads", "semi")).toBe("receiver");
    expect(launchTarget("google-ads", "full")).toBe("receiver");
    expect(launchTarget("meta-ads", "semi")).toBe("receiver");
    expect(launchTarget("meta-ads", "full")).toBe("receiver");
  });

  it("sends only LinkedIn semi to its own semi workflow", () => {
    expect(launchTarget("linkedin-ads", "semi")).toBe("semi");
    expect(launchTarget("linkedin-ads", "full")).toBe("receiver");
  });
});
