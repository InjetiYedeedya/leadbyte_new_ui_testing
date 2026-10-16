import { blogPublishBlock, blogPublishState, repoSummary } from "@/lib/data/blog-publish";
import type { GithubConnection } from "@/lib/data/github-connection";
import type { WordpressStatus } from "@/lib/data/wordpress-connection";

const ghConnected: GithubConnection = { kind: "connected", domain: "acme.com", repos: ["acme/site"], installUrl: "https://github.com/x" };
const ghMissing: GithubConnection = { kind: "not-connected", domain: "acme.com", installUrl: "https://github.com/x" };
const wpConnected: WordpressStatus = { kind: "connected", wpUrl: "https://www.acme.com/blog", userName: "admin", updatedAt: null };
const wpMissing: WordpressStatus = { kind: "not-connected" };

describe("blogPublishBlock", () => {
  it("lets either GitHub or WordPress publish", () => {
    expect(blogPublishBlock(ghConnected, wpMissing)).toBeNull();
    expect(blogPublishBlock(ghMissing, wpConnected)).toBeNull();
  });

  it("blocks only when neither is connected, naming both", () => {
    expect(blogPublishBlock(ghMissing, wpMissing)).toMatch(/GitHub for acme\.com or connect your WordPress/);
  });

  it("does not block on a check that could not be made", () => {
    expect(blogPublishBlock(ghMissing, { kind: "unknown" })).toBeNull();
  });

  it("keeps the GitHub-only wording where WordPress is not switched on", () => {
    expect(blogPublishBlock(ghMissing, { kind: "unavailable" })).toMatch(/^Connect GitHub for acme\.com first/);
  });
});

describe("blogPublishState", () => {
  it("names every place the post can go", () => {
    expect(blogPublishState(ghConnected, wpConnected)).toEqual({
      kind: "ready",
      note: "It goes to acme/site on GitHub or acme.com/blog on WordPress.",
    });
    expect(blogPublishState(ghMissing, wpConnected)).toEqual({ kind: "ready", note: "It goes to acme.com/blog on WordPress." });
  });

  it("offers GitHub's install link when blocked", () => {
    const state = blogPublishState(ghMissing, wpMissing);
    expect(state).toMatchObject({ kind: "blocked", title: "Connect GitHub or WordPress to publish", installUrl: "https://github.com/x" });
  });
});

describe("repoSummary", () => {
  it("shortens a long list", () => {
    expect(repoSummary(["a/1", "a/2", "a/3"])).toBe("a/1 and 2 more");
  });
});
