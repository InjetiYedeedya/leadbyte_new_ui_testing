import { githubPublishBlock, type GithubConnection } from "@/lib/data/github-connection";
import { wordpressLabel, type WordpressStatus } from "@/lib/data/wordpress-connection";

/**
 * Where the Blog Posting agent can publish, and whether it may run at all
 * (2026-10-09): a GitHub repository for the site, or a WordPress site. Either
 * one is enough.
 *
 * One module for the rule because two places apply it — the page (which
 * shows the button or a "connect first" box) and the Server Action (the real
 * gate). They disagreed once, for GitHub alone, and the page said "it goes to
 * <repo>" while the button refused.
 *
 * Only a definite "no" blocks: a check we could not make (GitHub or WordPress
 * "unknown") is not treated as missing — the same rule as the ad gate.
 */

export type BlogPublishState =
  /** `note` names where the post goes, or says a check could not be made. */
  | { kind: "ready"; note: string | null }
  /** `installUrl` is GitHub's, or null when there is no website to connect it for. */
  | { kind: "blocked"; title: string; message: string; installUrl: string | null };

/** "acme/site" · "acme/site and acme/blog" · "acme/site and 3 more". */
export function repoSummary(repos: string[]): string {
  const [first, second] = repos;
  if (first === undefined) return "";
  if (repos.length === 1) return first;
  if (repos.length === 2) return `${first} and ${second}`;
  return `${first} and ${repos.length - 1} more`;
}

/** Why the agent may not publish, or null when it may. */
export function blogPublishBlock(github: GithubConnection, wordpress: WordpressStatus): string | null {
  if (wordpress.kind === "connected" || wordpress.kind === "unknown") return null;
  const githubBlock = githubPublishBlock(github);
  if (githubBlock === null) return null;
  // WordPress can be offered as the other way only where it is switched on.
  if (wordpress.kind === "unavailable") return githubBlock;
  return github.kind === "not-connected"
    ? `Connect GitHub for ${github.domain} or connect your WordPress site first. The agent publishes your post through one of them.`
    : "Add your website first, or connect WordPress. The agent publishes your post through one of them.";
}

export function blogPublishState(github: GithubConnection, wordpress: WordpressStatus): BlogPublishState {
  const block = blogPublishBlock(github, wordpress);
  if (block !== null) {
    return github.kind === "not-connected"
      ? {
          kind: "blocked",
          title: wordpress.kind === "unavailable" ? "Connect GitHub to publish" : "Connect GitHub or WordPress to publish",
          message: block,
          installUrl: github.installUrl,
        }
      : {
          kind: "blocked",
          title: wordpress.kind === "unavailable" ? "Add your website to publish" : "Connect WordPress or add your website",
          message: block,
          installUrl: null,
        };
  }

  const places: string[] = [];
  if (github.kind === "connected") {
    const summary = repoSummary(github.repos);
    places.push(summary ? `${summary} on GitHub` : "your GitHub repository");
  }
  if (wordpress.kind === "connected") places.push(`${wordpressLabel(wordpress.wpUrl)} on WordPress`);
  if (places.length > 0) return { kind: "ready", note: `It goes to ${places.join(" or ")}.` };

  if (github.kind === "unknown" || wordpress.kind === "unknown") {
    return { kind: "ready", note: "We couldn't check where it publishes just now; without a connection the post is written but not published." };
  }
  return { kind: "ready", note: null };
}
