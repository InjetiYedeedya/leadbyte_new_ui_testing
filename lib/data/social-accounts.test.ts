import {
  describeSocialAccounts,
  parseSocialAccounts,
  parseSocialAccountsParam,
  readFlatSocialAccount,
  socialAccountsCookie,
  socialDeclinedCookie,
  socialOfferCookie,
} from "./social-accounts";

/**
 * Reading the account a social connection landed on.
 *
 * The YouTube and Facebook payloads below are both real, captured 2026-09-11.
 * Instagram's has not been, which is why the parser tries several key spellings
 * rather than hard-coding the two that are known.
 */

const YOUTUBE = [{ title: "Leadbyte ai", channel_id: "UCtNTWWeRwJho3TlNvfsH0lg" }];

describe("parseSocialAccounts", () => {
  it("reads the observed YouTube payload", () => {
    expect(parseSocialAccounts(YOUTUBE)).toEqual([
      { name: "Leadbyte ai", id: "UCtNTWWeRwJho3TlNvfsH0lg" },
    ]);
  });

  it("accepts a single object as well as a list", () => {
    expect(parseSocialAccounts(YOUTUBE[0])).toEqual([
      { name: "Leadbyte ai", id: "UCtNTWWeRwJho3TlNvfsH0lg" },
    ]);
  });

  it("reads the other providers' spellings of the same two facts", () => {
    expect(parseSocialAccounts([{ name: "LeadByte Page", id: "123" }])[0]).toEqual({
      name: "LeadByte Page",
      id: "123",
    });
    expect(parseSocialAccounts([{ page_name: "LeadByte", page_id: "99" }])[0]).toEqual({
      name: "LeadByte",
      id: "99",
    });
    expect(parseSocialAccounts([{ username: "leadbyte", account_id: "77" }])[0]).toEqual({
      name: "leadbyte",
      id: "77",
    });
  });

  it("falls back to the id when the provider sent no name", () => {
    expect(parseSocialAccounts([{ channel_id: "UC123" }])[0]).toEqual({
      name: "UC123",
      id: "UC123",
    });
  });

  /**
   * An entry with neither would render a blank line under "Connected", which
   * reads worse than showing nothing at all.
   */
  it("drops entries with neither a name nor an id", () => {
    expect(parseSocialAccounts([{ unrelated: "x" }, null, "nonsense", 7])).toEqual([]);
  });

  it("survives a payload that is not a list of objects", () => {
    expect(parseSocialAccounts(null)).toEqual([]);
    expect(parseSocialAccounts(undefined)).toEqual([]);
    expect(parseSocialAccounts("")).toEqual([]);
  });
});

/**
 * The two shapes that actually arrive, captured from a real connect on
 * 2026-09-11. The first version of this parser handled NEITHER — it expected
 * `?accounts=[{title, channel_id}]`, which is the shape nobody sends.
 */
describe("the real callback payloads", () => {
  it("reads Facebook's pages, not the person who authorised", () => {
    // Observed: [{ user: {...}, pages: [...] }]. The agent posts to a page, so
    // naming "Thilak Sai" would name the one account it will never post as.
    const facebook = [
      {
        user: { id: "122124108363163650", name: "Thilak Sai" },
        pages: [
          { id: "1077389505465009", name: "Ntimes AI" },
          { id: "1064631706727201", name: "Healzy" },
          { id: "1002719136257600", name: "LeadByte AI" },
        ],
      },
    ];

    const accounts = parseSocialAccounts(facebook);
    expect(accounts.map((a) => a.name)).toEqual(["Ntimes AI", "Healzy", "LeadByte AI"]);
    expect(accounts.map((a) => a.name)).not.toContain("Thilak Sai");
  });

  it("reads YouTube from flat query parameters, which carry no JSON at all", () => {
    // Observed: ?status=success&platform=youtube&title=Leadbyte+ai&channel_id=UC…
    const params = new URLSearchParams(
      "status=success&platform=youtube&title=Leadbyte+ai&channel_id=UCtNTWWeRwJho3TlNvfsH0lg",
    );
    expect(readFlatSocialAccount(params)).toEqual([
      { name: "Leadbyte ai", id: "UCtNTWWeRwJho3TlNvfsH0lg" },
    ]);
  });

  it("reads nothing from a return that names no account", () => {
    expect(readFlatSocialAccount(new URLSearchParams("status=success&platform=instagram"))).toEqual(
      [],
    );
  });
});

describe("parseSocialAccountsParam", () => {
  it("reads the raw query parameter", () => {
    expect(parseSocialAccountsParam(JSON.stringify(YOUTUBE))[0]!.name).toBe("Leadbyte ai");
  });

  it("never throws on a malformed parameter", () => {
    // A broken value means "we don't know the name", never a broken page — the
    // connection itself is still valid.
    expect(parseSocialAccountsParam("{not json")).toEqual([]);
    expect(parseSocialAccountsParam("")).toEqual([]);
    expect(parseSocialAccountsParam(null)).toEqual([]);
  });
});

describe("describeSocialAccounts", () => {
  it("names one, and names two", () => {
    expect(describeSocialAccounts([{ name: "Leadbyte ai", id: "1" }])).toBe("Leadbyte ai");
    expect(
      describeSocialAccounts([
        { name: "Leadbyte ai", id: "1" },
        { name: "Second", id: "2" },
      ]),
    ).toBe("Leadbyte ai, Second");
  });

  it("counts the rest rather than listing them, because a row is one line", () => {
    const many = ["A", "B", "C", "D"].map((name, i) => ({ name, id: String(i) }));
    expect(describeSocialAccounts(many)).toBe("A, B +2 more");
  });

  it("says nothing when there is nothing to say", () => {
    expect(describeSocialAccounts([])).toBeNull();
  });
});

describe("socialAccountsCookie", () => {
  it("carries the leadbyte_ prefix, so signing out sweeps it", () => {
    // `lib/auth/sign-out.ts` clears by prefix. A channel name left behind on a
    // shared browser would be shown to whoever signs in next.
    expect(socialAccountsCookie("youtube").startsWith("leadbyte_")).toBe(true);
  });

  it("keeps one cookie per platform", () => {
    expect(socialAccountsCookie("youtube")).not.toBe(socialAccountsCookie("facebook"));
  });

  /**
   * The offer is the list still waiting to be picked from; the record is the
   * one account chosen. Sharing a name would mean the picker's own list read
   * back as "we post to all five", which is the opposite of what it means.
   */
  it("keeps the offer apart from the record, and sweeps on sign-out too", () => {
    expect(socialOfferCookie("facebook")).not.toBe(socialAccountsCookie("facebook"));
    expect(socialOfferCookie("facebook").startsWith("leadbyte_")).toBe(true);
  });

  /**
   * The refusal has to be its own name too: it outlives the offer it refused,
   * and it is what holds the platform at "Not connected" afterwards.
   */
  it("names the refusal apart from both, and sweeps on sign-out", () => {
    const names = new Set([
      socialAccountsCookie("facebook"),
      socialOfferCookie("facebook"),
      socialDeclinedCookie("facebook"),
    ]);
    expect(names.size).toBe(3);
    expect(socialDeclinedCookie("facebook").startsWith("leadbyte_")).toBe(true);
    expect(socialDeclinedCookie("facebook")).not.toBe(socialDeclinedCookie("youtube"));
  });
});
