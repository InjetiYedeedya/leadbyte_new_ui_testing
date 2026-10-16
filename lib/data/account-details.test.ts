import { accountDetailsFromRow, accountDetailsFromRows } from "./account-details";

describe("accountDetailsFromRow", () => {
  it("reads an ad account our picker saved, with its id, currency and business", () => {
    const row = {
      Status: "Done",
      selectedAccount: JSON.stringify({
        id: "100000000000002",
        name: "Zippygo Travel",
        currency: "usd",
        businessName: "AI AGENT LLC",
      }),
    };
    expect(accountDetailsFromRow(row)).toEqual({
      name: "Zippygo Travel",
      id: "100000000000002",
      facts: ["USD", "Business: AI AGENT LLC"],
    });
  });

  it("reads the Google targets, naming the site as a fact", () => {
    const row = { selectedAccount: { name: "Main site", property: "Main site", propertyId: "123", site: "https://acme.com/" } };
    expect(accountDetailsFromRow(row)).toEqual({ name: "Main site", id: "123", facts: ["Site: https://acme.com/"] });
  });

  it("falls back to the row's own fields when n8n wrote it", () => {
    expect(accountDetailsFromRow({ Status: "Done", ad_account_name: "Acme", ad_account_id: "act_9" })).toEqual({
      name: "Acme",
      id: "act_9",
      facts: [],
    });
  });

  it("does not repeat an id that is only standing in for a missing name", () => {
    expect(accountDetailsFromRow({ selectedAccount: { id: "42", name: "42" } }).id).toBe("");
  });

  it("invents nothing for a row that names no account", () => {
    expect(accountDetailsFromRow({ Status: "Done", Expiry_date: "never" })).toEqual({ name: "", id: "", facts: [] });
    expect(accountDetailsFromRow({ selectedAccount: "not json" })).toEqual({ name: "", id: "", facts: [] });
  });
});

describe("accountDetailsFromRows", () => {
  it("prefers the row that names the account over leftovers", () => {
    const rows = [{ Status: "Done" }, { selectedAccount: { id: "1", name: "Acme" } }];
    expect(accountDetailsFromRows(rows).name).toBe("Acme");
  });
});
