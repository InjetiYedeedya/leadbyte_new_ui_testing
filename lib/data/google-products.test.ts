import {
  grantedGoogleProducts,
  hasGoogleProduct,
  mergeGoogleProducts,
  parseGoogleProducts,
  productsForReturn,
} from "./google-products";

describe("parseGoogleProducts", () => {
  it("reads the products a row lists", () => {
    expect(parseGoogleProducts("analytics,search_console")).toEqual(["analytics", "search_console"]);
    expect(parseGoogleProducts("search_console")).toEqual(["search_console"]);
    expect(parseGoogleProducts("")).toEqual([]);
    expect(parseGoogleProducts("analytics, bogus")).toEqual(["analytics"]);
  });

  it("is null for a row written before the field existed", () => {
    expect(parseGoogleProducts(undefined)).toBeNull();
  });
});

describe("grantedGoogleProducts", () => {
  it("unions the products across valid rows", () => {
    const granted = grantedGoogleProducts([
      { googleProducts: "analytics" },
      { googleProducts: "search_console" },
    ]);
    expect(hasGoogleProduct(granted, "analytics")).toBe(true);
    expect(hasGoogleProduct(granted, "search_console")).toBe(true);
  });

  it("does not claim Search Console for an Analytics-only grant", () => {
    const granted = grantedGoogleProducts([{ googleProducts: "analytics" }]);
    expect(hasGoogleProduct(granted, "search_console")).toBe(false);
  });

  it("reads a row with no field as both, as the app always has", () => {
    expect(grantedGoogleProducts([{ Status: "Done" }])).toBe("all");
  });
});

describe("productsForReturn", () => {
  it("is what the started flow asked for", () => {
    expect(productsForReturn("analytics", { properties: 0, sites: 0 })).toEqual(["analytics"]);
    expect(productsForReturn("search-console", { properties: 0, sites: 3 })).toEqual(["search_console"]);
    expect(productsForReturn("unified", { properties: 0, sites: 0 })).toEqual(["analytics", "search_console"]);
  });

  it("falls back to what came back when the flow is not known", () => {
    expect(productsForReturn(null, { properties: 2, sites: 0 })).toEqual(["analytics"]);
    expect(productsForReturn(null, { properties: 0, sites: 0 })).toEqual([]);
  });
});

describe("mergeGoogleProducts", () => {
  it("keeps an earlier grant when a second product is connected", () => {
    expect(mergeGoogleProducts(new Set(["analytics"]), ["search_console"])).toBe(
      "analytics,search_console",
    );
  });

  it("keeps an old both-products row as both", () => {
    expect(mergeGoogleProducts("all", ["analytics"])).toBe("analytics,search_console");
  });

  it("writes only what was granted on a first connect", () => {
    expect(mergeGoogleProducts(new Set(), ["search_console"])).toBe("search_console");
  });
});
