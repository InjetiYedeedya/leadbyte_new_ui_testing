"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { setSession } from "@/lib/auth/session";
import { clearAllAccountCookies } from "@/lib/auth/sign-out";
import { isBackendConfigured } from "@/lib/api/config";
import { emailSignIn, googleSignIn, type SignInResponse } from "@/lib/api/auth-api";
import { GENERIC_AUTH_ERROR } from "@/lib/firebase/errors";
import { ApiError } from "@/lib/api/client";
import {
  getBusinessProfileRepo,
  type BusinessProfileRepo,
} from "@/lib/data/business-profile-repo";
import { startAnalysisForUrl } from "@/lib/data/pending-website";
import { decodePendingUrl, encodePendingUrl, pendingUrlAtSignIn } from "@/lib/data/pending-url-value";
import { recordSignIn } from "@/lib/admin/activity-log";
import { isStartingAdmin } from "@/lib/admin/roles";

export type AuthProvider = "google" | "email";

/** Failure only — success redirects, so it never returns a value. */
export interface AuthFailure {
  ok: false;
  message: string;
}

const PENDING_URL_COOKIE = "leadbyte_pending_url";

/** Shown when the backend is unreachable for reasons the user cannot fix. */
const SERVICE_UNAVAILABLE =
  "We can't sign you in right now. This is a problem on our side — please try again shortly.";

/**
 * True when the backend rejected our gateway key rather than the user.
 *
 * The v1 Lambda gates every route on `x-api-key` before routing, returning
 * 401 "Missing API key (x-api-key header required)" or 401 "Invalid API key".
 * Both mean LEADBYTE_API_KEY is unset, wrong, or rotated.
 */
function isGatewayKeyError(error: ApiError): boolean {
  return error.status === 401 && /API key/i.test(error.message);
}

/** Mock identity, used when no backend is configured. Matches the seeded data. */
const MOCK_BUSINESS_ID = "novaflow";
const MOCK_OWNER_ID = "rhea@novaflow.io";

interface SessionArgs {
  businessId: string;
  ownerId: string;
  /** The Firebase uid, kept because profile rows carry a `userId`. */
  userId: string;
  tokens: { accessToken: string; refreshToken: string; expiresIn?: number };
}

/**
 * Maps a backend sign-in response onto our session.
 *
 * `businessId` is the account **email**, not the userId. That is not arbitrary:
 * the backend's DynamoDB tables are email-keyed by default
 * (`getPartitionKeyName()` returns 'email' for anything not in its key map),
 * so keying our session on the email lets every repo read the backend
 * directly. Routing through the userId instead requires a userId→email lookup
 * table, which returns "Could not resolve userId to email" for any account
 * missing a row in it.
 *
 * One user maps to one business in live mode — our multi-business model has no
 * backend equivalent yet.
 *
 * Exported for testing: the surrounding Server Action can't be unit-tested
 * because it reads cookies, but this mapping is where the field-name risk
 * lives. `uid` was our original guess and it was wrong; the live API sends
 * `userId`.
 */
export async function sessionArgsFromSignIn(res: SignInResponse): Promise<SessionArgs> {
  // `userId` is what the live API sends; `uid` and `user_id` are defensive
  // fallbacks (the latter is the spelling in FRONTEND_BACKEND_API_CALLS.md).
  const uid = res.user?.userId ?? res.user?.uid ?? res.user?.user_id;
  const email = res.user?.email;
  if (!uid) {
    // Include the actual shape: `AuthUser.uid` is an inferred field name, so
    // this is the most likely place for a live response to surprise us.
    const topLevel = res && typeof res === "object" ? Object.keys(res) : [];
    const userKeys =
      res?.user && typeof res.user === "object" ? Object.keys(res.user) : [];
    throw new Error(
      `Sign-in response contained no user uid. Top-level keys: [${topLevel.join(", ")}]. ` +
        `user keys: [${userKeys.join(", ")}].`,
    );
  }
  return {
    // Email first — it is the key the backend's tables actually use.
    businessId: email ?? uid,
    ownerId: email ?? uid,
    // Kept separately: `businessId` is the email, but rows in
    // Leadbyte_User_Overall_Details also need the uid, and no other part of a
    // later request carries it.
    userId: uid,
    tokens: {
      accessToken: res.tokens.accessToken,
      refreshToken: res.tokens.refreshToken,
      // Seconds, per the backend. Used directly as the cookie's maxAge.
      expiresIn: res.tokens.expiresIn,
    },
  };
}

