import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { startConsent } from "@/lib/auth/oauth-pending";
import { LEADBYTE_API_URL, googleCallbackUrl } from "@/lib/api/config";
import { signValue } from "@/lib/auth/signed-cookie";
import { GOOGLE_FLOW_COOKIE, GOOGLE_FLOW_MAX_AGE } from "@/lib/data/google-products";

/**
 * Starts one of the three Google authorisation flows.
 *
 * ## Why this route exists
 *
 * Consent is a redirect chain the BROWSER must walk — a server-side fetch
 * cannot take someone through Google's approval screen. So the destination has
 * to be a plain navigable URL, and building it here keeps `email` /
 * `business_id` derived from the session rather than trusted from the client.
 *
 * ## The contract (backend team, step 1 of their flow)
 *
 *   GET {API}/api/oauth/google-analytics       Analytics only
 *   GET {API}/api/oauth/google-search-console  Search Console only
 *   GET {API}/api/oauth/google-unified         both at once
 *
 * All three take `?email=&business_id=`, need no `x-api-key` (a browser
 * navigation cannot attach a header, and `/api/oauth/*` is exempt for exactly
 * that reason), and 302 onward to Google.
 *
 * An earlier version sent every option to `google-analytics`, on the belief
 * that one Google OAuth covered both products. It does share a consent screen,
 * but the backend has a distinct route per option and the later steps are
 * per-flow too — so picking "Search Console" started the wrong flow, and
 * "both" started a single-product one.
 */
const FLOW_PATHS = {
  analytics: "/api/oauth/google-analytics",
  "search-console": "/api/oauth/google-search-console",
  unified: "/api/oauth/google-unified",
} as const;

export type GoogleFlow = keyof typeof FLOW_PATHS;

function flowFrom(value: string | null): GoogleFlow {
  return value !== null && Object.hasOwn(FLOW_PATHS, value) ? (value as GoogleFlow) : "unified";
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (!LEADBYTE_API_URL) {
    console.error(
      "[google-connect] LEADBYTE_API_URL is not set — cannot start Google " +
        "authorisation.",
    );
    redirect("/overview/website-audit?connect=unavailable");
  }

  // Unknown or missing `flow` falls back to the combined one: it grants a
  // superset, so a bad link costs the customer nothing.
  const flow = flowFrom(request.nextUrl.searchParams.get("flow"));
  const url = new URL(`${LEADBYTE_API_URL}${FLOW_PATHS[flow]}`);

  // `businessId` holds the account email in live mode; n8n identifies the user
  // from these, since a redirect carries no token.
  url.searchParams.set("email", session.businessId);
  url.searchParams.set("business_id", session.businessId);
  // Where we want the browser sent after consent.
  //
  // The Lambda currently STRIPS this — probing confirmed only `email` and
  // `business_id` reach n8n — and the backend team have been asked to forward
  // it (see docs/backend/BACKEND.md). Sending it now costs nothing, is harmless
  // while ignored, and means the flow starts working the moment they ship it,
  // with no deploy on our side.
  url.searchParams.set("redirect_uri", googleCallbackUrl());

  console.log(`[google-connect] flow=${flow} -> ${FLOW_PATHS[flow]}`);
  // Marks this browser as having started the flow; the return route checks it
  // (`lib/auth/oauth-pending.ts`).
  const response = await startConsent(url.toString(), "google");
  // Which products this consent asks for — the callback records them, so
  // Analytics and Search Console are no longer read as one grant
  // (`lib/data/google-products.ts`).
  response.cookies.set(GOOGLE_FLOW_COOKIE, await signValue(GOOGLE_FLOW_COOKIE, flow), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GOOGLE_FLOW_MAX_AGE,
  });
  return response;
}
