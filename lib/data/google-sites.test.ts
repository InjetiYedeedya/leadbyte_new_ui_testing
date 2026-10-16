import {
  findGoogleSites,
  parseGoogleSites,
  siteKind,
  siteLabel,
} from "./google-sites";

/** Google's own `webmasters.sites.list` rows, which is what n8n forwards. */
const RAW = [
  { siteUrl: "sc-domain:zippygo.ai", permissionLevel: "siteOwner" },
  { siteUrl: "https://zippygo.ai/", permissionLevel: "siteOwner" },
  { siteUrl: "http://www.zippygo.ai/", permissionLevel: "siteFullUser" },
];

describe("parseGoogleSites", () => {
  it("reads the documented shape", () => {
    const out = parseGoogleSites(JSON.stringify(RAW));

    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({
      siteUrl: "sc-domain:zippygo.ai",
      permissionLevel: "siteOwner",
      email: "",
      name: "",
    });
  });

  it("survives the cookie round trip", () => {
    const once = parseGoogleSites(RAW);

    expect(parseGoogleSites(JSON.stringify(once))).toEqual(once);
  });

  it("accepts a snake_case site_url as well as Google's siteUrl", () => {
    expect(parseGoogleSites([{ site_url: "https://a.test/" }])[0]?.siteUrl).toBe(
      "https://a.test/",
    );
  });

  it("drops rows with no site URL — they cannot be selected", () => {
    expect(parseGoogleSites([{ permissionLevel: "siteOwner" }, RAW[0]])).toHaveLength(1);
  });

  it("returns nothing for junk rather than throwing", () => {
    expect(parseGoogleSites("not json")).toEqual([]);
    expect(parseGoogleSites(null)).toEqual([]);
    expect(parseGoogleSites("")).toEqual([]);
  });
});

describe("findGoogleSites", () => {
  it("digs sites out of the combined flow's nested object", () => {
    const data = { email: "a@b.c", search_console: { sites: RAW } };

    expect(findGoogleSites(JSON.stringify(data))).toHaveLength(3);
  });

  it("does not double-count a site reachable by two paths", () => {
    expect(findGoogleSites({ a: RAW, b: RAW })).toHaveLength(3);
  });

  it("finds nothing in an Analytics property list, which has no site URLs", () => {
    const properties = [{ account_name: "A", property_id: "1", property_name: "p" }];

    expect(findGoogleSites(properties)).toEqual([]);
  });
});

describe("siteLabel / siteKind", () => {
  it("shows a domain property as the domain, not Google's wire format", () => {
    expect(siteLabel(parseGoogleSites(RAW)[0]!)).toBe("zippygo.ai");
    expect(siteKind(parseGoogleSites(RAW)[0]!)).toMatch(/^Domain/);
  });

  it("leaves a URL prefix as the URL it is", () => {
    expect(siteLabel(parseGoogleSites(RAW)[1]!)).toBe("https://zippygo.ai/");
    expect(siteKind(parseGoogleSites(RAW)[1]!)).toBe("URL prefix");
  });
});

/** The exact payload the Search Console flow returns (backend, 2026-09-03). */
const SEARCH_CONSOLE_FLOW = [
  {
    site_url: "sc-domain:leadbyte.ai",
    permission_level: "siteOwner",
    email: "apps@ntimes.ai",
    name: "apps ntimes",
  },
  {
    site_url: "https://leadbyte.ai/",
    permission_level: "siteOwner",
    email: "apps@ntimes.ai",
    name: "apps ntimes",
  },
];

describe("the Search Console flow's payload", () => {
  it("reads every field, all of them snake_case and per-row", () => {
    const sites = findGoogleSites(JSON.stringify(SEARCH_CONSOLE_FLOW));

    expect(sites).toEqual([
      {
        siteUrl: "sc-domain:leadbyte.ai",
        permissionLevel: "siteOwner",
        email: "apps@ntimes.ai",
        name: "apps ntimes",
      },
      {
        siteUrl: "https://leadbyte.ai/",
        permissionLevel: "siteOwner",
        email: "apps@ntimes.ai",
        name: "apps ntimes",
      },
    ]);
  });

  it("leads with the domain property, which is the one worth defaulting to", () => {
    // It covers every subdomain and both protocols, so it is the safe default —
    // and the backend happens to send it first, so no reordering is needed.
    const [first] = findGoogleSites(SEARCH_CONSOLE_FLOW);

    expect(siteLabel(first!)).toBe("leadbyte.ai");
    expect(siteKind(first!)).toMatch(/^Domain/);
  });

  it("survives the cookie round trip that carries it to the picker", () => {
    const sites = findGoogleSites(SEARCH_CONSOLE_FLOW);

    expect(findGoogleSites(JSON.stringify(sites))).toEqual(sites);
  });
});
