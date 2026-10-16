import { accountInitials, brandChip, firstFilled, isFilled, joinFilled } from "./profile-display";
import type { BusinessProfile } from "@/lib/data/types";

/**
 * These cases are the exact bugs seen against the live backend on 2026-09-02,
 * where a real profile row existed with only `websiteUrl` set.
 */
describe("isFilled", () => {
  it("rejects the empty string the profile mapper produces for a missing field", () => {
    expect(isFilled("")).toBe(false);
  });

  it("rejects whitespace, which renders as blank just the same", () => {
    expect(isFilled("   ")).toBe(false);
  });

  it("rejects null and undefined", () => {
    expect(isFilled(null)).toBe(false);
    expect(isFilled(undefined)).toBe(false);
  });

  it("accepts real content", () => {
    expect(isFilled("NovaFlow")).toBe(true);
  });
});

describe("firstFilled", () => {
  it("skips an empty string, which `??` would have returned", () => {
    expect(firstFilled("", "charan@ntimes.ai")).toBe("charan@ntimes.ai");
  });

  it("prefers the first filled value", () => {
    expect(firstFilled("NovaFlow", "fallback")).toBe("NovaFlow");
  });

  it("skips past several blanks", () => {
    expect(firstFilled("", null, undefined, "  ", "last")).toBe("last");
  });

  it("returns null when nothing is filled, so the caller can drop the element", () => {
    expect(firstFilled("", null, undefined)).toBeNull();
  });

  it("trims what it returns", () => {
    expect(firstFilled("  NovaFlow  ")).toBe("NovaFlow");
  });
});

describe("joinFilled", () => {
  it("does not emit the leading separators that produced 'High confidence ·  · novaflow.io'", () => {
    expect(joinFilled(["", "", "novaflow.io"])).toBe("novaflow.io");
  });

  it("joins only the filled parts", () => {
    expect(joinFilled(["B2B SaaS", "", "novaflow.io"])).toBe("B2B SaaS · novaflow.io");
  });

  it("joins all parts when all are filled", () => {
    expect(joinFilled(["B2B SaaS", "MarTech", "novaflow.io"])).toBe(
      "B2B SaaS · MarTech · novaflow.io",
    );
  });

  it("returns null when every part is blank", () => {
    expect(joinFilled(["", "  ", null, undefined])).toBeNull();
  });

  it("honours a custom separator", () => {
    expect(joinFilled(["a", "b"], ", ")).toBe("a, b");
  });
});

describe("brandChip", () => {
  const PROFILE = {
    businessId: "a@b.com",
    businessName: "ZippyGo",
    businessType: "Travel",
    industry: "Travel",
    websiteUrl: "https://www.zippygo.ai/pricing",
    description: "",
    websiteAuditScore: 0,
    geoVisibilityScore: 0,
    brand: { logo: "https://s3/logo.png" },
  } as BusinessProfile;

  it("shows the business name and its logo", () => {
    expect(brandChip(PROFILE)).toEqual({
      name: "ZippyGo",
      logo: "https://s3/logo.png",
      monogram: "Z",
      href: "https://www.zippygo.ai/pricing",
    });
  });

  it("falls back to the website's host when the name was never filled in", () => {
    // `""` is not a name — `??` would have rendered an empty chip here.
    expect(brandChip({ ...PROFILE, businessName: "" })?.name).toBe("zippygo.ai");
  });

  it("drops www and the protocol from that fallback", () => {
    expect(brandChip({ ...PROFILE, businessName: "", websiteUrl: "http://www.novaflow.io" })?.name).toBe(
      "novaflow.io",
    );
  });

  it("uses a monogram when there is no extracted logo", () => {
    const chip = brandChip({ ...PROFILE, brand: undefined });
    expect(chip?.logo).toBe("");
    expect(chip?.monogram).toBe("Z");
  });

  it("renders no chip at all when there is neither a name nor a website", () => {
    // A chip with nothing in it is worse than no chip — rule 5.
    expect(brandChip({ ...PROFILE, businessName: "", websiteUrl: "" })).toBeNull();
  });

  it("renders no chip before the profile has loaded", () => {
    expect(brandChip(null)).toBeNull();
  });

  /**
   * Stage 01 accepts a bare host, so the profile row routinely holds
   * `go.chefgaa.com` with no scheme. Passed through raw that is a RELATIVE
   * href: the header chip on every page opened
   * `/overview/go.chefgaa.com` instead of the customer's site. Seen live
   * 2026-09-07.
   */
  it("gives the bare host a scheme, so the header link is not relative", () => {
    expect(brandChip({ ...PROFILE, websiteUrl: "go.chefgaa.com" })?.href).toBe(
      "https://go.chefgaa.com",
    );
  });

  it("leaves a URL that already has a scheme alone", () => {
    expect(brandChip({ ...PROFILE, websiteUrl: "http://novaflow.io" })?.href).toBe(
      "http://novaflow.io",
    );
  });
});

describe("accountInitials", () => {
  it("takes one letter from each part of the name in the address", () => {
    expect(accountInitials("charan.pullepu@ntimes.ai")).toBe("CP");
  });

  it("splits on underscores and hyphens too", () => {
    expect(accountInitials("ravi_kumar@x.com")).toBe("RK");
    expect(accountInitials("ravi-kumar@x.com")).toBe("RK");
  });

  it("uses the first two letters when there is only one part", () => {
    expect(accountInitials("thilak@ntimes.ai")).toBe("TH");
  });

  it("stops at two letters however many parts there are", () => {
    expect(accountInitials("a.b.c.d@x.com")).toBe("AB");
  });

  it("ignores digits and punctuation rather than showing them", () => {
    expect(accountInitials("2024.team@x.com")).toBe("TE");
  });

  it("falls back to a dash when there is nothing to initial", () => {
    // Better a neutral placeholder than an empty circle or a crash.
    expect(accountInitials("")).toBe("—");
    expect(accountInitials("123@x.com")).toBe("—");
  });
});
