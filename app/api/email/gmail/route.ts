import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { startConsent } from "@/lib/auth/oauth-pending";
import { LEADBYTE_API_URL, emailCallbackUrl } from "@/lib/api/config";

/**
 * Starts the Gmail authorisation (the email-sending OAuth, not sign-in).
 *
 * ## Why this route exists
 *
 * Same reason as `/api/ads/connect` and `/api/google/connect`: consent is a
 * 302 chain the BROWSER walks, so the destination must be a plain navigable
 * URL, and the identifiers on it are derived from the session rather than
 * trusted from the page — a hand-edited link must not be able to connect a
 * mailbox for someone else.
 *
 * ## The contract (backend team, 2026-09-04)
 *
 *   GET {API}/api/oauth/gmail?email=<e>&user_id=<id>
 *
 * No `x-api-key`: `/api/oauth/*` is exempt, because a browser navigation
 * cannot attach a header. Probed 2026-09-04 — it 302s onward to the n8n
 * `gmail_connect` webhook, which captures the refresh token and then calls
 * `POST /api/email/connect` server-to-server. The frontend never sees a
 * password on this path.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (!LEADBYTE_API_URL) {
    console.error("[email-gmail] LEADBYTE_API_URL is not set — cannot start Gmail authorisation.");
    redirect("/intelligence/connections?error=unavailable");
  }

  const url = new URL(`${LEADBYTE_API_URL}/api/oauth/gmail`);
  // `businessId` holds the account email in live mode. A redirect carries no
  // token, so these are how n8n attributes the mailbox to a user.
  url.searchParams.set("email", session.businessId);
  // Ignored by n8n today, and correct the day it is not — see
  // `emailCallbackUrl`. Never built from the request's Host.
  url.searchParams.set("redirect_uri", emailCallbackUrl());
  if (session.userId) {
    url.searchParams.set("user_id", session.userId);
  } else {
    // Same rule the ads flow follows: an empty user_id writes a row that looks
    // attributed and is not, so log it rather than send it blank.
    console.warn(`[email-gmail] no userId on the session for ${session.businessId}`);
  }

  console.log("[email-gmail] -> /api/oauth/gmail");
  // Marks this browser as having started the flow; the return route checks it
  // (`lib/auth/oauth-pending.ts`).
  return startConsent(url.toString(), "email");
}