/**
 * Reads the URL captured on the entry screen, without clearing it — but only
 * one typed signed out or by this same account. One left behind by a
 * DIFFERENT account on this browser is deleted, never saved as this one's
 * (2026-10-16, `pending-url-value.ts`).
 */
async function readPendingUrl(account: string): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(PENDING_URL_COOKIE)?.value;
  const url = decodePendingUrl(raw, account);
  if (raw && url === null) store.delete(PENDING_URL_COOKIE);
  return url;
}

async function clearPendingUrl(): Promise<void> {
  const store = await cookies();
  store.delete(PENDING_URL_COOKIE);
}

/**
 * Saves the website URL captured before the account existed.
 *
 * MUST NEVER THROW. By the time this runs the session cookie is already
 * written, so the user IS signed in. A throw here used to be caught by the
 * sign-in error handler, which then reported a successful login as
 * "Something went wrong signing you in", skipped the redirect, and left the
 * user sitting on the login form. The URL was gone too, because the cookie
 * holding it had already been deleted before the save was attempted.
 *
 * So: the caller clears the cookie only when `saved` is true. A failed save
 * keeps the URL for the next attempt instead of silently dropping it.
 *
 * Exported for testing — the surrounding action reads cookies and can't be
 * unit-tested, but this is where the damage was.
 */
export async function savePendingWebsiteUrl(
  repo: Pick<BusinessProfileRepo, "saveWebsiteUrl">,
  businessId: string,
  pendingUrl: string | null,
  userId?: string,
): Promise<{ saved: boolean }> {
  if (pendingUrl === null || pendingUrl === "") return { saved: false };

  try {
    await repo.saveWebsiteUrl(businessId, pendingUrl, userId);
    return { saved: true };
  } catch (error) {
    // Loud, because the user is now signed in with no website on file, which
    // sends them back to the Stage 01 screen and looks like a broken flow.
    console.error(
      `[auth] signed ${businessId} in successfully but could NOT save the ` +
        `captured website URL "${pendingUrl}". They will land back on the ` +
        "website-entry screen. Cause:",
      error,
    );
    return { saved: false };
  }
}

/**
 * Exchanges a Firebase idToken for a backend session.
 *
 * Failure returns a message for the form to display. Success redirects to
 * `/`, which then decides between the dashboard and the website-entry screen.
 *
 * NOTHING that runs after `setSession()` may live inside the try block. At
 * that point the user is signed in, so a throw there would report a
 * successful sign-in as a failure — which is exactly what `redirect()`
 * (NEXT_REDIRECT) and the pending-URL save both used to do.
 */
