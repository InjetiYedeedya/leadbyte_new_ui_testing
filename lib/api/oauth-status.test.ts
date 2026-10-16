import { describe, expect, it } from "vitest";
import {
  OAUTH_CHECK_TABLES,
  OAUTH_START_PATHS,
  bestOfRows,
  googleTargetsFromRows,
  interpretOAuthRecord,
  resultFromIntegration,
  isExpiryValid,
  type OAuthPlatform,
} from "./oauth-status";
import { numericRowId } from "./row-id";

const NOW = new Date("2026-08-27T10:00:00Z");

describe("isExpiryValid", () => {
  it("treats 'never' as always valid, whatever the casing", () => {
    expect(isExpiryValid("never", NOW)).toBe(true);
    expect(isExpiryValid("Never", NOW)).toBe(true);
    expect(isExpiryValid("NEVER", NOW)).toBe(true);
  });

  it("accepts a future date", () => {
    expect(isExpiryValid("2026-12-31", NOW)).toBe(true);
  });

  it("rejects a past date", () => {
    expect(isExpiryValid("2026-08-26", NOW)).toBe(false);
  });

  it("counts an expiry of today as still valid, not expired", () => {
    // The record says it expires today, so it is good until end of day.
    expect(isExpiryValid("2026-08-27", NOW)).toBe(true);
  });

  it("rejects an unparseable date rather than treating it as valid", () => {
    expect(isExpiryValid("not-a-date", NOW)).toBe(false);
    expect(isExpiryValid("", NOW)).toBe(false);
  });
});

describe("interpretOAuthRecord", () => {
  it("reports a connected platform", () => {
    expect(interpretOAuthRecord({ Status: "Done", Expiry_date: "2026-12-31" }, NOW)).toEqual({
      status: "valid",
      expiryDate: "2026-12-31",
    });
  });

  it("accepts the alternate Expiry_data spelling", () => {
    expect(interpretOAuthRecord({ Status: "Done", Expiry_data: "never" }, NOW)).toEqual({
      status: "valid",
      expiryDate: "never",
    });
  });

  it("reports an expired connection distinctly from a missing one", () => {
    expect(interpretOAuthRecord({ Status: "Done", Expiry_date: "2020-01-01" }, NOW)).toEqual({
      status: "expired",
      expiryDate: "2020-01-01",
    });
  });

  it("treats any Status other than Done as not connected", () => {
    expect(interpretOAuthRecord({ Status: "Pending", Expiry_date: "2026-12-31" }, NOW).status).toBe(
      "not-connected",
    );
    expect(interpretOAuthRecord({ Status: "" }, NOW).status).toBe("not-connected");
  });

  it("treats Done with no expiry field as not connected", () => {
    // Matches the previous app: a row with no expiry is not trusted.
    expect(interpretOAuthRecord({ Status: "Done" }, NOW).status).toBe("not-connected");
  });

  it("handles a missing record", () => {
    expect(interpretOAuthRecord(null, NOW).status).toBe("not-connected");
    expect(interpretOAuthRecord(undefined, NOW).status).toBe("not-connected");
    expect(interpretOAuthRecord("nonsense", NOW).status).toBe("not-connected");
  });
});

/**
 * The query route answers with a LIST, and production tables hold several rows
 * per account because ids used to be random. These cases are the ones that
 * would otherwise be silently wrong.
 */
describe("bestOfRows", () => {
  const NOW = new Date("2026-09-08T12:00:00Z");

  it("reads a bare object, so a backend that stops wrapping still works", () => {
    expect(bestOfRows({ Status: "Done", Expiry_date: "never" }, NOW).status).toBe("valid");
  });

  it("is not-connected for an empty result", () => {
    expect(bestOfRows([], NOW).status).toBe("not-connected");
  });

  it("keeps the live row when an expired one sits beside it", () => {
    // The duplicate is a leftover from a previous consent. It does not cancel
    // a connection that works.
    const rows = [
      { id: 599317, Status: "Done", Expiry_date: "2020-01-01" },
      { id: 848985, Status: "Done", Expiry_date: "never" },
    ];
    expect(bestOfRows(rows, NOW).status).toBe("valid");
    expect(bestOfRows([...rows].reverse(), NOW).status).toBe("valid");
  });

  it("reports expired when every row is expired", () => {
    expect(
      bestOfRows([{ id: 1, Status: "Done", Expiry_date: "2020-01-01" }], NOW).status,
    ).toBe("expired");
  });

  it("ignores a row that never completed", () => {
    expect(bestOfRows([{ id: 1, Status: "Pending" }], NOW).status).toBe("not-connected");
  });
});

/**
 * The platform maps, which are a contract with the backend rather than a
 * preference — a wrong value here is a read against a table that does not
 * exist, and `checkOAuthStatus` swallows that into "Unknown".
 */
