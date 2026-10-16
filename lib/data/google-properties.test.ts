import {
  findGoogleProperties,
  groupByAccount,
  parseGoogleProperties,
} from "./google-properties";

/** The exact payload the backend returns after consent (2026-09-03). */
const RAW = [
  {
    account_name: "Zippygo.ai",
    property_id: "508182301",
    property_name: "Zippygo.ai",
    email: "accounts@zippygo.ai",
    name: "accounts gozippy",
  },
  {
    account_name: "Zippygo.ai",
    property_id: "534929423",
    property_name: "zippygo-2026",
    email: "accounts@zippygo.ai",
    name: "accounts gozippy",
  },
  {
    account_name: "Default Account for Firebase",
    property_id: "511158572",
    property_name: "zippygo-b979d",
    email: "accounts@zippygo.ai",
    name: "accounts gozippy",
  },
];

describe("parseGoogleProperties", () => {
  it("reads the documented shape", () => {
    const out = parseGoogleProperties(JSON.stringify(RAW));

    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({
      accountName: "Zippygo.ai",
      propertyId: "508182301",
      propertyName: "Zippygo.ai",
      email: "accounts@zippygo.ai",
      name: "accounts gozippy",
    });
  });

  it("accepts an already-parsed array as well as a JSON string", () => {
    expect(parseGoogleProperties(RAW)).toHaveLength(3);
  });

  it("wraps a single object, since one property need not arrive as an array", () => {
    expect(parseGoogleProperties(JSON.stringify(RAW[0]))).toHaveLength(1);
  });

  it("drops rows with no property id — they cannot be selected", () => {
    const out = parseGoogleProperties([
      { account_name: "A", property_name: "no id" },
      RAW[0],
    ]);

    expect(out).toHaveLength(1);
    expect(out[0]?.propertyId).toBe("508182301");
  });

  it("falls back to the id when a property has no name", () => {
    const out = parseGoogleProperties([{ property_id: "123", account_name: "A" }]);

    expect(out[0]?.propertyName).toBe("123");
  });

  it("survives the cookie round trip, which re-serialises camelCase keys", () => {
    const once = parseGoogleProperties(RAW);
    const twice = parseGoogleProperties(JSON.stringify(once));

    expect(twice).toEqual(once);
  });

  it("returns nothing for junk rather than throwing", () => {
    expect(parseGoogleProperties("not json")).toEqual([]);
    expect(parseGoogleProperties(null)).toEqual([]);
    expect(parseGoogleProperties(undefined)).toEqual([]);
    expect(parseGoogleProperties("")).toEqual([]);
  });

  it("caps the list so a huge account cannot overflow the cookie it rides in", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      account_name: "A",
      property_id: String(i),
      property_name: `p${i}`,
    }));

    expect(parseGoogleProperties(many).length).toBeLessThanOrEqual(50);
  });
});

describe("groupByAccount", () => {
  it("groups properties under their account, preserving order", () => {
    const groups = groupByAccount(parseGoogleProperties(RAW));

    expect(groups.map((g) => g.accountName)).toEqual([
      "Zippygo.ai",
      "Default Account for Firebase",
    ]);
    expect(groups[0]?.properties).toHaveLength(2);
    expect(groups[1]?.properties).toHaveLength(1);
  });

  it("puts unnamed accounts under a readable heading", () => {
    const groups = groupByAccount(parseGoogleProperties([{ property_id: "1" }]));

    expect(groups[0]?.accountName).toBe("Other");
  });
});

describe("findGoogleProperties", () => {
  it("reads the plain array the Analytics flow sends", () => {
    expect(findGoogleProperties(JSON.stringify(RAW))).toHaveLength(3);
  });

  it("digs properties out of the combined flow's nested object", () => {
    const data = { email: "a@b.c", analytics: { properties: RAW } };

    expect(findGoogleProperties(JSON.stringify(data))).toHaveLength(3);
  });

  it("does not double-count a property reachable by two paths", () => {
    const data = { analytics: RAW, all: RAW };

    expect(findGoogleProperties(data)).toHaveLength(3);
  });

  it("finds nothing in a Search Console site list, which has no property ids", () => {
    const sites = [{ siteUrl: "https://zippygo.ai/", permissionLevel: "siteOwner" }];

    expect(findGoogleProperties(sites)).toEqual([]);
  });

  it("survives a cycle rather than hanging on it", () => {
    const node: Record<string, unknown> = { properties: RAW };
    node.self = node;

    expect(findGoogleProperties(node)).toHaveLength(3);
  });
});

describe("groupByAccount ordering", () => {
  it("pushes Firebase's auto-created account last, however early it arrives", () => {
    // The combined flow returns it FIRST, and the picker pre-selects the first
    // row — which would have defaulted the workspace to an unrelated project.
    const groups = groupByAccount(
      parseGoogleProperties([
        { account_name: "Default Account for Firebase", property_id: "1", property_name: "auto" },
        { account_name: "Leadbyte AI", property_id: "2", property_name: "Leadbyte AI" },
      ]),
    );

    expect(groups.map((g) => g.accountName)).toEqual([
      "Leadbyte AI",
      "Default Account for Firebase",
    ]);
  });
});
