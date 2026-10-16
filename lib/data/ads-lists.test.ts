import {
  adsListPath,
  decodePick,
  decodePicks,
  encodePick,
  parseAdsList,
  readAdsList,
  readAudienceType,
  UnreadableAdsListError,
} from "./ads-lists";

describe("adsListPath", () => {
  it("is a fixed menu of five", () => {
    expect(adsListPath("google", "audiences")).toBe("/api/webhook/google-retargeting");
    expect(adsListPath("meta", "lead-forms")).toBe("/api/webhook/meta-instant-forms");
    expect(adsListPath("google", "store-locations")).toBe("/api/webhook/google-store-locations");
    expect(adsListPath("meta", "store-locations")).toBeNull();
    expect(adsListPath("google", "../admin")).toBeNull();
  });
});

describe("parseAdsList", () => {
  it("reads the shapes n8n answers in", () => {
    expect(parseAdsList([{ id: "1", name: "Site visitors" }])).toHaveLength(1);
    expect(parseAdsList({ audiences: [{ audience_id: 2, audience_name: "Buyers", size: 1200 }] })[0]).toMatchObject({
      id: "2",
      name: "Buyers",
      detail: "1200",
    });
    expect(parseAdsList([{ forms: [{ form_id: "f1", form_name: "Quote" }] }])[0]?.name).toBe("Quote");
    expect(parseAdsList(JSON.stringify({ data: [{ id: "x" }] }))[0]?.name).toBe("x");
  });

  it("keeps a store's profile id and asset set, and its address", () => {
    const [store] = parseAdsList({
      locations: [{ location_id: "L1", business_name: "Edison store", address: "1 Main St", business_profile_id: "gbp-9", asset_set: "as-3" }],
    });
    expect(store).toEqual({ id: "L1", name: "Edison store", detail: "1 Main St", profileId: "gbp-9", assetSet: "as-3" });
  });

  it("drops items with no id and duplicates", () => {
    expect(parseAdsList([{ name: "no id" }, { id: "a" }, { id: "a" }])).toHaveLength(1);
  });

  it("reads a genuinely empty list as empty", () => {
    expect(parseAdsList([])).toEqual([]);
    expect(parseAdsList({ audiences: [] })).toEqual([]);
    expect(parseAdsList([{ forms: [] }])).toEqual([]);
    expect(parseAdsList(JSON.stringify({ data: [] }))).toEqual([]);
  });

  it("reports a reply with no list in it as an error, never as an empty list", () => {
    // `/api/ads/lists` turns the throw into `ok: false`, which the picker shows
    // as "Unable to load … Please try again." rather than "you have none".
    for (const reply of [{ received: true }, null, undefined, "", "not json", 42, { data: { nope: 1 } }, [{ received: true }], [{ message: "ok" }, "x"]]) {
      expect(readAdsList(reply)).toBeNull();
      expect(() => parseAdsList(reply)).toThrow(UnreadableAdsListError);
    }
  });
});

describe("picks", () => {
  it("round-trips a choice through the form, once each", () => {
    const raw = encodePick({ id: "L1", name: "Store", detail: "", profileId: "gbp", assetSet: "as" });
    expect(decodePick(raw)).toEqual({ id: "L1", name: "Store", profileId: "gbp", assetSet: "as" });
    expect(decodePicks([raw, raw, "junk", ""])).toHaveLength(1);
  });

  it("reads the audience type, defaulting to a new audience", () => {
    expect(readAudienceType("retargeting")).toBe("retargeting");
    expect(readAudienceType("anything")).toBe("new");
    expect(readAudienceType(null)).toBe("new");
  });
});