describe("platform maps", () => {
  it("gives every platform both a check table and a start path", () => {
    // The two maps are keyed off the same union, so a platform added to one
    // and forgotten in the other cannot compile — this asserts neither is
    // present-but-empty.
    for (const platform of Object.keys(OAUTH_CHECK_TABLES) as OAuthPlatform[]) {
      expect(OAUTH_CHECK_TABLES[platform].length).toBeGreaterThan(0);
      expect(OAUTH_START_PATHS[platform]).toMatch(/^\/api\/oauth\//);
    }
  });

  it("covers the three social platforms", () => {
    expect(OAUTH_START_PATHS.facebook).toBe("/api/oauth/facebook");
    expect(OAUTH_START_PATHS.instagram).toBe("/api/oauth/instagram");
    expect(OAUTH_START_PATHS.youtube).toBe("/api/oauth/youtube");
  });

  /**
   * YouTube is addressed by its RAW table name because no `t…` alias has been
   * published for it. Pinned deliberately: if someone swaps in an invented
   * alias this fails, and if the backend later publishes the real one this is
   * the single line to change.
   */
  it("addresses YouTube by raw table name, not an invented alias", () => {
    expect(OAUTH_CHECK_TABLES.youtube).toBe("Youtube_Frontend_Check");
    expect(OAUTH_CHECK_TABLES.youtube).not.toMatch(/^t[0-9a-f]{9}$/);
    // Every other platform DOES have an alias, so the shape above is the
    // exception rather than a drift.
    expect(OAUTH_CHECK_TABLES.facebook).toMatch(/^t[0-9a-f]{9}$/);
    expect(OAUTH_CHECK_TABLES.instagram).toMatch(/^t[0-9a-f]{9}$/);
  });
});

describe("numericRowId", () => {
  it("gives the same account the same row every time", () => {
    expect(numericRowId("a@b.com")).toBe(numericRowId("a@b.com"));
  });

  it("is a non-negative integer, because the key is a Number", () => {
    const id = numericRowId("nithinsunkara28@gmail.com");
    expect(Number.isInteger(id)).toBe(true);
    expect(id).toBeGreaterThanOrEqual(0);
  });

  it("separates different accounts", () => {
    expect(numericRowId("a@b.com")).not.toBe(numericRowId("c@d.com"));
  });
});

describe("interpretOAuthRecord — spellings seen in real tables", () => {
  const NOW = new Date("2026-09-29T12:00:00Z");

  it("accepts Done in any case, with stray spaces", async () => {
    const { interpretOAuthRecord } = await import("./oauth-status");
    expect(interpretOAuthRecord({ Status: "done ", Expiry_date: "never" }, NOW).status).toBe("valid");
    expect(interpretOAuthRecord({ status: "DONE", expiry_date: "never" }, NOW).status).toBe("valid");
  });

  it("reads a full timestamp expiry instead of calling it expired", async () => {
    const { interpretOAuthRecord } = await import("./oauth-status");
    expect(interpretOAuthRecord({ Status: "Done", Expiry_date: "2026-10-29T10:00:00Z" }, NOW).status).toBe("valid");
    expect(interpretOAuthRecord({ Status: "Done", Expiry_date: "2026-09-01T10:00:00Z" }, NOW).status).toBe("expired");
  });
});

describe("connections that are not really connected (2026-10-06)", () => {
  it("reads a consent still awaiting its account pick as pending, not valid", () => {
    expect(interpretOAuthRecord({ Status: "Done", Expiry_date: "never", awaitingChoice: "true" }, NOW)).toEqual({
      status: "pending",
      expiryDate: "never",
    });
  });

  it("prefers a completed row over a pending one", () => {
    const rows = [
      { Status: "Done", Expiry_date: "never", awaitingChoice: "true" },
      { Status: "Done", Expiry_date: "never" },
    ];
    expect(bestOfRows(rows, NOW).status).toBe("valid");
  });

  it("reads the endpoint's 'connected, nothing chosen' as pending where a choice is needed", () => {
    const state = {
      status: "connected" as const,
      expiresAt: null,
      accountChosen: false,
      selectedName: null,
      selectedCurrency: null,
    };
    expect(resultFromIntegration(state, true).status).toBe("pending");
    expect(resultFromIntegration(state, false).status).toBe("valid");
  });
});

describe("googleTargetsFromRows", () => {
  it("reads the property and site the picker saved", () => {
    const rows = [
      {
        selectedAccount: JSON.stringify({ property: "Main site", propertyId: "123", site: "https://acme.com/" }),
      },
    ];
    expect(googleTargetsFromRows(rows)).toEqual({ property: "Main site", propertyId: "123", site: "https://acme.com/" });
  });

  it("returns blanks for a row that names nothing", () => {
    expect(googleTargetsFromRows([{ Status: "Done" }])).toEqual({ property: "", propertyId: "", site: "" });
  });
});
