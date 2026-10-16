import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The run store is cookie-backed because an AEO run is several jobs, and the
 * screen that watches them is a redirect away from the action that started
 * them. These tests run against a fake jar rather than a request, which keeps
 * the rules — the cap, the tolerance of a stale value, and the failures that
 * must survive the round trip — testable without a server.
 */

const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  }),
}));

const {
  MAX_SITES,
  clearAeoRun,
  parsePick,
  parseRun,
  readAeoPick,
  readAeoRun,
  setAeoPick,
  setAeoRun,
} = await import("./aeo-run");

beforeEach(() => {
  jar.clear();
});

describe("parseRun", () => {
  it("survives anything a stale or hand-edited cookie can be", () => {
    // A screen that throws on a cookie is a screen the customer cannot leave
    // without clearing their browser. Every one of these is null, not a crash.
    expect(parseRun(undefined)).toBeNull();
    expect(parseRun("")).toBeNull();
    expect(parseRun("not json")).toBeNull();
    expect(parseRun("[]")).toBeNull();
    expect(parseRun("null")).toBeNull();
    expect(parseRun('{"sites":"nope"}')).toBeNull();
  });

  it("drops a site with no job id, because there is nothing to poll", () => {
    const run = parseRun(
      JSON.stringify({ startedAt: 1, sites: [{ url: "https://a.test" }, { id: "x", url: "b" }] }),
    );
    expect(run?.sites).toEqual([{ id: "x", url: "b" }]);
  });

  it("keeps a run that is nothing but failures", () => {
    // Every site refused is not "no run" — it is the outcome, and the reasons
    // are the only thing worth showing. Treating it as empty would redirect
    // the customer back to the form with no explanation at all.
    const run = parseRun(
      JSON.stringify({ sites: [], failed: [{ url: "https://a.test", error: "SiteUnreachable" }] }),
    );
    expect(run?.sites).toEqual([]);
    expect(run?.failed).toEqual([{ url: "https://a.test", error: "SiteUnreachable" }]);
  });

  it("is null when there is neither a job nor a failure", () => {
    expect(parseRun(JSON.stringify({ sites: [], failed: [] }))).toBeNull();
  });

  it("defaults a missing startedAt rather than dropping the run", () => {
    // The timestamp only paces an elapsed clock. Losing the jobs over a
    // missing one would be a much worse trade.
    const run = parseRun(JSON.stringify({ sites: [{ id: "a", url: "u" }] }));
    expect(run?.sites).toHaveLength(1);
    expect(typeof run?.startedAt).toBe("number");
  });
});

describe("parsePick", () => {
  it("needs the URL it was a discovery for", () => {
    // Without it the selection call has nothing to audit, and guessing from
    // the form would audit whatever is in the box now rather than what was
    // checked.
    expect(parsePick(JSON.stringify({ domain: "a.test", subdomains: ["x.a.test"] }))).toBeNull();
  });

  it("keeps an empty subdomain list, which is a real answer", () => {
    const pick = parsePick(JSON.stringify({ websiteUrl: "https://a.test", subdomains: [] }));
    expect(pick).toEqual({ websiteUrl: "https://a.test", domain: "", subdomains: [] });
  });

  it("ignores junk entries in the list", () => {
    const pick = parsePick(
      JSON.stringify({ websiteUrl: "https://a.test", subdomains: ["x.a.test", 7, null, ""] }),
    );
    expect(pick?.subdomains).toEqual(["x.a.test"]);
  });
});

describe("the cookie round trip", () => {
  it("caps the number of sites, because an oversized cookie is dropped, not rejected", async () => {
    // A cookie past ~4KB does not fail loudly — the browser simply does not
    // store it, taking every job id with it. The cap is what makes that
    // impossible rather than unlikely.
    const many = Array.from({ length: MAX_SITES + 8 }, (_, i) => ({
      id: `job-${i}`,
      url: `https://site-${i}.test`,
    }));
    await setAeoRun(many);

    const run = await readAeoRun();
    expect(run?.sites).toHaveLength(MAX_SITES);
    expect(run?.sites[0]?.id).toBe("job-0");
  });

  it("truncates a failure message rather than letting it evict the run", async () => {
    await setAeoRun([{ id: "a", url: "https://a.test" }], [
      { url: "https://b.test", error: "x".repeat(5000) },
    ]);

    const run = await readAeoRun();
    expect(run?.sites).toHaveLength(1);
    expect(run?.failed[0]?.error.length).toBeLessThanOrEqual(200);
  });

  it("stores and returns a pick, and clears with the run", async () => {
    await setAeoPick({
      websiteUrl: "https://a.test",
      domain: "a.test",
      subdomains: ["blog.a.test"],
    });
    expect((await readAeoPick())?.subdomains).toEqual(["blog.a.test"]);

    await setAeoRun([{ id: "a", url: "https://a.test" }]);
    await clearAeoRun();
    expect(await readAeoRun()).toBeNull();
  });
});
