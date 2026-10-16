import {
  TABLE_CANDIDATES,
  matchWebsiteRow,
  sameWebsite,
} from "@/lib/data/ads-website-details";

describe("sameWebsite", () => {
  it("matches however the two sides spell the same site", () => {
    // We store a bare host; the backend row could carry anything.
    expect(sameWebsite("go.chefgaa.com", "https://go.chefgaa.com")).toBe(true);
    expect(sameWebsite("go.chefgaa.com", "https://go.chefgaa.com/")).toBe(true);
    expect(sameWebsite("https://www.chefgaa.com", "chefgaa.com")).toBe(true);
    expect(sameWebsite("CHEFGAA.COM", "chefgaa.com")).toBe(true);
  });

  it("does not match a different site", () => {
    expect(sameWebsite("chefgaa.com", "zippygo.ai")).toBe(false);
    // A subdomain is a different site: go.chefgaa.com's ad data is not
    // chefgaa.com's.
    expect(sameWebsite("go.chefgaa.com", "chefgaa.com")).toBe(false);
  });

  it("never matches on an empty value", () => {
    // Otherwise a row with no website would match every account.
    expect(sameWebsite("", "chefgaa.com")).toBe(false);
    expect(sameWebsite("chefgaa.com", "")).toBe(false);
  });
});

describe("matchWebsiteRow", () => {
  const rows = [
    { website_url: "https://zippygo.ai", businessName: "ZippyGo" },
    { websiteUrl: "go.chefgaa.com", businessName: "Chefgaa", city: "Chennai" },
  ];

  it("finds the row for this website, whichever key holds it", () => {
    expect(matchWebsiteRow(rows, "go.chefgaa.com")?.businessName).toBe("Chefgaa");
    expect(matchWebsiteRow(rows, "https://zippygo.ai/")?.businessName).toBe("ZippyGo");
  });

  it("is null when no row is for this site", () => {
    // Showing another site's ad details would be worse than showing none.
    expect(matchWebsiteRow(rows, "example.com")).toBeNull();
  });

  it("returns the only row when it carries no website at all", () => {
    // Some tables are one row per user with the site implied. Trusting it is
    // safe only when there is exactly one and nothing contradicts it.
    expect(matchWebsiteRow([{ businessName: "Solo" }], "anything.com")?.businessName).toBe("Solo");
    expect(matchWebsiteRow([{ businessName: "A" }, { businessName: "B" }], "x.com")).toBeNull();
  });

  it("survives rows that are not objects", () => {
    expect(matchWebsiteRow(["nope", null, 7], "x.com")).toBeNull();
    expect(matchWebsiteRow([], "x.com")).toBeNull();
  });
});

describe("TABLE_CANDIDATES", () => {
  it("tries the name as given first, then the plausible spellings", () => {
    // The confirmed name (2026-09-08) is `ads-website_details`. The
    // requirement said "ads-website details" — with a space, which is
    // unusual for a table name. Rather than guess, all three are tried and the
    // one that answers is logged.
    expect(TABLE_CANDIDATES[0]).toBe("ads-website_details");
    // The guesses are gone now the real name is known — see the note there.
    expect(TABLE_CANDIDATES).toHaveLength(1);
  });
});
