"use server";

import { currentBusinessId } from "@/components/page-shell";
import { getSession } from "@/lib/auth/session";
import { getBusinessProfileRepo } from "@/lib/data/business-profile-repo";
import { isFilled } from "@/lib/data/profile-display";
import { beginAction, guardMessage } from "@/lib/data/action-guard";
import { checkBlogJob, runBlogPost } from "@/lib/data/blog-posting";
import type { BlogOutcome } from "@/lib/data/blog-post-result";
import { readGithubConnection } from "@/lib/data/github-connection";
import { blogPublishBlock } from "@/lib/data/blog-publish";
import { readWordpressStatus } from "@/lib/data/wordpress-repo";
import { NOT_PUBLIC_WEBSITE, isPublicWebsite } from "@/lib/url-safety";

/**
 * The Blog Posting agent's one action: write a post and publish it.
 *
 * It publishes to the customer's own site, and each run costs real money
 * downstream, so one run per account at a time and not more than once a
 * minute (`action-guard.ts`). The button disabling itself stops a double
 * click; this stops a second tab, a reload, or a retry while the first run is
 * still going.
 */
export async function writeBlogPost(): Promise<BlogOutcome> {
  const session = await getSession();
  if (!session) return { kind: "failed", message: "Your session expired. Please sign in again." };

  const businessId = await currentBusinessId();
  // Only the account's own website, read here on the server — never one sent
  // from the browser. The backend knows only that site (a different one is
  // refused with "We couldn't find this website on your account"), GitHub is
  // connected per site, and WordPress is the account's one site: a post for
  // any other website either fails or is published to the wrong place
  // (2026-10-13). So the page shows the website and does not let it be edited.
  const saved = (await getBusinessProfileRepo().get(businessId))?.websiteUrl ?? "";
  if (!isFilled(saved)) return { kind: "failed", message: "Add your website first. The post is written for it and published to it." };
  const site = saved.trim();
  if (!isPublicWebsite(site)) return { kind: "failed", message: NOT_PUBLIC_WEBSITE };
  // A bare host is stored as typed on the entry form; the backend wants a scheme.
  const websiteUrl = /^https?:\/\//i.test(site) ? site : `https://${site}`;

  // The SAME check the page makes: GitHub for the business's own website
  // (`readGithubConnection`), so the page and the button cannot disagree.
  // GitHub OR WordPress (2026-10-09): either one is enough
  // (`blog-publish.ts`, the same rule the page shows).
  const [github, wordpress] = await Promise.all([readGithubConnection(businessId), readWordpressStatus()]);
  const block = blogPublishBlock(github, wordpress);
  if (block) {
    console.warn(
      `[blog-posting] blocked: GitHub ${github.kind} for ${"domain" in github ? github.domain : "(no site)"}, WordPress ${wordpress.kind}`,
    );
    return { kind: "failed", message: block };
  }

  const guard = beginAction(businessId, "blog-post", {
    // Longer than the longest run the backend describes, so a live run is
    // never mistaken for a dead one.
    staleAfterMs: 6 * 60_000,
    minIntervalMs: 60_000,
  });
  if (!guard.ok) return { kind: "failed", message: guardMessage(guard.reason) };

  const outcome = await runBlogPost(websiteUrl).catch((error: unknown) => {
    guard.release();
    throw error;
  });
  // A timeout is not a finished run — the backend keeps writing and
  // publishing. Holding the guard until it goes stale (six minutes) stops a
  // retry from publishing a second post beside the first (audit, 2026-09-29).
  // A started job is the same: the backend is writing now, so the guard is
  // held until it goes stale rather than inviting a second post beside it.
  if (!(outcome.kind === "failed" && outcome.timedOut) && outcome.kind !== "started") guard.release();
  return outcome;
}

/**
 * One check of the background job `writeBlogPost` started. The account comes
 * from the login token on the backend, so a job id alone cannot read someone
 * else's post.
 */
export async function checkBlogPost(jobId: string): Promise<BlogOutcome | { kind: "running" }> {
  const session = await getSession();
  if (!session) return { kind: "failed", message: "Your session expired. Please sign in again." };
  return checkBlogJob(jobId);
}
