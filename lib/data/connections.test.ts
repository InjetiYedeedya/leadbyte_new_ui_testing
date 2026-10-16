import { meterTally, PLATFORMS, connectUrl, statusBadgeVariant, statusLabel, statusNote } from "./connections";

/**
 * Where a Connect button actually points.
 *
 * Every platform whose consent needs `email` and `user_id` must go through one
 * of our own Route Handlers, because the identifiers come from the session —
 * a link straight at the Lambda carries no query string at all, which is the
 * defect that stopped n8n attributing tokens to anyone. These tests exist so
 * a new platform cannot quietly be added on the bare path.
 */
describe("connectUrl", () => {
  it("sends the three social platforms through our own route", () => {
    expect(connectUrl("facebook")).toBe("/api/social/connect?platform=facebook");
    expect(connectUrl("instagram")).toBe("/api/social/connect?platform=instagram");
    expect(connectUrl("youtube")).toBe("/api/social/connect?platform=youtube");
  });

  it("sends LinkedIn Ads through our ads route, not the bare backend path", () => {
    expect(connectUrl("linkedInAds")).toBe("/api/ads/connect?platform=linkedin-ads");
  });

  it("sends the ad platforms and Analytics through theirs", () => {
    expect(connectUrl("googleAds")).toBe("/api/ads/connect?platform=google-ads");
    expect(connectUrl("metaAds")).toBe("/api/ads/connect?platform=meta-ads");
    expect(connectUrl("googleAnalytics")).toBe("/api/google/connect?flow=analytics");
  });

  /**
   * The actual regression guard: a relative path is ours and carries the
   * session's identifiers; an absolute one is the bare Lambda and carries
   * nothing. Asserted for every platform that has been fixed, so adding a
   * fourth social platform on the old path fails here.
   */
  it("never hands a social or ads platform an absolute URL", () => {
    for (const platform of ["facebook", "instagram", "youtube", "googleAds", "metaAds"] as const) {
      const url = connectUrl(platform);
      expect(url).not.toBeNull();
      expect(url!.startsWith("/")).toBe(true);
      expect(url).not.toMatch(/^https?:\/\//);
    }
  });
});

describe("PLATFORMS", () => {
  it("lists the three social platforms under one group", () => {
    const social = PLATFORMS.filter((p) => p.group === "social").map((p) => p.id);
    expect(social).toEqual(["facebook", "instagram", "youtube"]);
  });

  it("gives every platform a purpose, since the row renders it", () => {
    for (const platform of PLATFORMS) {
      expect(platform.label.length).toBeGreaterThan(0);
      expect(platform.purpose.length).toBeGreaterThan(0);
    }
  });
});

describe("statusLabel", () => {
  it("names each status in the words the screen uses", () => {
    expect(statusLabel("valid")).toBe("Connected");
    expect(statusLabel("expired")).toBe("Expired");
    expect(statusLabel("not-connected")).toBe("Not connected");
  });

  /**
   * The check failed, not the connection. Saying "Error" sends someone back
   * through Google consent for a connection that is very likely fine — the one
   * thing that cannot help.
   */
  it("calls a failed check unknown, not an error", () => {
    expect(statusLabel("error")).toBe("Unknown");
  });
});

describe("statusNote", () => {
  /**
   * The note sits beside a badge that already carries the status word. When it
   * has nothing else to add it returns null and the line is not rendered —
   * before this split, every connected row read "Connected" twice.
   */
  it("adds nothing to a healthy connection with no expiry", () => {
    expect(statusNote("valid", null)).toBeNull();
  });

  it("adds nothing for a row that is simply not connected", () => {
    expect(statusNote("not-connected", null)).toBeNull();
  });

  it("names the renewal date when there is one", () => {
    expect(statusNote("valid", "2026-12-01")).toBe("Renews 2026-12-01");
  });

  it("does not render the non-expiring marker as a date", () => {
    // The backend writes the string "never" in the expiry column.
    expect(statusNote("valid", "never")).toBeNull();
  });

  it("recognizes the non-expiring marker regardless of case", () => {
    // Real rows spell this "Never" — a case-sensitive check let that through
    // as a literal, nonsensical "Renews Never" caption. Matches the
    // case-insensitive comparison `isExpiryValid` already uses.
    expect(statusNote("valid", "Never")).toBeNull();
    expect(statusNote("valid", "NEVER")).toBeNull();
  });

  it("gives an expired connection its recovery step", () => {
    expect(statusNote("expired", null)).toBe("Reconnect to resume syncing.");
  });

  it("says the check failed without claiming the connection did", () => {
    expect(statusNote("error", null)).toBe("We could not check this just now.");
  });
});

describe("statusBadgeVariant", () => {
  it("only shows the good variant for a confirmed connection", () => {
    expect(statusBadgeVariant("valid")).toBe("connection-connected");
  });

  it("treats an unreadable check as in-progress rather than failed", () => {
    expect(statusBadgeVariant("error")).toBe("connection-analysing");
  });

  it("groups expired with not-connected — both need the same action", () => {
    expect(statusBadgeVariant("expired")).toBe("connection-not-connected");
    expect(statusBadgeVariant("not-connected")).toBe("connection-not-connected");
  });
});

describe("meterTally (2026-10-13)", () => {
  it("counts every card, leaving out the ones that cannot be connected here", () => {
    // 7 platforms all connected, Search Console and Email not, GitHub not
    // offered, WordPress connected.
    const cards = [true, true, true, true, true, true, true, false, false, null, true];
    expect(meterTally(cards)).toEqual({ connected: 8, total: 10 });
  });

  it("is complete only when every counted card is connected", () => {
    expect(meterTally([true, null, true])).toEqual({ connected: 2, total: 2 });
    expect(meterTally([])).toEqual({ connected: 0, total: 0 });
  });
});
