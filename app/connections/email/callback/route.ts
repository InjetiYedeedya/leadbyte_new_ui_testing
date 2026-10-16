import { APP_URL } from "@/lib/api/config";
import { NOT_STARTED_HERE, consentStarted } from "@/lib/auth/oauth-pending";
import { paramNames } from "@/lib/log-redact";
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  EMAIL_COOKIE,
  EMAIL_COOKIE_OPTIONS,
  readEmailCallback,
  readEmailCallbackFailure,
  saveMailboxRecord,
  serialiseMailbox,
} from "@/lib/data/email-callback";

/**
 * Where n8n returns the browser after a mailbox is connected.
 *
 * Hand n8n exactly this, per environment — the query string is theirs:
 *
 *   http://localhost:3000/connections/email/callback
 *     ?status=success&platform=gmail
 *     &email={{ $json.gmail_address }}&name={{ encodeURIComponent($json.name) }}
 *
 * and, when the backend refused the token for lacking a Gmail permission:
 *
 *   /connections/email/callback?status=error&reason=missing_scope
 *
 * ## Why a route and not a page
 *
 * The same reason as `/connections/google/callback`: n8n needs ONE stable URL,
 * and pointing it at a page would couple an external system to our routing.
 * The `/intelligence/*` → `/overview/*` move happened without touching n8n
 * precisely because these callbacks absorb that.
 *
 * ## What it does with the mailbox
 *
 * Stores it in an httpOnly cookie and redirects to the Connections page. The
 * address never appears in a URL of ours, and it survives a reload — see
 * `email-callback.ts` for why the cookie is the record rather than a hand-off.
 *
 * A failure is sent back with `?email=failed` (or `?email=missing-scope`, which
 * says which permission to allow) rather than written anywhere: the page then
 * keeps offering the connect flow, which is the correct thing to show whether
 * the attempt failed or was abandoned.
 */
export async function GET(request: NextRequest) {
  const mailbox = readEmailCallback(request.nextUrl.searchParams);
  const session = await getSession();

  // Consent succeeded but our own session lapsed while they were away. Signing
  // in restores it, and the mailbox is already stored backend-side — so this is
  // a detour, not a loss. Nothing is written: the cookie belongs to a session.
  if (!session) {
    return NextResponse.redirect(new URL("/login", APP_URL));
  }

  // Only a consent THIS browser started (`lib/auth/oauth-pending.ts`). This
  // route writes from its query string, so an unasked-for link must not be
  // able to set a mailbox, record a connection or plant accounts.
  if (!(await consentStarted("email"))) {
    console.warn("[email-callback] rejected: no consent was started from this browser");
    return NextResponse.redirect(new URL(NOT_STARTED_HERE, APP_URL));
  }

  // Built on APP_URL, never on the request: behind a proxy that forwards any
  // Host header, the request's own origin can be an attacker's.
  const destination = new URL("/intelligence/connections", APP_URL);

  if (!mailbox) {
    const failure = readEmailCallbackFailure(request.nextUrl.searchParams);
    console.warn(
      `[email-callback] no mailbox in the callback (${failure}). Params: ${paramNames(request.nextUrl.searchParams)}`,
    );
    destination.searchParams.set("email", failure);
    return NextResponse.redirect(destination);
  }

  console.log(`[email-callback] ${mailbox.address} connected`);
  // The backend record is what makes it stick past sign-out and on other
  // devices; the cookie below only covers this browser.
  await saveMailboxRecord(session.businessId, session.userId, mailbox);
  destination.searchParams.set("email", "connected");

  const response = NextResponse.redirect(destination);
  response.cookies.set(EMAIL_COOKIE, serialiseMailbox(mailbox), EMAIL_COOKIE_OPTIONS);
  return response;
}