export async function completeSignIn(
  idToken: string,
  provider: AuthProvider,
): Promise<AuthFailure> {
  if (!isBackendConfigured()) {
    return mockSignIn();
  }

  let signedInAs: string;
  let signedInUid: string | undefined;
  let signInRecord: Parameters<typeof recordSignIn>[0];

  try {
    const res = provider === "google" ? await googleSignIn(idToken) : await emailSignIn(idToken);
    const { businessId, ownerId, userId, tokens } = await sessionArgsFromSignIn(res);
    // Admin is recognised by email address alone (`lib/admin/roles.ts`), and
    // email sign-up is open — so anyone could CREATE an account on a starting
    // admin address that had none yet and walk into the admin panel (audit,
    // 2026-09-29). A brand-new account on one of those addresses must prove it
    // owns the inbox first. Existing accounts are untouched.
    if (
      res.isNewUser === true &&
      res.user?.emailVerified !== true &&
      isStartingAdmin(businessId)
    ) {
      console.error(`[auth] refused a new, unverified account on admin address ${businessId}`);
      return {
        ok: false,
        message: "This address needs to be verified before it can be used. Contact support.",
      };
    }
    // Nothing of a PREVIOUS account survives into this one. On a shared
    // browser whose last session expired without a sign-out, the next person
    // inherited its OpenAI key, mailbox and connected accounts (audit,
    // 2026-09-25). Only the website this visitor typed before signing in is
    // kept — it is theirs, and the steps below save it.
    await clearAllAccountCookies({ keep: ["leadbyte_pending_url"] });
    await setSession(businessId, ownerId, tokens, userId);
    signedInAs = businessId;
    signedInUid = userId;
    signInRecord = {
      email: businessId,
      userId,
      accessToken: tokens.accessToken,
      isNewUser: res.isNewUser === true,
      displayName: res.user?.name,
      provider: res.user?.provider ?? provider,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      // A gateway-key failure is OUR misconfiguration, not the user's fault.
      // Showing them "Invalid API key" is both confusing and a hint about our
      // infrastructure, so it is logged server-side and shown as an outage.
      if (isGatewayKeyError(error)) {
        console.error(
          "[auth] leadbyte-api rejected LEADBYTE_API_KEY — the gateway key is " +
            "missing, wrong, or has been rotated. Sign-in cannot work until it " +
            "is replaced.",
        );
        return { ok: false, message: SERVICE_UNAVAILABLE };
      }
      // Other 4xx messages are about the credential itself (e.g. "Invalid
      // Firebase token") and are safe to show. 5xx can carry internals.
      console.error(`[auth] backend returned ${error.status} ${error.code ?? ""}: ${error.message}`);
      return { ok: false, message: error.status < 500 ? error.message : GENERIC_AUTH_ERROR };
    }
    // Anything else — a shape mismatch, a network fault — is invisible to the
    // user by design, so it must be visible in the server log.
    console.error("[auth] sign-in failed with a non-API error:", error);
    return { ok: false, message: GENERIC_AUTH_ERROR };
  }

  // Signed in from here on. Everything below is best-effort and cannot throw.
  // The admin activity log first — it is the same for every destination.
  await recordSignIn(signInRecord);

  // A failure is logged and the captured URL is kept, but it can never fail
  // the sign-in.
  const pendingUrl = await readPendingUrl(signedInAs);

  // An EXISTING account never has its website replaced at sign-in. A site
  // typed on the entry screen while signed out may not be theirs at all (a
  // shared browser, a visitor), and saving it silently overwrote the website
  // on file and analysed the new one (2026-10-16, vignesh@ntimes.ai showing
  // ZippyGo). They land on the setup screen with it pre-filled instead, and
  // pressing Analyze is what saves it. Re-labelled as theirs so no other
  // account on this browser can take it.
  if (pendingUrlAtSignIn(pendingUrl, signInRecord.isNewUser) === "confirm" && pendingUrl) {
    const store = await cookies();
    store.set(PENDING_URL_COOKIE, encodePendingUrl(pendingUrl, signedInAs), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 30,
    });
    redirect("/?setup=1");
  }

  const { saved } = await savePendingWebsiteUrl(
    getBusinessProfileRepo(),
    signedInAs,
    pendingUrl,
    signedInUid,
  );
  if (saved && pendingUrl) {
    await clearPendingUrl();
    // A brand-new account: start the analysis straight away rather than making
    // them find the Run analysis button, and show them the wait rather than a
    // dashboard that has nothing in it yet. Cannot throw.
    await startAnalysisForUrl(signedInAs, pendingUrl);
    redirect("/analysing");
  }

  // "/" decides: Stage 01 if we have no website on file, dashboard if we do.
  redirect("/");
}

/**
 * Signs in without any credential check, as the seeded NovaFlow workspace.
 *
 * This is the Phase 0 behaviour, kept for LOCAL environments with no Firebase
 * and no backend configured. It refuses once LEADBYTE_API_URL is set, and in
 * every production build.
 */
export async function mockSignIn(): Promise<AuthFailure> {
  // The action id of this function ships in the login page's bundle, so it
  // can be POSTed to directly even when the form never shows the mock path.
  // It signs in with NO credential, so it refuses outright whenever there is
  // a real backend, and in any production build — a production deploy that
  // lost its backend variable must fail closed, not let everyone in
  // (audit, 2026-09-25).
  if (isBackendConfigured() || process.env.NODE_ENV === "production") {
    return { ok: false, message: GENERIC_AUTH_ERROR };
  }
  await setSession(MOCK_BUSINESS_ID, MOCK_OWNER_ID);
  await recordSignIn({ email: MOCK_OWNER_ID });
  const { saved } = await savePendingWebsiteUrl(
    getBusinessProfileRepo(),
    MOCK_BUSINESS_ID,
    await readPendingUrl(MOCK_BUSINESS_ID),
  );
  if (saved) await clearPendingUrl();
  redirect("/overview");
}
