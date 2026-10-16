import {
  blockingCheck,
  canProceed,
  describeStoredKey,
  goalNeedsTracking,
  parseChecks,
  parseTrackingState,
  storedKey,
  summariseTracking,
  trackingWarning,
} from "./ads-verify";

/** The payloads below are verbatim captures from the service's own contract. */

const VERIFY = {
  valid: true,
  usable: true,
  balance: null,
  account: {
    account_id: "acct_123",
    name: "ZippyGo",
    status: "active",
    review_status: "approved",
    currency: "USD",
    timezone: "America/New_York",
  },
  checks: [
    { key: "key_valid", ok: true, value: "authorised" },
    { key: "account_active", ok: true, value: "active" },
    { key: "brand_approved", ok: true, value: "approved" },
    { key: "tracking", ok: false, value: "not connected" },
  ],
};

const KEYS = {
  user_id: "u_123",
  backend: "dynamodb (openai_ads_credentials)",
  keys: [
    {
      email: "client@example.com",
      last_four: "…7f3a",
      label: "ZippyGo main account",
      added_at: "2026-09-15T07:01:40+00:00",
      last_used_at: "2026-09-15T09:22:03+00:00",
      has_key: true,
    },
  ],
};

const NO_TRACKING = {
  state: "none" as const,
  usable: false,
  pixel_count: 0,
  event_setting_count: 0,
  event_setting_ids: [],
  explanation:
    "No conversion tracking exists. Lead, app and sales goals will run as clicks campaigns until it does.",
};

describe("parseChecks", () => {
  it("reads the real verify tick-list", () => {
    const checks = parseChecks(VERIFY.checks);
    expect(checks).toHaveLength(4);
    expect(checks[0]).toEqual({
      key: "key_valid",
      ok: true,
      value: "authorised",
      informational: false,
    });
  });

  /**
   * Defaulting a missing `ok` to true would turn a malformed response into a
   * green tick over an account that cannot run ads.
   */
  it("reads a check that does not say it passed as not passed", () => {
    expect(parseChecks([{ key: "tracking", value: "unknown" }])[0]!.ok).toBe(false);
    expect(parseChecks([{ key: "tracking", ok: "yes" as never }])[0]!.ok).toBe(false);
  });

  it("survives a response that carried no checks at all", () => {
    expect(parseChecks(undefined)).toEqual([]);
    expect(parseChecks([null as never, { value: "no key" }])).toEqual([]);
  });
});

describe("blockingCheck", () => {
  /**
   * `usable: false` says someone cannot continue but not why. The reason is
   * whichever check failed, and naming it is the difference between "we can't
   * connect your account" and "your brand is still awaiting approval".
   */
  it("names the check that is stopping the account", () => {
    const blocked = blockingCheck({
      usable: false,
      checks: [
        { key: "key_valid", ok: true, value: "authorised" },
        { key: "brand_approved", ok: false, value: "pending review" },
      ],
    });
    expect(blocked).toEqual({
      key: "brand_approved",
      ok: false,
      value: "pending review",
      informational: false,
    });
  });

  /**
   * The real capture is `usable: true` WITH a failing tracking check — and the
   * service marks that row `informational`, because the platform never reports
   * whether tracking exists: it echoes what we told it. Naming it as the
   * blocker would send someone to fix a pixel when nothing is wrong.
   */
  it("ignores a row the service marked as a statement rather than a verdict", () => {
    const withFlag = {
      ...VERIFY,
      checks: [
        { key: "key_valid", ok: true, value: "authorised" },
        { key: "tracking", ok: false, informational: true, value: "not connected" },
      ],
    };
    expect(canProceed(withFlag)).toBe(true);
    expect(blockingCheck(withFlag)).toBeNull();
  });

  it("still blocks on a real failure sitting beside an informational one", () => {
    const blocked = blockingCheck({
      usable: false,
      checks: [
        { key: "tracking", ok: false, informational: true, value: "not connected" },
        { key: "brand_approved", ok: false, value: "pending review" },
      ],
    });
    expect(blocked?.key).toBe("brand_approved");
  });
});

