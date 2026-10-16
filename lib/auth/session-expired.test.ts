import { isRedirectError, STALE_LOGIN_PATH } from "@/lib/auth/session-expired";

/**
 * The guard that lets a "your session is over" redirect out of a catch-all.
 *
 * Every read in the app swallows its own failures on purpose — a table that
 * cannot be read becomes an empty state rather than a broken page. That is
 * right for a read failure and wrong for a dead session, because `redirect()`
 * reports itself by THROWING, so the same catch that hides a bad table also
 * hides the redirect and the customer is left on a dashboard with nothing on
 * it. These are the shapes that guard has to get right.
 */
describe("isRedirectError", () => {
  it("recognises the error redirect() throws", () => {
    // What Next actually throws: an Error carrying a `digest` string. The
    // trailing fields are the status code and the destination.
    const error = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: `NEXT_REDIRECT;replace;${STALE_LOGIN_PATH};307;`,
    });
    expect(isRedirectError(error)).toBe(true);
  });

  it("recognises a push redirect as well as a replace", () => {
    const error = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;push;/login;307;",
    });
    expect(isRedirectError(error)).toBe(true);
  });

  it("does not claim an ordinary read failure", () => {
    // The case that matters in the other direction: treating a failed table
    // read as a redirect would rethrow it and turn one missing table into a
    // whole broken page — the opposite of the empty state that is wanted.
    expect(isRedirectError(new Error("leadbyte-api returned 500"))).toBe(false);
  });

  it("does not claim the not-found error, which is a different digest", () => {
    const error = Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
    expect(isRedirectError(error)).toBe(false);
  });

  it("survives the values a catch block can actually receive", () => {
    // `catch (e)` carries anything that was thrown, including things that are
    // not errors at all. A guard that assumes an object throws inside the
    // catch block, which loses the original failure entirely.
    expect(isRedirectError(null)).toBe(false);
    expect(isRedirectError(undefined)).toBe(false);
    expect(isRedirectError("NEXT_REDIRECT")).toBe(false);
    expect(isRedirectError({ digest: 42 })).toBe(false);
    expect(isRedirectError({})).toBe(false);
  });
});

describe("STALE_LOGIN_PATH", () => {
  it("carries the flag the login page checks for", () => {
    // `app/login/page.tsx` skips its "you are already signed in" redirect only
    // when it sees `stale=1`. Without the flag the dead cookie still passes
    // that check and the customer is bounced straight back to the dashboard
    // they were just sent away from — a loop, not a sign-in.
    expect(STALE_LOGIN_PATH).toContain("stale=1");
  });
});
