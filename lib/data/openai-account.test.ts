import { accountFromVerify, parseAccountCookie } from "@/lib/data/openai-account";

/** The live `save_key` reply, 2026-10-02 (key details trimmed). */
const SAVE_REPLY = {
  saved: true,
  account: {
    account_id: "adacct_6a983b84ff2881a28114b0ebe071f488",
    name: "ZippyGo",
    status: "active",
    review_status: "approved",
    currency: "USD",
    timezone: "America/New_York",
    has_conversion_events: true,
    event_count: 3,
  },
  conversion_events: [
    { id: "6ab1215f2b6881a287cab2ae1c8e5fb0", event_type: "custom" },
    { id: "6ab120fc957c81a2a63a30f9464e8098", event_type: "app_opened" },
    { id: "6ab120cd645481a2bc8239f6cbf0bcd4", event_type: "app_installed" },
  ],
};

describe("accountFromVerify", () => {
  it("keeps every account fact the key save reports", () => {
    expect(accountFromVerify(SAVE_REPLY)).toEqual({
      currency: "USD",
      country: "",
      name: "ZippyGo",
      reviewStatus: "approved",
      accountId: "adacct_6a983b84ff2881a28114b0ebe071f488",
      status: "active",
      timezone: "America/New_York",
      conversionEventCount: 3,
      checks: [],
    });
  });

  it("keeps the readiness checks, informational ones marked", () => {
    const account = accountFromVerify({
      ...SAVE_REPLY,
      checks: [
        { key: "key_valid", ok: true, value: "authorised" },
        { key: "tracking", ok: false, informational: true, value: "not connected" },
      ],
    });
    expect(account.checks).toEqual([
      { key: "key_valid", ok: true, informational: false, value: "authorised" },
      { key: "tracking", ok: false, informational: true, value: "not connected" },
    ]);
  });

  it("counts no conversion events as zero, and falls back to event_count", () => {
    expect(accountFromVerify({ ...SAVE_REPLY, conversion_events: [] }).conversionEventCount).toBe(0);
    expect(accountFromVerify({ account: { event_count: 2 } }).conversionEventCount).toBe(2);
    expect(accountFromVerify({}).conversionEventCount).toBe(0);
  });
});

describe("parseAccountCookie", () => {
  it("round-trips the summary, and reads an older cookie without the new fields", () => {
    const account = accountFromVerify(SAVE_REPLY);
    expect(parseAccountCookie(JSON.stringify(account))).toEqual(account);
    expect(parseAccountCookie(JSON.stringify({ currency: "USD", name: "Old" }))).toMatchObject({
      name: "Old",
      accountId: "",
      conversionEventCount: 0,
    });
  });
});
