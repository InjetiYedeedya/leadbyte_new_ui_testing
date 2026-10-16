import { isAeoConfigured } from "@/lib/api/config";
import { isRedirectError } from "@/lib/auth/session-expired";
import { getBusinessProfileRepo } from "@/lib/data/business-profile-repo";
import { isFilled } from "@/lib/data/profile-display";
import { type GithubStatus, listGithubRepos, readGithubStatus } from "@/lib/data/aeo-deploy";

/**
 * GitHub on the Connections page.
 *
 * The connection itself belongs to the AEO service, which is where it was
 * built for the report's "open a pull request" route (`aeo-deploy.ts`). It is
 * keyed on the account AND the site — `user_id` + `domain` — so the domain
 * here is always derived on the server from the business's own website, never
 * taken from the browser. A connection for somebody else's site is not a
 * question this page can be made to ask.
 *
 * Disconnecting (`disconnectGithub`, 2026-10-01) forgets the link on the
 * service only. The GitHub App stays installed until the customer removes it
 * on GitHub's own installation page, and the screens say so.
 */

/** GitHub's own page for a user's app installations. */
export const GITHUB_INSTALLATIONS_URL = "https://github.com/settings/installations";

export type GithubConnection =
  /** No website on the profile yet — the connection is per site. */
  | { kind: "no-site" }
  /** The AEO service is not set up in this environment, or not for GitHub. */
  | { kind: "unavailable" }
  /** We asked and did not get an answer. Not the same as "not connected". */
  | { kind: "unknown"; domain: string }
  | { kind: "not-connected"; domain: string; installUrl: string }
  | { kind: "connected"; domain: string; repos: string[]; installUrl: string };

/**
 * The bare host the service keys a connection on: `acme.com` for
 * `https://www.acme.com/about`. Empty for anything that is not a web address.
 */
export function siteDomain(websiteUrl: string | null | undefined): string {
  if (!isFilled(websiteUrl)) return "";
  const trimmed = websiteUrl.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Turns the service's answer into the row's state. Pure, so it is tested. */
export function toGithubConnection(
  domain: string,
  status: GithubStatus,
  repos: string[],
): GithubConnection {
  if (!status.configured) return { kind: "unavailable" };
  if (!status.connected) return { kind: "not-connected", domain, installUrl: status.installUrl };
  // The status's own `repo`, when set, is the one already tied to this site;
  // it leads the list rather than being repeated in it.
  const all = status.repo ? [status.repo, ...repos.filter((r) => r !== status.repo)] : repos;
  return { kind: "connected", domain, repos: all, installUrl: status.installUrl };
}

/** The domain for this account's site, or "" when there is no site yet. */
export async function businessDomain(businessId: string): Promise<string> {
  const profile = await getBusinessProfileRepo().get(businessId);
  return siteDomain(profile?.websiteUrl);
}

/**
 * Why the Blog Posting agent may not publish yet, or null when it may.
 *
 * It publishes through the site's GitHub repository; without one the backend
 * writes the post (a paid run) and then reports "No GitHub repo connected".
 * Only a definite "not connected" (or no site to connect) blocks. A check we
 * could not make, or GitHub not being switched on here, does not — the same
 * rule as the ad gate: an unanswered question is not a "no".
 */
export function githubPublishBlock(connection: GithubConnection): string | null {
  switch (connection.kind) {
    case "no-site":
      return "Add your website first. GitHub is connected per website, and the post is published to it.";
    case "not-connected":
      return `Connect GitHub for ${connection.domain} first. The agent publishes your post through your site's GitHub repository.`;
    default:
      return null;
  }
}

/**
 * The read for one domain. `repos: false` skips the repository list, for a
 * caller that only needs to know whether it is connected.
 */
export async function readGithubConnectionFor(
  businessId: string,
  domain: string,
  { repos: withRepos = true }: { repos?: boolean } = {},
): Promise<GithubConnection> {
  if (!isAeoConfigured()) return { kind: "unavailable" };
  if (domain === "") return { kind: "no-site" };

  try {
    const status = await readGithubStatus(businessId, domain);
    // The repository list is extra detail: losing it must not lose the badge.
    const repos =
      status.connected && withRepos
        ? await listGithubRepos(businessId, domain).catch((error: unknown) => {
            console.error("[github] could not list repositories:", error);
            return [];
          })
        : [];
    return toGithubConnection(domain, status, repos);
  } catch (error) {
    console.error("[github] status check failed:", error);
    return { kind: "unknown", domain };
  }
}

/**
 * The whole read for the row. Never throws — a failed check reads as
 * "unknown", which the page says as such rather than as "not connected".
 */
export async function readGithubConnection(businessId: string): Promise<GithubConnection> {
  if (!isAeoConfigured()) return { kind: "unavailable" };

  let domain = "";
  try {
    domain = await businessDomain(businessId);
  } catch (error) {
    // A dead session leaves as a redirect, not as "unavailable".
    if (isRedirectError(error)) throw error;
    console.error("[github] could not read the website for the GitHub check:", error);
    return { kind: "unavailable" };
  }
  return readGithubConnectionFor(businessId, domain);
}
