import { leadsToCsv, mapAdsLeads, type AdsLead } from "./ads-leads";

/**
 * `leadbyte-leads`'s real shape, confirmed against a live query (2026-09-18):
 * `email` is the ACCOUNT's own address on every row (the table's partition
 * key), never the lead's — that is the exact bug the first version of this
 * mapper shipped with, caught by testing it against real data rather than a
 * guessed fixture.
 */
const REAL_ROW = {
  zip: "",
  status: "New",
  receivedAt: "2026-08-26T10:47:09.484220Z",
  client_email: "owner@greenleaf-cafe.example",
  processedAt: "2026-08-26T10:47:09.484220Z",
  fullName: "Green Leaf Cafe",
  email: "apps@ntimes.ai",
  phone: "+61 2 5550 0100",
  leadId: "02995c7f-0256-43d1-9108-6b037d5e8144",
};

describe("mapAdsLeads", () => {
  it("reads a real row correctly — the lead's email, not the account's", () => {
    const leads = mapAdsLeads([REAL_ROW]);
    expect(leads).toEqual([
      {
        id: "02995c7f-0256-43d1-9108-6b037d5e8144",
        name: "Green Leaf Cafe",
        email: "owner@greenleaf-cafe.example",
        phone: "+61 2 5550 0100",
        company: "",
        source: "Unknown",
        createdAt: "2026-08-26T10:47:09.484220Z",
      },
    ]);
  });

  it("never reads the account's own `email` field as a lead's address", () => {
    // The regression test for the bug this shipped with: every "lead" showed
    // the same address because `email` — the account's own — was read
    // before `client_email`. A row with no `client_email` at all must be
    // dropped, not silently fall back to the account's address.
    const leads = mapAdsLeads([{ email: "account@business.com", fullName: "No client email" }]);
    expect(leads).toEqual([]);
  });

  it("finds rows nested under data or items, the same as mapLeadActivity", () => {
    expect(mapAdsLeads({ data: [{ client_email: "a@b.com" }] })).toHaveLength(1);
    expect(mapAdsLeads({ items: [{ client_email: "a@b.com" }] })).toHaveLength(1);
  });

  it("drops a row with no client_email — a name with no address is not a lead", () => {
    const leads = mapAdsLeads([{ fullName: "No Address" }, { client_email: "real@lead.com" }]);
    expect(leads).toHaveLength(1);
    expect(leads[0]!.email).toBe("real@lead.com");
  });

  it("falls back id to the lead's email when a row has no leadId — selection must always find something", () => {
    const leads = mapAdsLeads([{ client_email: "a@b.com" }]);
    expect(leads[0]!.id).toBe("a@b.com");
  });

  it("defaults an unreadable source to Unknown — there is no such field in the real shape", () => {
    const leads = mapAdsLeads([{ client_email: "a@b.com" }]);
    expect(leads[0]!.source).toBe("Unknown");
  });

  it("sorts newest first, by receivedAt", () => {
    const leads = mapAdsLeads([
      { client_email: "old@lead.com", receivedAt: "2026-01-01" },
      { client_email: "new@lead.com", receivedAt: "2026-09-01" },
    ]);
    expect(leads.map((l) => l.email)).toEqual(["new@lead.com", "old@lead.com"]);
  });

  it("returns nothing when there is no array to find anywhere", () => {
    expect(mapAdsLeads({ status: "ok" })).toEqual([]);
    expect(mapAdsLeads(null)).toEqual([]);
    expect(mapAdsLeads(undefined)).toEqual([]);
  });
});

describe("leadsToCsv", () => {
  const LEAD: AdsLead = {
    id: "02995c7f-0256-43d1-9108-6b037d5e8144",
    name: "Green Leaf Cafe",
    email: "owner@greenleaf-cafe.example",
    phone: "+61 2 5550 0100",
    company: "",
    source: "Unknown",
    createdAt: "2026-08-26T10:47:09.484220Z",
  };

  it("writes a header row and one row per lead", () => {
    const csv = leadsToCsv([LEAD]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("name,email,phone,company,source,created_at");
    expect(lines[1]).toBe(
      "Green Leaf Cafe,owner@greenleaf-cafe.example,+61 2 5550 0100,,Unknown,2026-08-26T10:47:09.484220Z",
    );
  });

  it("quotes a field that contains a comma", () => {
    const csv = leadsToCsv([{ ...LEAD, company: "Acme, Inc" }]);
    expect(csv).toContain('"Acme, Inc"');
  });

  it("escapes a quote inside a field by doubling it", () => {
    const csv = leadsToCsv([{ ...LEAD, name: 'Jane "JD" Doe' }]);
    expect(csv).toContain('"Jane ""JD"" Doe"');
  });

  it("neutralises a field a spreadsheet would run as a formula, but not a phone number", () => {
    const csv = leadsToCsv([{ ...LEAD, name: '=HYPERLINK("x")' }]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(",+61 2 5550 0100,");
  });

  it("produces just the header for no leads, not an error", () => {
    expect(leadsToCsv([])).toBe("name,email,phone,company,source,created_at");
  });
});
