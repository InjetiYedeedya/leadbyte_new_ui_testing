import {
  budgetStrings,
  buildChatPayload,
  campaignFromPayload,
  isCalendarDay,
  utcDay,
  type CampaignField,
} from "@/lib/data/ads-chat-payload";

const INTRO = "My Meta Ads AI Agent setup is complete. Please help me finalize the campaign.";

const FIELDS: CampaignField[] = [
  ["Business name", "Zippygo"],
  ["Service or product", "Voice-first flight booking. It speaks: colons, dashes — all of it."],
  ["Budget display", "$15 / day"],
];

describe("campaignFromPayload", () => {
  it("recovers the intro and fields from a payload this module built", () => {
    const payload = buildChatPayload({
      intro: INTRO,
      fields: FIELDS,
      email: "a@b.com",
      sessionId: "s1",
      actionType: "get_suggestion",
    });

    expect(campaignFromPayload(payload)).toEqual({ intro: INTRO, fields: FIELDS });
  });

  it("keeps a value containing a blank line out of the intro", () => {
    // The intro is everything before the FIRST blank line, and a field value
    // with its own paragraph break must not shorten it.
    const payload = buildChatPayload({
      intro: INTRO,
      fields: [["Service or product", "One thing.\n\nAnd another."]],
      email: "a@b.com",
      sessionId: "s1",
      actionType: "get_suggestion",
    });

    expect(campaignFromPayload(payload).intro).toBe(INTRO);
  });

  it("returns nothing recoverable from a payload it did not build", () => {
    expect(campaignFromPayload({ chatInput: "hello" })).toEqual({ intro: "hello", fields: [] });
  });
});

describe("buildChatPayload extras", () => {
  it("merges extra keys, including ones whose value is null", () => {
    const payload = buildChatPayload({
      intro: INTRO,
      fields: FIELDS,
      email: "a@b.com",
      sessionId: "s1",
      actionType: "approved",
      extras: { user_decision: "approved", selectionMode: null },
    });

    expect(payload.user_decision).toBe("approved");
    // Present AND null — the live body carries the key, and an absent key is a
    // different thing to a null one.
    expect("selectionMode" in payload).toBe(true);
    expect(payload.selectionMode).toBeNull();
  });

  it("leaves the base payload alone when no extras are given", () => {
    const payload = buildChatPayload({
      intro: INTRO,
      fields: FIELDS,
      email: "a@b.com",
      sessionId: "s1",
      actionType: "get_suggestion",
    });

    expect(Object.keys(payload).sort()).toEqual(
      ["action_type", "campaign_data", "chatInput", "email_address", "session_id", "timestamp"].sort(),
    );
  });
});

describe("budgetStrings", () => {
  it("words the budget as the legacy app does: '/ day' or 'total'", () => {
    expect(budgetStrings(50, "daily")).toEqual({ amount: "$50", display: "$50 / day" });
    expect(budgetStrings(500, "lifetime")).toEqual({ amount: "$500", display: "$500 total" });
  });
});

describe("isCalendarDay", () => {
  it("accepts a real YYYY-MM-DD day and nothing else", () => {
    expect(isCalendarDay("2026-10-02")).toBe(true);
    expect(isCalendarDay("2028-02-29")).toBe(true);
    expect(isCalendarDay("2026-02-30")).toBe(false);
    expect(isCalendarDay("2026-13-01")).toBe(false);
    expect(isCalendarDay("02/10/2026")).toBe(false);
    expect(isCalendarDay("")).toBe(false);
  });
});

describe("utcDay", () => {
  it("is the UTC day, offset by whole days", () => {
    const now = new Date("2026-10-01T23:30:00Z");
    expect(utcDay(now)).toBe("2026-10-01");
    expect(utcDay(now, -1)).toBe("2026-09-30");
    expect(utcDay(now, 1)).toBe("2026-10-02");
  });
});
