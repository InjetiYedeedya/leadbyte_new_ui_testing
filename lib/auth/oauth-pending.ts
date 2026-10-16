import { signText } from "@/lib/signed-text";
import { cookies, headers } from "next/headers";
import { APP_URL } from "@/lib/api/config";
import { NextResponse } from "next/server";
import { signValue, verifyValue } from "@/lib/auth/signed-cookie";

/**
 * "This browser started that connection" — the check the OAuth return routes
 * were missing.
 *
 * ## The hole
 *
 * Each return route (`/connections/{google,social,ads,email}/callback`) is a
 * GET that WRITES: it records a connection, stores the offered accounts, or
 * sets the outreach mailbox, all from the query string. Nothing tied that
 * request to a consent this browser had begun, so a crafted link sent to a
 * signed-in customer could set their outreach mailbox to an attacker's
 * address or plant fake ad accounts in their picker (audit, 2026-09-25).
 *
 * ## The fix
 *
 * The start routes set a short-lived SIGNED cookie naming the flow and the
 * time. The return routes accept the result only when that cookie is present,
 * valid, for the same flow and recent. A link from anywhere else arrives
 * without it. n8n does not echo an OAuth `state` back to us, which is why it
 * is a cookie and not a parameter; it serves the same purpose.
 */

const PENDING_COOKIE = "leadbyte_oauth_pending";
/**
 * Long enough for a slow consent screen, a two-factor prompt and a password
 * reset in the middle of it. It was 30 minutes, and a customer who stepped
 * away came back to "not started from this browser" for a consent they had
 * just given (2026-10-08). The cookie still names the flow and is signed, so
 * a longer window does not let a link from elsewhere through.
 */
const MAX_AGE_SECONDS = 60 * 60;

export type ConsentFlow = "google" | "social" | "ads" | "email";

/** A redirect to the provider's consent that also marks this flow as started. */
export async function startConsent(destination: string, flow: ConsentFlow): Promise<NextResponse> {
  // A start that ANOTHER site triggered is refused. The start routes are
  // plain GETs, so a page elsewhere could send a signed-in customer through
  // one — which set this cookie — and then to a return URL of its own
  // choosing, saving its own mailbox or accounts into the customer's
  // workspace (audit, 2026-09-29). Browsers say where a navigation came from
  // in `Sec-Fetch-Site`; our own links are "same-origin", a typed address or
  // bookmark is "none", and only "cross-site" is turned away.
  const site = (await headers()).get("sec-fetch-site");
  if (site === "cross-site") {
    return NextResponse.redirect(new URL(NOT_STARTED_HERE, APP_URL));
  }
  const response = NextResponse.redirect(destination);
  response.cookies.set(PENDING_COOKIE, await signValue(PENDING_COOKIE, `${flow}|${Date.now()}`), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return response;
}

/** True only when THIS browser started `flow` in the last half hour. */
export async function consentStarted(flow: ConsentFlow): Promise<boolean> {
  const store = await cookies();
  const value = await verifyValue(PENDING_COOKIE, store.get(PENDING_COOKIE)?.value);
  if (!value) return false;
  const [started, at] = value.split("|");
  const age = Date.now() - Number(at);
  return started === flow && Number.isFinite(age) && age >= 0 && age < MAX_AGE_SECONDS * 1000;
}

/** Where a result that was not started here is sent, with a plain reason. */
export const NOT_STARTED_HERE =
  "/intelligence/connections?error=oauth&message=" +
  encodeURIComponent(
    signText(
      "We couldn't finish that connection. It has to be completed in the same browser it was started in, " +
        "within an hour. Please press Connect again here and finish it in this window.",
    ),
  );
