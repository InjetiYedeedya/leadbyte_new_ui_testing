"use server";

import { isPublicWebsite } from "@/lib/url-safety";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";

import { PENDING_URL_COOKIE } from "@/lib/data/pending-website";
import { encodePendingUrl } from "@/lib/data/pending-url-value";

/** Strips a leading scheme so the stored value matches what the field shows. */
function normalise(raw: string): string {
  return raw.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/**
 * Handles the Stage 01 website entry.
 *
 * Signed in  -> save the URL to the profile, then on to the dashboard.
 * Signed out -> stash it in a short-lived cookie and go create an account;
 *               `completeSignIn` saves it once there is an account to save it
 *               against.
 *
 * The analysis is STARTED here but not waited on. That became possible once
 * `POST /api/website-analyze` returned `202 { job_id }` instead of blocking for
 * up to 220s — we fire it off and the three Intelligence screens poll the job.
 * Never await the result inside a request.
 */
export async function captureWebsiteUrl(formData: FormData): Promise<void> {
  const websiteUrl = normalise(String(formData.get("websiteUrl") ?? ""));
  if (websiteUrl.length === 0) {
    redirect("/?setup=1");
  }
  // Only a public website goes to the crawler — see `lib/url-safety.ts`.
  if (!isPublicWebsite(websiteUrl)) {
    redirect("/?setup=1&url=invalid");
  }

  // NOTHING here talks to the backend. Saving the URL measured 11 SECONDS and
  // starting the analysis another 5 — eighteen seconds of an entry page that
  // looks untouched before the progress screen even rendered. Both now happen
  // on `/analysing`, where they are visible. All this does is remember the URL
  // and get out of the way, which is instant.
  //
  // The pending cookie is the same one a signed-out visitor uses; the
  // difference is only who picks it up.
  const store = await cookies();
  const session = await getSession();
  // Signed in, the URL is labelled with the account, so a different account
  // signing in on this browser cannot pick it up (`pending-url-value.ts`).
  store.set(PENDING_URL_COOKIE, encodePendingUrl(websiteUrl, session?.businessId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 30,
  });
  if (session) redirect("/analysing");
  redirect("/signup");
}