describe("canProceed", () => {
  /** A key can be valid and the account still suspended or unapproved. */
  it("reads usable, not valid", () => {
    expect(canProceed({ valid: true, usable: false })).toBe(false);
    expect(canProceed({ valid: false, usable: true })).toBe(true);
  });

  it("treats an absent answer as no", () => {
    expect(canProceed({})).toBe(false);
  });

  /** `save_key` only stores a key it has already checked, so saved means passed. */
  it("accepts a successful save as proof the key passed", () => {
    expect(canProceed({ saved: true })).toBe(true);
    expect(canProceed({ saved: false })).toBe(false);
  });
});

describe("storedKey", () => {
  it("finds the key stored for this account", () => {
    expect(storedKey(KEYS)?.last_four).toBe("…7f3a");
    expect(storedKey(KEYS, "client@example.com")?.email).toBe("client@example.com");
  });

  /**
   * A row whose secret is gone is a record of a key, not a key. Calling it
   * connected sends someone to a campaign form that cannot submit.
   */
  it("ignores a row that no longer holds a key", () => {
    expect(storedKey({ keys: [{ email: "a@b.com", has_key: false }] })).toBeNull();
  });

  it("is null when nothing is stored, and never throws on a broken answer", () => {
    expect(storedKey(null)).toBeNull();
    expect(storedKey({})).toBeNull();
    expect(storedKey({ keys: "nonsense" as never })).toBeNull();
  });
});

describe("describeStoredKey", () => {
  it("shows the label and the last four the service actually holds", () => {
    expect(describeStoredKey(KEYS.keys[0]!)).toBe("ZippyGo main account · …7f3a");
  });

  it("says something useful when one half is missing", () => {
    expect(describeStoredKey({ last_four: "…7f3a" })).toBe("…7f3a");
    expect(describeStoredKey({ label: "Main" })).toBe("Main");
    expect(describeStoredKey({})).toBe("Key stored");
    expect(describeStoredKey(null)).toBeNull();
  });
});

describe("tracking", () => {
  /**
   * The state the contract says people miss: a pixel that EXISTS is not a pixel
   * that WORKS — someone still has to put it on the site. A tick here means an
   * account that never optimises and nobody looking into why.
   */
  it("keeps awaiting apart from receiving", () => {
    expect(parseTrackingState({ state: "awaiting" })).toBe("awaiting");
    expect(summariseTracking({ state: "awaiting" }).usable).toBe(false);
    expect(summariseTracking({ state: "receiving" }).usable).toBe(true);
  });

  /**
   * `none` offers to set tracking up, which is harmless if it already exists.
   * Guessing `receiving` promises optimisation that is not happening.
   */
  it("falls back to none, the end that cannot mislead", () => {
    expect(parseTrackingState(null)).toBe("none");
    expect(parseTrackingState({ state: "PARTIALLY_LIVE" as never })).toBe("none");
  });

  it("carries the service's own explanation through", () => {
    expect(summariseTracking(NO_TRACKING).explanation).toContain("clicks campaigns");
  });

  /**
   * Derived rather than read: `usable` and `state` could disagree, and `state`
   * is the one with three values.
   */
  it("does not trust a usable flag that contradicts the state", () => {
    expect(summariseTracking({ state: "awaiting", usable: true }).usable).toBe(false);
  });
});

describe("trackingWarning", () => {
  it("warns the goals that are actually downgraded, and only those", () => {
    expect(goalNeedsTracking("leads")).toBe(true);
    expect(goalNeedsTracking("sales")).toBe(true);
    expect(goalNeedsTracking("app")).toBe(true);
    expect(goalNeedsTracking("traffic")).toBe(false);
    expect(goalNeedsTracking("awareness")).toBe(false);
  });

  it("says nothing when the goal does not need tracking", () => {
    expect(trackingWarning("traffic", summariseTracking(NO_TRACKING))).toBeNull();
  });

  it("says nothing once events are arriving", () => {
    expect(trackingWarning("leads", summariseTracking({ state: "receiving" }))).toBeNull();
  });

  /**
   * The two states need different sentences: one is "set it up", the other is
   * "it is set up but not firing yet", and telling someone to set up what they
   * already set up is how they conclude the product is broken.
   */
  it("tells someone mid-setup something different from someone who has not started", () => {
    const none = trackingWarning("leads", summariseTracking(NO_TRACKING));
    const awaiting = trackingWarning("leads", summariseTracking({ state: "awaiting" }));

    expect(none).toContain("not connected");
    expect(awaiting).toContain("not received any events");
    expect(awaiting).not.toBe(none);
  });
});
