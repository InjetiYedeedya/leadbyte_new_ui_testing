import {
  browserOf,
  filterActivity,
  mapActivity,
  mapNotifications,
  notificationTitle,
  readActivityFilter,
} from "./activity";

describe("activity log", () => {
  it("names the browser, testing Edge before Chrome and Chrome before Safari", () => {
    expect(browserOf("Mozilla/5.0 Chrome/128.0 Safari/537.36 Edg/128.0")).toBe("Edge");
    expect(browserOf("Mozilla/5.0 Chrome/128.0 Safari/537.36")).toBe("Chrome");
    expect(browserOf("Mozilla/5.0 Version/17.5 Safari/605.1.15")).toBe("Safari");
    expect(browserOf("Mozilla/5.0 Firefox/129.0")).toBe("Firefox");
    expect(browserOf("curl/8")).toBe("Other");
    expect(browserOf("")).toBe("—");
  });

  it("maps and filters entries, newest first", () => {
    const entries = mapActivity([
      { logId: "1", email: "A@x.test", action: "login", timestamp: "2026-09-01T00:00:00Z" },
      { logId: "2", email: "a@x.test", action: "logout", timestamp: "2026-09-02T00:00:00Z" },
      { email: "b@x.test", action: "something" },
    ]);
    expect(entries.map((e) => e.id)).toEqual(["2", "1", "row-2"]);
    expect(entries[2]!.action).toBe("other");
    expect(filterActivity(entries, readActivityFilter("login")).map((e) => e.id)).toEqual(["1"]);
    expect(readActivityFilter("x")).toBe("all");
  });
});

describe("admin notifications", () => {
  it("titles each notification from its type instead of assuming a signup", () => {
    expect(notificationTitle("new_user")).toBe("New user signed up");
    expect(notificationTitle("payment_failed")).toBe("Payment failed");
    expect(notificationTitle("")).toBe("Notification");
  });

  it("reads the read flag stored as text, and drops rows with no id", () => {
    const notifications = mapNotifications([
      { notificationId: "n1", type: "new_user", read: "true", provider: "google.com", timestamp: "2026-09-01" },
      { notificationId: "n2", type: "new_user", read: false, provider: "password", timestamp: "2026-09-03" },
      { type: "new_user" },
    ]);
    expect(notifications.map((n) => [n.notificationId, n.read, n.provider])).toEqual([
      ["n2", false, "email"],
      ["n1", true, "google"],
    ]);
  });
});
