import { keyIsUsable, refusalReason } from "./openai-key-connect";

/**
 * The gate on storing a customer's advertiser key. It matters because the
 * failure it prevents is silent: a key the service will not use, stored
 * anyway, surfaces three screens later as a refused `prepare`.
 */
describe("keyIsUsable", () => {
  it("passes only on an explicit yes", () => {
    expect(keyIsUsable({ usable: true })).toBe(true);
  });

  it("refuses a key that is recognised but not usable", () => {
    // `valid` alone waves through a key with no advertiser account behind it.
    expect(keyIsUsable({ valid: true, usable: false })).toBe(false);
  });

  it("treats a missing answer as no, not as yes", () => {
    // A reply we do not understand is not permission to store a credential.
    expect(keyIsUsable({})).toBe(false);
    expect(keyIsUsable(null)).toBe(false);
    expect(keyIsUsable(undefined)).toBe(false);
  });
});

describe("refusalReason", () => {
  it("uses the service's own words, under the name of the check that failed", () => {
    expect(
      refusalReason({
        usable: false,
        checks: [
          { key: "auth", ok: true },
          { key: "billing", ok: false, value: "No payment method on the account." },
        ],
      }),
    ).toBe("Billing: No payment method on the account.");
  });

  /**
   * The bug this replaced. A live refusal came back
   * `{ key: …, ok: false, value: "rejected" }` and the screen showed the single
   * word "rejected" — a status with no subject. The service sent both halves;
   * we printed the one that means nothing alone.
   */
  it("never shows a bare status token without saying what it is the status of", () => {
    const reason = refusalReason({
      usable: false,
      checks: [{ key: "account_status", ok: false, value: "rejected" }],
    });
    expect(reason).toContain("account status");
    expect(reason).toContain("rejected");
    expect(reason).not.toBe("rejected");
  });

  /**
   * Naming one of three sends someone to fix it, retry, and meet the next —
   * the service's verdict one round at a time.
   */
  it("names every failure, not just the first", () => {
    const reason = refusalReason({
      usable: false,
      checks: [
        { key: "billing", ok: false, value: "unpaid" },
        { key: "account_status", ok: false, value: "rejected" },
      ],
    });
    expect(reason).toContain("billing");
    expect(reason).toContain("account status");
  });

  /**
   * The service marks checks it cannot determine as informational — its
   * `tracking` row is one. Reporting that as the reason a key was refused
   * sends someone to fix something that was never broken.
   */
  it("ignores an informational check that did not pass", () => {
    const reason = refusalReason({
      usable: false,
      checks: [
        { key: "tracking", ok: false, informational: true, value: "Cannot tell." },
        { key: "billing", ok: false, value: "The real reason." },
      ],
    });
    expect(reason).toBe("Billing: The real reason.");
    expect(reason).not.toContain("Cannot tell");
  });

  it("names the failed check when it gave no wording", () => {
    expect(refusalReason({ usable: false, checks: [{ key: "billing", ok: false }] })).toContain(
      "billing",
    );
  });

  it("always says something, even with nothing to go on", () => {
    // This is the only sentence the customer sees; an empty string is a blank
    // red box.
    expect(refusalReason({ usable: false }).length).toBeGreaterThan(0);
    expect(refusalReason(null).length).toBeGreaterThan(0);
  });
});
