import { findGoogleProperties, propertyNumber } from "./google-properties";
import { findGoogleSites, siteKind, siteLabel } from "./google-sites";

/**
 * The exact payload the "connect both" flow returns (backend, 2026-09-03).
 *
 * Three things in it differ from the Analytics-only flow, and each one broke
 * something: it is an ARRAY wrapping a single object; `email` and `name` sit on
 * that wrapper rather than on every row; and `property_id` arrives as Google's
 * resource name (`properties/517246553`) instead of a bare number.
 */
const UNIFIED = [
  {
    email: "apps@ntimes.ai",
    name: "apps ntimes",
    analytics_properties: [
      {
        account_name: "Default Account for Firebase",
        property_id: "properties/517246553",
        property_name: "mediguide-f6720",
      },
      {
        account_name: "Leadbyte AI",
        property_id: "properties/531063634",
        property_name: "Leadbyte AI",
      },
      {
        account_name: "Leadbyte AI",
        property_id: "properties/534916961",
        property_name: "Healzy",
      },
    ],
    search_console_sites: [
      { site_url: "https://leadbyte.ai/", permission_level: "siteOwner" },
      { site_url: "sc-domain:leadbyte.ai", permission_level: "siteOwner" },
    ],
    has_analytics: true,
    has_search_console: true,
  },
];

const raw = JSON.stringify(UNIFIED);

describe("the combined Google flow's payload", () => {
  it("finds every Analytics property under its wrapper key", () => {
    const properties = findGoogleProperties(raw);

    expect(properties.map((p) => p.propertyName)).toEqual([
      "mediguide-f6720",
      "Leadbyte AI",
      "Healzy",
    ]);
  });

  it("finds every Search Console site under its wrapper key", () => {
    expect(findGoogleSites(raw).map((s) => s.siteUrl)).toEqual([
      "https://leadbyte.ai/",
      "sc-domain:leadbyte.ai",
    ]);
  });

  it("gives rows the account email and name that only the wrapper carries", () => {
    // Without this the picker cannot say who the customer is connected as.
    expect(findGoogleProperties(raw).every((p) => p.email === "apps@ntimes.ai")).toBe(true);
    expect(findGoogleProperties(raw).every((p) => p.name === "apps ntimes")).toBe(true);
    expect(findGoogleSites(raw).every((s) => s.email === "apps@ntimes.ai")).toBe(true);
  });

  it("gives sites the wrapper's name too, since they declare the field", () => {
    expect(findGoogleSites(raw).every((s) => s.name === "apps ntimes")).toBe(true);
  });

  it("keeps the resource-name id but shows the bare number", () => {
    const property = findGoogleProperties(raw)[0]!;

    expect(property.propertyId).toBe("properties/517246553");
    expect(propertyNumber(property)).toBe("517246553");
  });

  it("reads permission_level and tells a domain property from a prefix", () => {
    const [prefix, domain] = findGoogleSites(raw);

    expect(prefix?.permissionLevel).toBe("siteOwner");
    expect(siteLabel(prefix!)).toBe("https://leadbyte.ai/");
    expect(siteKind(prefix!)).toBe("URL prefix");
    expect(siteLabel(domain!)).toBe("leadbyte.ai");
    expect(siteKind(domain!)).toMatch(/^Domain/);
  });

  it("survives the cookie round trip that carries it to the picker", () => {
    const properties = findGoogleProperties(raw);
    const sites = findGoogleSites(raw);

    expect(findGoogleProperties(JSON.stringify(properties))).toEqual(properties);
    expect(findGoogleSites(JSON.stringify(sites))).toEqual(sites);
  });
});
