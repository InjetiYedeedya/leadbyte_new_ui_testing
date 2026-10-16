import { autoLabel, buildLeadsTable, cellText, leadsTableToCsv, ownRows } from "./ads-leads-table";

/**
 * Every ad form asks different questions, so the table's columns come from
 * the rows. These pin the four rules that make that safe: what is hidden, what
 * is renamed, the order, and that no raw object ever reaches a cell.
 */

const LEAD = {
  email: "owner@shop.com",
  leadId: "L-1",
  adgroupId: "ag",
  adId: "ad",
  pageId: "pg",
  processedAt: "2026-09-20T10:00:00Z",
  form_id: "f1",
  zip: "411001",
  preferredTime: "Morning",
  fullName: "Asha Rao",
  client_email: "asha@example.com",
  status: "new",
  campaignName: "Diwali",
  phone: "+91 98765 43210",
  which_ads: "Meta",
  responseId: "R-9",
  budget_range: "10-20k",
};

describe("buildLeadsTable", () => {
  it("hides the account email, the ids and processedAt", () => {
    const keys = buildLeadsTable([LEAD]).columns.map((c) => c.key);
    for (const hidden of ["email", "leadid", "adgroupid", "adid", "pageid", "processedat", "formid"]) {
      expect(keys).not.toContain(hidden);
    }
    expect(buildLeadsTable([{ formId: "x", zip: "1" }]).columns.map((c) => c.key)).toEqual(["zip"]);
  });

  it("puts the known fields first, renamed, then the rest A→Z", () => {
    expect(buildLeadsTable([LEAD]).columns.map((c) => c.label)).toEqual([
      "Campaign Name",
      "Ads Platform",
      "Status",
      "Lead Email",
      "Full Name",
      "Phone",
      "Zip Code",
      "Response ID",
      "Budget Range",
      "Preferred Time",
    ]);
  });

  it("treats two spellings of one field as one column", () => {
    const table = buildLeadsTable([
      { campaign_name: "A", Client_Email: "a@x.com" },
      { CampaignName: "B", clientEmail: "b@x.com" },
    ]);
    expect(table.columns).toEqual([
      { key: "campaignname", label: "Campaign Name" },
      { key: "clientemail", label: "Lead Email" },
    ]);
    expect(table.rows.map((r) => r.cells.campaignname)).toEqual(["A", "B"]);
  });

  it("leaves a column out when no row has a value for it", () => {
    const table = buildLeadsTable([{ zip: "", notes: "  ", phone: "1" }]);
    expect(table.columns.map((c) => c.key)).toEqual(["phone"]);
  });

  it("leaves a blank cell absent so the table can print '-'", () => {
    const table = buildLeadsTable([{ phone: "1" }, { phone: null, zip: "2" }]);
    expect(table.rows[1]?.cells.phone).toBeUndefined();
  });

  it("orders newest first by when the lead arrived, even from a hidden field", () => {
    const table = buildLeadsTable([
      { fullName: "Old", processedAt: "2026-09-01T00:00:00Z" },
      { fullName: "Undated" },
      { fullName: "New", receivedAt: "2026-09-10T00:00:00Z" },
    ]);
    expect(table.rows.map((r) => r.cells.fullname)).toEqual(["New", "Old", "Undated"]);
  });

  it("gives every row a unique id even when leadId repeats", () => {
    const ids = buildLeadsTable([{ leadId: "L", zip: "1" }, { leadId: "L", zip: "2" }]).rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("ignores rows that are not objects", () => {
    expect(buildLeadsTable([null, "x", [1], { zip: "1" }]).rows).toHaveLength(1);
  });
});

describe("autoLabel", () => {
  it.each([
    ["preferredTime", "Preferred Time"],
    ["budget_range", "Budget Range"],
    ["utm_source", "UTM Source"],
    ["user_id", "User ID"],
    ["notes", "Notes"],
    ["HTTPStatus", "HTTP Status"],
  ])("%s → %s", (key, label) => {
    expect(autoLabel(key)).toBe(label);
  });
});

describe("cellText", () => {
  it("stringifies nested objects and arrays as readable text, never [object Object]", () => {
    expect(cellText({ city: "Pune", zip: 411001, empty: "" })).toBe("city: Pune; zip: 411001");
    expect(cellText(["a", { b: 1 }, null])).toBe("a, b: 1");
    expect(cellText({ inner: { deep: true } })).toBe("inner: deep: Yes");
  });

  it("is blank for missing values", () => {
    expect(cellText(null)).toBe("");
    expect(cellText(undefined)).toBe("");
    expect(cellText("   ")).toBe("");
    expect(cellText({})).toBe("");
    expect(cellText(Number.NaN)).toBe("");
  });
});

describe("ownRows", () => {
  it("drops a row that names another account, keeps own and unowned rows", () => {
    const rows = ownRows(
      [{ email: "Owner@Shop.com", zip: "1" }, { email: "other@x.com", zip: "2" }, { zip: "3" }],
      "owner@shop.com",
    );
    expect(rows).toHaveLength(2);
  });
});

describe("leadsTableToCsv", () => {
  it("writes the columns as shown, blanks as empty, and quotes what needs it", () => {
    const table = buildLeadsTable([
      { fullName: 'Asha "A" Rao', zip: "411001" },
      { fullName: "Ravi, Jr", phone: "+91 98765 43210" },
    ]);
    expect(leadsTableToCsv(table)).toBe(
      ["Full Name,Phone,Zip Code", '"Asha ""A"" Rao",,411001', '"Ravi, Jr",+91 98765 43210,'].join("\r\n"),
    );
  });

  it("neutralises a cell a spreadsheet would run as a formula", () => {
    const csv = leadsTableToCsv(buildLeadsTable([{ fullName: "=HYPERLINK(1)", notes: "-cmd" }]));
    expect(csv.split("\r\n")[1]).toBe("'=HYPERLINK(1),'-cmd");
  });
});
