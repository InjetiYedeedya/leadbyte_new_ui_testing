import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cookie-backed, same fake-jar approach as `gate.test.ts`: real persistence
 * rules (round-tripping, per-business isolation, "never saved" vs. "saved
 * empty on purpose") without a real request. `getAdsLeads` is mocked so
 * `adsLeadsSummary` is tested against a fixed lead list rather than a live
 * table.
 */

const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  }),
}));

const LEADS = [
  { id: "a", name: "Alpha", email: "a@x.com", phone: "", company: "", source: "Unknown", createdAt: "" },
  { id: "b", name: "Beta", email: "b@x.com", phone: "", company: "", source: "Unknown", createdAt: "" },
  { id: "c", name: "Gamma", email: "c@x.com", phone: "", company: "", source: "Unknown", createdAt: "" },
];

vi.mock("@/lib/data/ads-leads", () => ({
  getAdsLeads: vi.fn(async () => LEADS),
}));

const { adsLeadsSummary, getSelectedLeadIds, setSelectedLeadIds } = await import("./lead-selection");

beforeEach(() => {
  jar.clear();
});

describe("getSelectedLeadIds", () => {
  it("returns null when nothing has ever been saved", async () => {
    expect(await getSelectedLeadIds("acme")).toBeNull();
  });

  it("round-trips a saved selection", async () => {
    await setSelectedLeadIds("acme", ["a", "c"]);
    expect(await getSelectedLeadIds("acme")).toEqual(["a", "c"]);
  });

  it("distinguishes an explicit empty selection from never having saved", async () => {
    await setSelectedLeadIds("acme", []);
    expect(await getSelectedLeadIds("acme")).toEqual([]);
  });

  it("keeps businesses isolated", async () => {
    await setSelectedLeadIds("acme", ["a"]);
    expect(await getSelectedLeadIds("other-biz")).toBeNull();
  });

  it("treats a malformed cookie as never saved rather than throwing", async () => {
    jar.set("leadbyte_lead_selection_acme", "{not json");
    expect(await getSelectedLeadIds("acme")).toBeNull();
  });
});

describe("adsLeadsSummary", () => {
  it("defaults to every lead selected when nothing has been saved", async () => {
    expect(await adsLeadsSummary("acme")).toEqual({ total: 3, selected: 3 });
  });

  it("counts only the saved ids that still exist in the table", async () => {
    await setSelectedLeadIds("acme", ["a", "does-not-exist"]);
    expect(await adsLeadsSummary("acme")).toEqual({ total: 3, selected: 1 });
  });

  it("reports zero selected when the saved choice was explicitly empty", async () => {
    await setSelectedLeadIds("acme", []);
    expect(await adsLeadsSummary("acme")).toEqual({ total: 3, selected: 0 });
  });
});
