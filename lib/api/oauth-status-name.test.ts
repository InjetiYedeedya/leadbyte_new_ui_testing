import { rowsForAccountName, selectedNameFromRows } from "./oauth-status";
import { numericRowId } from "./row-id";
import { accountDetailsFromRows } from "@/lib/data/account-details";
import { pickAccountName } from "@/lib/data/social-connections";

vi.mock("@/lib/data/social-accounts", () => ({ describeSocialAccounts: vi.fn(), getSocialAccounts: vi.fn() }));

describe("selectedNameFromRows", () => {
  it("reads the saved account's name, stored as JSON or as an object", () => {
    expect(selectedNameFromRows([{ selectedAccount: JSON.stringify({ id: "1", name: "LeadByte AI" }) }])).toBe("LeadByte AI");
    expect(selectedNameFromRows([{ selectedAccount: { id: "2", name: " Leadbyte ai " } }])).toBe("Leadbyte ai");
  });

  it("takes the first row that names one, and is empty when none does", () => {
    expect(selectedNameFromRows([{ Status: "Done" }, { selectedAccount: '{"name":"Second"}' }])).toBe("Second");
    expect(selectedNameFromRows([{ selectedAccount: "not json" }, null, {}])).toBe("");
  });
});

describe("rowsForAccountName (LBS-1246)", () => {
  const now = new Date("2026-10-15T10:00:00Z");
  const email = "owner@leadbyte.ai";
  const live = { Status: "Done", Expiry_date: "2026-12-01T00:00:00Z" };
  const healzy = { id: 599317, ...live, selectedAccount: '{"name":"Healzy AI","currency":"USD"}' };
  const expiredHealzy = { ...healzy, Expiry_date: "2026-01-01T00:00:00Z" };
  const ours = { id: numericRowId(email), ...live, selectedAccount: '{"name":"LeadByte AI","currency":"INR"}' };

  it("never takes a name from a row that is not connected", () => {
    const rows = rowsForAccountName([expiredHealzy, { ...healzy, id: 7, Status: "Pending" }], email, now);
    expect(selectedNameFromRows(rows)).toBe("");
  });

  it("still trusts our own row when no row reads as connected", () => {
    const rows = rowsForAccountName([expiredHealzy, { ...ours, Status: "Pending" }], email, now);
    expect(selectedNameFromRows(rows)).toBe("LeadByte AI");
  });

  it("puts our own row ahead of an older one under the same email", () => {
    const rows = rowsForAccountName([healzy, ours], email, now);
    expect(selectedNameFromRows(rows)).toBe("LeadByte AI");
    expect(accountDetailsFromRows(rows).name).toBe("LeadByte AI");
  });

  it("prefers a row with a chosen account over a bare live one", () => {
    const bare = { id: 1, ...live, account_name: "From n8n" };
    const chosen = { id: 2, ...live, selectedAccount: '{"name":"Picked"}' };
    expect(selectedNameFromRows(rowsForAccountName([bare, chosen], email, now))).toBe("Picked");
  });

  it("skips a stale row when a live one exists", () => {
    const rows = rowsForAccountName([expiredHealzy, { id: 3, ...live, selectedAccount: '{"name":"Current"}' }], email, now);
    expect(selectedNameFromRows(rows)).toBe("Current");
  });
});

describe("pickAccountName", () => {
  it("prefers this browser's name, then the backend's, then none", () => {
    expect(pickAccountName("From cookie", "From backend")).toBe("From cookie");
    expect(pickAccountName(null, "From backend")).toBe("From backend");
    expect(pickAccountName(null, "  ")).toBeNull();
  });
});
