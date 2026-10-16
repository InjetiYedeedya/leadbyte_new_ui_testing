"use server";

import { redirect } from "next/navigation";
import { ApiError, ApiTimeoutError, apiRequest } from "@/lib/api/client";
import { isBackendConfigured } from "@/lib/api/config";
import { approvalBody, readCreativeReview } from "@/lib/data/creative-review";

/**
 * Approves the creative a review link describes.
 *
 * Reached only by the page's Confirm button (a POST), never on page load:
 * email scanners open every link in a message ahead of the reader, and a page
 * that approved on arrival would publish ads nobody had looked at.
 *
 * `POST /api/creative/approve` with the link's own fields + `action:
 * "approved"`. The Lambda forwards them to the platform's n8n approver
 * (`meta_ads_post_approver` / `google_ads_post_approver`) server-to-server,
 * so no n8n URL ships to the browser — the legacy page called n8n directly as
 * a marked TEMP shortcut. Confirmed on `leadbyte-api_v1` 2026-09-29: an
 * unknown platform answers `Unsupported platform`, so the route is live.
 *
 * `x-api-key` only (`authenticated: false`): the person approving opened an
 * email and is usually not signed in, and the approval is not theirs to
 * attribute — the campaign is identified by the link's own fields.
 *
 * The link is re-read here rather than trusted from the page, so a forged
 * POST gets exactly the checks the page applies: a known platform, https
 * assets only, and a size cap.
 */
export async function approveCreative(formData: FormData): Promise<void> {
  const query = String(formData.get("query") ?? "");
  const review = readCreativeReview(new URLSearchParams(query));
  if (!review) redirect(`/creative/approve?${query}`);

  // Mock mode: there is no approver to tell, and the flow should still be
  // walkable end to end — the same rule as every other unconfigured path.
  if (isBackendConfigured()) {
    try {
      await apiRequest("/api/creative/approve", {
        method: "POST",
        body: approvalBody(review),
        authenticated: false,
        timeoutMs: 30_000,
      });
    } catch (error) {
      const why =
        error instanceof ApiTimeoutError
          ? "timed out"
          : error instanceof ApiError
            ? `${error.status} ${error.message}`
            : String(error);
      console.error(`[creative-approve] ${review.platform} approval failed: ${why}`);
      const retry = new URLSearchParams(query);
      retry.set("error", "1");
      redirect(`/creative/approve?${retry.toString()}`);
    }
  }

  console.log(`[creative-approve] ${review.platform} approved`);
  // The result is its own URL, with none of the link's fields: reloading it
  // shows the same confirmation and cannot approve a second time.
  redirect("/creative/approve?approved=1");
}
