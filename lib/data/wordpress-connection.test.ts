import {
  parseWordpressStatus,
  readWordpressInput,
  wordpressErrorMessage,
  wordpressLabel,
} from "@/lib/data/wordpress-connection";

describe("parseWordpressStatus", () => {
  it("reads a connected account, bare or wrapped", () => {
    const body = { connected: true, wp_url: "https://site.com", user_name: "admin", updated_at: "2026-10-09" };
    expect(parseWordpressStatus(body)).toEqual({
      kind: "connected",
      wpUrl: "https://site.com",
      userName: "admin",
      updatedAt: "2026-10-09",
    });
    expect(parseWordpressStatus({ success: true, data: body }).kind).toBe("connected");
  });

  it("reads anything else as not connected", () => {
    expect(parseWordpressStatus({ connected: false })).toEqual({ kind: "not-connected" });
    expect(parseWordpressStatus({ connected: true })).toEqual({ kind: "not-connected" });
    expect(parseWordpressStatus(null)).toEqual({ kind: "not-connected" });
  });
});

describe("readWordpressInput", () => {
  it("adds https to a bare host, drops a trailing slash and keeps a path", () => {
    expect(readWordpressInput({ wpUrl: "example.com/blog/", userName: " john ", appPassword: "abcd EFGH 1234" })).toEqual({
      ok: true,
      input: { wpUrl: "https://example.com/blog", userName: "john", appPassword: "abcd EFGH 1234" },
    });
  });

  it("refuses http, and names every missing field at once", () => {
    const http = readWordpressInput({ wpUrl: "http://example.com", userName: "a", appPassword: "x" });
    expect(http).toEqual({ ok: false, problems: ["Use your site's https:// address."] });

    const empty = readWordpressInput({ wpUrl: "", userName: "", appPassword: "   " });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.problems).toHaveLength(3);
  });

  it("refuses an address that is not a site", () => {
    const result = readWordpressInput({ wpUrl: "localhost", userName: "a", appPassword: "x" });
    expect(result.ok).toBe(false);
  });
});

describe("wordpressErrorMessage", () => {
  it("says each backend code in plain words", () => {
    expect(wordpressErrorMessage(400, "WP_LOGIN_FAILED", "")).toMatch(/Application Password/);
    expect(wordpressErrorMessage(400, "WP_NO_PERMISSION", "")).toMatch(/Editor/);
    expect(wordpressErrorMessage(502, "WP_UNREACHABLE", "")).toMatch(/didn't answer/);
  });

  it("falls back to the backend's own words, then to the status", () => {
    expect(wordpressErrorMessage(400, undefined, "Site said no")).toBe("Site said no");
    expect(wordpressErrorMessage(502, undefined, "leadbyte-api returned 502")).toMatch(/didn't answer/);
    expect(wordpressErrorMessage(401, undefined, "")).toMatch(/sign in/);
  });
});

describe("wordpressLabel", () => {
  it("shortens an address for display", () => {
    expect(wordpressLabel("https://www.example.com/blog/")).toBe("example.com/blog");
  });
});
