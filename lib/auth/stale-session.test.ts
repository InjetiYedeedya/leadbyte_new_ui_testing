import { STALE_SESSION_PATH, isStaleSession } from "@/lib/auth/stale-session";

describe("isStaleSession", () => {
  it("is the mock-mode cookie meeting a configured backend", () => {
    expect(isStaleSession({ accessToken: undefined }, true)).toBe(true);
    expect(isStaleSession({ accessToken: "" }, true)).toBe(true);
  });

  it("leaves a real session alone", () => {
    expect(isStaleSession({ accessToken: "jwt" }, true)).toBe(false);
  });

  it("is not stale when only the access cookie lapsed — the refresh token renews it (2026-10-01)", () => {
    expect(isStaleSession({ accessToken: undefined, refreshToken: "rt" }, true)).toBe(false);
    expect(isStaleSession({ accessToken: undefined, refreshToken: undefined }, true)).toBe(true);
  });

  it("never fires in mock mode, where having no token is correct", () => {
    expect(isStaleSession({ accessToken: undefined }, false)).toBe(false);
  });

  it("says nothing about a visitor with no session at all", () => {
    // `/` is a public page. Signed out is not stale, and redirecting a visitor
    // to sign in would shut the front door.
    expect(isStaleSession(null, true)).toBe(false);
    expect(isStaleSession(null, false)).toBe(false);
  });

  it("sends them somewhere the login page will not bounce them back from", () => {
    expect(STALE_SESSION_PATH).toContain("stale=1");
  });
});
