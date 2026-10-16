import { buildLaunchSummary } from "./launch-summary";

const FIELDS = [
  ["Business name", "ZippyGo"],
  ["Ad goal", "Leads"],
  ["Offer value", "No offer"],
  ["Campaign start date", "2026-10-20"],
  ["Campaign end date", "Not provided"],
  ["Budget amount", "500"],
  ["Budget display", "₹500 per day"],
] as const;

describe("buildLaunchSummary", () => {
  it("reads the campaign's own facts and the chosen mode", () => {
    expect(buildLaunchSummary(FIELDS, undefined, "semi")).toEqual([
      ["Goal", "Leads"],
      ["Budget", "₹500 per day"],
      ["Starts", "2026-10-20"],
      ["Mode", "Semi automation — your own creative"],
    ]);
  });

  it("prefers the details form's answer over the setup form's", () => {
    const rows = buildLaunchSummary(FIELDS, { "Campaign Name": "Diwali flights", "End Date": "2026-11-05" }, "full");
    expect(rows[0]).toEqual(["Campaign", "Diwali flights"]);
    expect(rows).toContainEqual(["Ends", "2026-11-05"]);
  });

  it("leaves out anything not answered rather than inventing it", () => {
    expect(buildLaunchSummary([["Ad goal", "Not provided"]], {}, undefined)).toEqual([]);
  });
});
