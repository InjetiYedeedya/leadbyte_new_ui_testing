import { flatten, formatShare, normKey, numeric, pickNum, pickStr, ratio } from "./fields";

describe("dashboard field readers", () => {
  it("normalises keys to lowercase letters and digits", () => {
    expect(normKey("Outreach_Email-Sent")).toBe("outreachemailsent");
    expect(normKey("Like_count")).toBe("likecount");
  });

  it("reads a number however it arrived", () => {
    expect(numeric("1,240")).toBe(1240);
    expect(numeric(" 12 ")).toBe(12);
    expect(numeric(-3)).toBe(0);
    expect(numeric(-3, true)).toBe(-3);
    expect(numeric("")).toBeNull();
    expect(numeric("n/a")).toBeNull();
    expect(numeric(undefined)).toBeNull();
  });

  it("picks the first spelling present, and null — not 0 — when none is", () => {
    const flat = flatten({ Sent_Mails: "40", reply_mails: 0 });
    expect(pickNum(flat, "outreach_email_sent", "sent_mails")).toBe(40);
    expect(pickNum(flat, "reply_mails")).toBe(0);
    expect(pickNum(flat, "backlinks")).toBeNull();
    expect(pickStr(flatten({ Campaign_Name: " Spring " }), "campaign_name")).toBe("Spring");
  });

  it("divides only when there is something to divide by", () => {
    expect(ratio(3, 12)).toBe(0.25);
    expect(ratio(3, 0)).toBeNull();
    expect(formatShare(0.25)).toBe("25%");
    expect(formatShare(0.042)).toBe("4.2%");
    expect(formatShare(null)).toBe("—");
  });
});
