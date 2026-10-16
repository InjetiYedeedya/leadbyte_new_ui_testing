import { ApiError, ApiTimeoutError, apiRequest } from "@/lib/api/client";
import { isBackendConfigured } from "@/lib/api/config";
import { isRedirectError } from "@/lib/auth/session-expired";
import { NOT_SWITCHED_ON, describeBlogReply, readBlogFailure, readBlogStatus, readBlogSuccess, type BlogOutcome } from "@/lib/data/blog-post-result";

/**
 * Write and publish one blog post: `POST /api/blog-posting { website_url }`.
 *
 * Server-only. Only the website goes in the body: the backend takes the
 * account from the login token, so nobody can post for someone else, and the
 * handoff is explicit that `user_id` must not be sent.
 *
 * One request for the whole run, 1 to 4 minutes, so this waits up to five.
 * It never throws: every outcome, including the route not being deployed
 * yet, comes back as a sentence to show.
 */

const RUN_TIMEOUT_MS = 5 * 60_000;

export async function runBlogPost(websiteUrl: string): Promise<BlogOutcome> {
  if (!isBackendConfigured()) return { kind: "failed", message: NOT_SWITCHED_ON };
  try {
    const payload = await apiRequest<unknown>("/api/blog-posting", {
      method: "POST",
      body: { website_url: websiteUrl },
      timeoutMs: RUN_TIMEOUT_MS,
    });
    const outcome = readBlogSuccess(payload);
    // A 2xx with no post in it: what came back is the only way to tell a
    // pipeline failure from a reply shaped differently than we read.
    if (outcome.kind === "failed") console.error(`[blog-posting] run ended without a post: ${outcome.message} — ${describeBlogReply(payload)}`);
    return outcome;
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof ApiTimeoutError) {
      const failure = readBlogFailure(504, "");
      return failure.kind === "failed" ? { ...failure, timedOut: true } : failure;
    }
    // 524 is Cloudflare closing the connection after 100 seconds while the
    // backend is still working — a run takes 1 to 4 minutes, so a long one
    // ends here. The post is usually still written and published, so it is
    // treated exactly like our own timeout: "check your site", and the
    // one-run guard stays held so a retry cannot publish a second post
    // (2026-10-09, seen live).
    if (error instanceof ApiError && error.status === 524) {
      const failure = readBlogFailure(504, "");
      return failure.kind === "failed" ? { ...failure, timedOut: true } : failure;
    }
    if (error instanceof ApiError) return readBlogFailure(error.status, error.message);
    console.error("[blog-posting] run failed:", error);
    return { kind: "failed", message: "Blog posting failed. Please try again." };
  }
}

/** Job ids are the backend's own; anything else never reaches a URL. */
const JOB_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * One check of a background blog job. Never throws. A passing fault — a
 * timeout, a 5xx, Cloudflare's 524 — reads as still running, because the job
 * goes on regardless and the next check will see it; only a 404 (the job is
 * gone) or a refusal ends the wait.
 */
export async function checkBlogJob(jobId: string): Promise<BlogOutcome | { kind: "running" }> {
  if (!JOB_ID.test(jobId)) return { kind: "failed", message: "We lost track of this post. Check your site before trying again." };
  try {
    const payload = await apiRequest<unknown>(`/api/blog-posting/status/${encodeURIComponent(jobId)}`, { timeoutMs: 20_000 });
    const outcome = readBlogStatus(payload);
    if (outcome.kind === "failed" || (outcome.kind === "done" && outcome.published === null)) {
      console.warn(`[blog-posting] job ${jobId} ended: ${outcome.kind} — ${describeBlogReply(payload)}`);
    }
    return outcome;
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof ApiError && error.status === 404) {
      return { kind: "failed", message: "We lost track of this post. Check your site before trying again." };
    }
    if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) {
      return readBlogFailure(error.status, error.message);
    }
    console.warn(`[blog-posting] job ${jobId} check failed, will check again:`, error instanceof Error ? error.message : error);
    return { kind: "running" };
  }
}
