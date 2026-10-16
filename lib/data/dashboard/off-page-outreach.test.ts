import {
  backlinkChange,
  formatChange,
  mapOffPageOutreach,
  outreachRates,
  rowsForAccount,
} from "./off-page-outreach";

/**
 * `off_page_seo` is keyed on the outreach TARGET, so the two things that must
 * never go wrong are whose row it is and what a missing figure turns into.
 */

const ME = "owner@shop.com";

describe("rowsForAccount", () => {
  it("keeps only rows whose user_email is the account, ignoring case and spelling", () => {
    const rows = rowsForAccount(
      [
        { email: "media@ibm.com", user_email: "Owner@Shop.com ", sent_mails: 3 },
        { email: "owner@shop.com", user_email: "someone@else.com", sent_mails: 99 },
        { email: "press@bbc.com", userEmail: ME, sent_mails: 2 },
      ],
      ME,
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.sentmails)).toEqual([3, 2]);
  });

  it("drops a row keyed by the account's address but owned by someone else", () => {
    // The target-keyed trap: partition key matches, owner does not.
    expect(rowsForAccount([{ email: ME, user_email: "other@x.com" }], ME)).toEqual([]);
  });

  it("drops rows with no user_email at all — ownership cannot be proved", () => {
    expect(rowsForAccount([{ email: ME, sent_mails: 4 }], ME)).toEqual([]);
  });
});

describe("mapOffPageOutreach", () => {
  const one = (row: Record<string, unknown>) =>
    mapOffPageOutreach(rowsForAccount([{ user_email: ME, ...row }], ME));

  it("is null when there is no record", () => {
    expect(mapOffPageOutreach([])).toBeNull();
  });

  it.each([
    ["Outreach_Email_Sent", "Reply_Back_From_Outreach"],
    ["sent_mails", "reply_mails"],
    ["emails_sent", "replies"],
    ["mails_sent", "mails_replied"],
  ])("reads sent as %s and replies as %s", (sentKey, replyKey) => {
    const outreach = one({ [sentKey]: "1,200", [replyKey]: 36 });
    expect(outreach?.sent).toBe(1200);
    expect(outreach?.replies).toBe(36);
  });

  it.each([
    ["initial_backlinks", "current_backlinks"],
    ["Initial_Backlink", "Current_Backlink"],
  ])("reads before as %s and now as %s", (beforeKey, nowKey) => {
    const outreach = one({ [beforeKey]: 64, [nowKey]: 78 });
    expect(outreach?.before).toBe(64);
    expect(outreach?.now).toBe(78);
  });

  it.each(["backlink", "Backlinks", "new_backlinks"])("reads won as %s, over the fallback", (key) => {
    expect(one({ [key]: 5, initial_backlinks: 10, current_backlinks: 30 })?.won).toBe(5);
  });

  it("falls back to now − before when no won figure exists", () => {
    expect(one({ initial_backlinks: 64, current_backlinks: 78 })?.won).toBe(14);
  });

  it("never lets the fallback go below zero when the profile shrank", () => {
    const outreach = one({ initial_backlinks: 80, current_backlinks: 72 });
    expect(outreach?.won).toBe(0);
    expect(outreach?.now).toBe(72);
  });

  it("keeps a missing figure null, never 0", () => {
    expect(one({ sent_mails: 10 })).toEqual({
      sent: 10,
      replies: null,
      before: null,
      now: null,
      won: null,
    });
  });

  it("keeps an all-zero record as zeros — the agent ran and won nothing yet", () => {
    expect(
      one({ sent_mails: 0, reply_mails: 0, initial_backlinks: 0, current_backlinks: 0, backlinks: 0 }),
    ).toEqual({ sent: 0, replies: 0, before: 0, now: 0, won: 0 });
  });

  it("sums flows and takes min/max of levels across several rows", () => {
    const rows = rowsForAccount(
      [
        { user_email: ME, sent_mails: 40, reply_mails: 4, backlinks: 1, initial_backlinks: 60, current_backlinks: 70 },
        { user_email: ME, sent_mails: 60, reply_mails: 8, backlinks: 2, initial_backlinks: 64, current_backlinks: 75 },
      ],
      ME,
    );
    expect(mapOffPageOutreach(rows)).toEqual({ sent: 100, replies: 12, before: 60, now: 75, won: 3 });
  });

  it("uses the aggregated now − before when no row across several carries won", () => {
    const rows = rowsForAccount(
      [
        { user_email: ME, initial_backlinks: 60, current_backlinks: 70 },
        { user_email: ME, initial_backlinks: 64, current_backlinks: 75 },
      ],
      ME,
    );
    expect(mapOffPageOutreach(rows)?.won).toBe(15);
  });
});

describe("outreachRates", () => {
  it("measures replies against sent, and won against both", () => {
    const rates = outreachRates({ sent: 200, replies: 24, before: 0, now: 0, won: 6 });
    expect(rates.replyRate).toBeCloseTo(0.12);
    expect(rates.wonOfSent).toBeCloseTo(0.03);
    expect(rates.wonOfReplies).toBeCloseTo(0.25);
  });

  it("has no rate when nothing was sent, rather than 0% or a division by zero", () => {
    expect(outreachRates({ sent: 0, replies: 0, before: 0, now: 0, won: 0 })).toEqual({
      replyRate: null,
      wonOfSent: null,
      wonOfReplies: null,
    });
  });
});

describe("backlinkChange / formatChange", () => {
  it("prints a gain with its share of the baseline", () => {
    const change = backlinkChange({ sent: 1, replies: 0, before: 64, now: 78, won: 14 });
    expect(change).toEqual({ delta: 14, share: 14 / 64 });
    expect(formatChange(change!)).toBe("+14 (+22%)");
  });

  it("prints a dip with a real minus sign", () => {
    const change = backlinkChange({ sent: 1, replies: 0, before: 80, now: 76, won: 0 });
    expect(formatChange(change!)).toBe("−4 (−5.0%)");
  });

  it("prints no percentage against a zero baseline", () => {
    expect(formatChange(backlinkChange({ sent: 1, replies: 0, before: 0, now: 4, won: 4 })!)).toBe("+4");
  });

  it("is null when either end is missing", () => {
    expect(backlinkChange({ sent: 1, replies: 0, before: null, now: 4, won: 4 })).toBeNull();
  });
});
