import { describe, expect, it } from "vitest";
import type { AeoResult, AeoSurface } from "./aeo-audit";
import {
  applyRoutes,
  parseGithubStatus,
  parsePreview,
  parseRepoList,
  readRepoInput,
  shortfallSentence,
} from "./aeo-deploy";

function surface(overrides: Partial<AeoSurface>): AeoSurface {
  return {
    id: "source_pr",
    label: "GitHub pull request",
    available: true,
    note: "",
    achievable: 77,
    gain: 31,
    unreachable: null,
    unreachable_areas: [],
    ...overrides,
  };
}

const PR = surface({
  unreachable_areas: ["Server rendering", "AI visibility", "Freshness"],
});
const MANUAL = surface({
  id: "manual",
  label: "Copy-paste pack",
  achievable: 72,
  unreachable_areas: ["Server rendering", "Meta tags"],
});
const PLUGIN = surface({
  id: "plugin",
  label: "WordPress plugin",
  available: false,
  note: "this site is not WordPress",
});

function result(surfaces: AeoSurface[], suggested = "source_pr"): AeoResult {
  return {
    score: 46,
    ceiling: 100,
    surfaces,
    deployment: { surface: suggested } as AeoResult["deployment"],
  } as AeoResult;
}

describe("applyRoutes", () => {
  it("makes a tab of each usable route, the suggested one first, with its score range", () => {
    const { routes, unavailable } = applyRoutes(result([MANUAL, PR, PLUGIN]));
    expect(routes.map((r) => [r.label, r.from, r.to])).toEqual([
      ["GitHub pull request", 46, 77],
      ["Copy-paste pack", 46, 72],
    ]);
    expect(routes[0]?.suggested).toBe(true);
    // Never a tab, never silently dropped either.
    expect(unavailable.map((s) => s.label)).toEqual(["WordPress plugin"]);
  });
});

describe("shortfallSentence", () => {
  it("names the points and areas, and says another route may help when one can", () => {
    expect(shortfallSentence(PR, [PR, MANUAL], 100)).toBe(
      "GitHub pull request cannot reach 23 points here — Server rendering, AI visibility, Freshness. Another route may.",
    );
  });

  it("does not point at other routes when none can reach those areas", () => {
    const blind = surface({ id: "manual", unreachable_areas: PR.unreachable_areas });
    expect(shortfallSentence(PR, [PR, blind], 100)).not.toContain("Another route");
  });

  it("prefers the service's own count over working one out", () => {
    expect(shortfallSentence(surface({ unreachable: 4 }), [], 100)).toBe(
      "GitHub pull request cannot reach 4 points here.",
    );
  });

  it("says nothing when the route reaches everything", () => {
    expect(shortfallSentence(surface({ achievable: 100 }), [], 100)).toBeNull();
  });
});

describe("readRepoInput", () => {
  it("accepts owner/name, and a pasted GitHub address", () => {
    expect(readRepoInput(" acme/site ", "")).toEqual({ ok: true, repo: "acme/site", branch: "main" });
    expect(readRepoInput("https://github.com/acme/site.git", "dev")).toEqual({
      ok: true,
      repo: "acme/site",
      branch: "dev",
    });
  });

  it("refuses anything that is not a repository or a sane branch", () => {
    expect(readRepoInput("site", "main").ok).toBe(false);
    expect(readRepoInput("acme/site", "../etc").ok).toBe(false);
  });
});

describe("parsers", () => {
  it("only ever keeps GitHub links", () => {
    expect(
      parseGithubStatus({ configured: true, install_url: "https://evil.example/x" }).installUrl,
    ).toBe("");
    expect(
      parseGithubStatus({ install_url: "https://github.com/apps/leadbyte/installations/new" })
        .installUrl,
    ).toContain("github.com");
    expect(parsePreview({ pull_request_url: "javascript:alert(1)" }).pullRequestUrl).toBe("");
  });

  it("reads a preview with defaults for anything missing", () => {
    const preview = parsePreview({ repo: "acme/site", files_changed: 3, can_push: true });
    expect(preview).toMatchObject({
      repo: "acme/site",
      filesChanged: 3,
      canPush: true,
      ships: 0,
      diff: "",
    });
  });
});

describe("parseRepoList", () => {
  it("keeps only owner/name strings", () => {
    expect(parseRepoList(["acme/site", "not a repo", 7, "acme/blog"])).toEqual([
      "acme/site",
      "acme/blog",
    ]);
    expect(parseRepoList({ detail: "nope" })).toEqual([]);
  });
});
