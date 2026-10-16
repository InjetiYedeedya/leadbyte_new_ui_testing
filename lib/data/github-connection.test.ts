import { githubPublishBlock, siteDomain, toGithubConnection } from "./github-connection";
import type { GithubStatus } from "./aeo-deploy";

function status(overrides: Partial<GithubStatus>): GithubStatus {
  return {
    configured: true,
    connected: false,
    repo: "",
    installUrl: "https://github.com/apps/leadbyte/installations/new",
    ...overrides,
  };
}

describe("siteDomain", () => {
  it("reduces a website to the bare host the service keys on", () => {
    expect(siteDomain("https://www.Acme.com/about")).toBe("acme.com");
    expect(siteDomain("acme.com")).toBe("acme.com");
    expect(siteDomain("http://shop.acme.com")).toBe("shop.acme.com");
  });

  it("is empty when there is no website", () => {
    expect(siteDomain("")).toBe("");
    expect(siteDomain("   ")).toBe("");
    expect(siteDomain(null)).toBe("");
    expect(siteDomain(undefined)).toBe("");
  });
});

describe("toGithubConnection", () => {
  it("is unavailable when the service has no GitHub set up", () => {
    expect(toGithubConnection("acme.com", status({ configured: false }), [])).toEqual({
      kind: "unavailable",
    });
  });

  it("is not connected, with the install page, before GitHub is linked", () => {
    expect(toGithubConnection("acme.com", status({}), [])).toEqual({
      kind: "not-connected",
      domain: "acme.com",
      installUrl: "https://github.com/apps/leadbyte/installations/new",
    });
  });

  it("names the repositories once connected, the site's own one first and not twice", () => {
    const result = toGithubConnection(
      "acme.com",
      status({ connected: true, repo: "acme/site" }),
      ["acme/blog", "acme/site"],
    );
    expect(result).toMatchObject({ kind: "connected", repos: ["acme/site", "acme/blog"] });
  });

  it("stays connected when no repository list came back", () => {
    expect(toGithubConnection("acme.com", status({ connected: true }), [])).toMatchObject({
      kind: "connected",
      repos: [],
    });
  });
});

describe("githubPublishBlock", () => {
  it("blocks only a definite no", () => {
    expect(githubPublishBlock({ kind: "not-connected", domain: "acme.com", installUrl: "" })).toMatch(
      /Connect GitHub for acme\.com first/,
    );
    expect(githubPublishBlock({ kind: "no-site" })).toMatch(/Add your website first/);
  });

  it("lets a run through when connected, or when the check could not be made", () => {
    expect(githubPublishBlock({ kind: "connected", domain: "acme.com", repos: [], installUrl: "" })).toBeNull();
    expect(githubPublishBlock({ kind: "unknown", domain: "acme.com" })).toBeNull();
    expect(githubPublishBlock({ kind: "unavailable" })).toBeNull();
  });
});
