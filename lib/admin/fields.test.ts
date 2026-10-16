import {
  cellText,
  formatDate,
  formatDateTime,
  humanizeKey,
  isSecretKey,
  pick,
  pickNumber,
  pickString,
  safeCellText,
  timeOf,
  truthy,
} from "./fields";

describe("admin field readers", () => {
  it("takes the first spelling that holds a real value", () => {
    expect(pick({ created_at: "", createdAt: "2026-01-02" }, "created_at", "createdAt")).toBe("2026-01-02");
    expect(pickString({ a: "  x " }, "a")).toBe("x");
    expect(pickString({}, "a")).toBe("");
  });

  it("reads numbers stored as text, and never returns NaN", () => {
    expect(pickNumber({ n: "42" }, "n")).toBe(42);
    expect(pickNumber({ n: "lots" }, "n")).toBeNull();
    expect(pickNumber({}, "n")).toBeNull();
  });

  it("treats only real yeses as true", () => {
    expect(truthy(true)).toBe(true);
    expect(truthy("true")).toBe(true);
    expect(truthy("false")).toBe(false);
    expect(truthy(undefined)).toBe(false);
  });

  it("formats times in India time with a three-letter month", () => {
    expect(formatDateTime("2026-09-14T03:35:00Z")).toBe("14 Sep 2026, 09:05");
    expect(formatDateTime("2026-09-14T03:35:07Z", true)).toBe("14 Sep 2026, 09:05:07");
    expect(formatDate("2026-09-14T20:00:00Z")).toBe("15 Sep 2026");
    expect(formatDateTime("not a date")).toBe("—");
    expect(timeOf("")).toBeNull();
  });

  it("turns stored keys into words", () => {
    expect(humanizeKey("daily_budget")).toBe("Daily budget");
    expect(humanizeKey("outreachEmail")).toBe("Outreach email");
  });

  it("shortens long values and shows objects as JSON", () => {
    expect(cellText("x".repeat(100), 10)).toHaveLength(10);
    expect(cellText({ a: 1 })).toBe(JSON.stringify({ a: 1 }));
    expect(cellText(null)).toBe("—");
  });

  it("never prints a credential", () => {
    expect(isSecretKey("wordpress_password")).toBe(true);
    expect(isSecretKey("apiKey")).toBe(true);
    expect(isSecretKey("access_token")).toBe(true);
    expect(isSecretKey("Authorization")).toBe(true);
    expect(isSecretKey("bearer")).toBe(true);
    expect(isSecretKey("session_id")).toBe(true);
    expect(isSecretKey("sessionId")).toBe(true);
    expect(isSecretKey("cookie")).toBe(true);
    expect(isSecretKey("company_name")).toBe(false);
    expect(safeCellText("wordpress_password", "hunter2")).not.toContain("hunter2");
    expect(safeCellText("wordpress_password", "")).toBe("—");
  });
});
