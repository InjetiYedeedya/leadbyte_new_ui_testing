import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Signing out has to leave nothing account-specific behind.
 *
 * `clearSession()` only ever removed the five auth cookies, which left the
 * flow's own state in the browser — and `leadbyte_analysis_job` carries a bare
 * job id with no account key, so the next account to sign in on the same
 * browser polled the previous one's analysis and rendered its results.
 *
 * Tested against a fake cookie jar, the same way the gate is: the rule is
 * about which names survive, which needs no server.
 */

const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  }),
}));

const { clearAllAccountCookies } = await import("./sign-out");

beforeEach(() => {
  jar.clear();
});

describe("clearAllAccountCookies", () => {
  it("removes every cookie the app owns, whatever set it", async () => {
    // One of each kind: auth, the unkeyed job, a chunked plan, per-business
    // gate and plan, and the Google hand-off cookies.
    for (const name of [
      "leadbyte_session",
      "leadbyte_owner",
      "leadbyte_uid",
      "leadbyte_at",
      "leadbyte_rt",
      "leadbyte_analysis_job",
      "leadbyte_pending_url",
      "leadbyte_ads_plan_0",
      "leadbyte_ads_plan_1",
      "leadbyte_gate_thilak@ntimes.ai",
      "leadbyte_plan_thilak@ntimes.ai",
      "leadbyte_google_saved",
      "leadbyte_google_properties",
      "leadbyte_google_sites",
    ]) {
      jar.set(name, "x");
    }

    await clearAllAccountCookies();

    expect([...jar.keys()]).toEqual([]);
  });

  it("clears the analysis job — the one that leaked across accounts", async () => {
    jar.set("leadbyte_session", "old@account.com");
    jar.set("leadbyte_analysis_job", "job-from-the-previous-account");

    await clearAllAccountCookies();

    expect(jar.has("leadbyte_analysis_job")).toBe(false);
  });

  it("leaves cookies it does not own alone", async () => {
    // Another app on localhost, or an analytics cookie, is not ours to delete.
    jar.set("leadbyte_session", "a@b.com");
    jar.set("_ga", "GA1.1.123");
    jar.set("other_app_session", "keep-me");

    await clearAllAccountCookies();

    expect([...jar.keys()].sort()).toEqual(["_ga", "other_app_session"]);
  });

  it("does nothing, without complaint, when there is nothing to clear", async () => {
    await expect(clearAllAccountCookies()).resolves.toBeUndefined();
  });
});
