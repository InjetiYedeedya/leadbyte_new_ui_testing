import { getSession } from "@/lib/auth/session";
import { apiRequest } from "@/lib/api/client";
import { isBackendConfigured } from "@/lib/api/config";
import { isRedirectError } from "@/lib/auth/session-expired";
import { adsListPath, parseAdsList, type AdsListOption } from "@/lib/data/ads-lists";

/**
 * The ad setup forms' live lists: saved audiences, lead forms, store
 * locations (`lib/data/ads-lists.ts`).
 *
 * The documented seam for a list that depends on a choice made a moment ago —
 * the same exception `/api/locations` is: an island cannot reach the Lambda
 * (httpOnly credentials), so it asks us. A FIXED MENU of five
 * platform/list pairs, never a passthrough, and the email is the session's,
 * never the caller's — a list is always this account's own.
 *
 * Always answers `{ ok, options }`, with `ok: false` when the list could not be
 * read, so the form can say "Unable to load … Please try again." rather than
 * showing an empty list as though the account had none.
 */

/** n8n reads the ad account live; give it longer than a table read. */
const LIST_TIMEOUT_MS = 30_000;

export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return Response.json({ ok: false, options: [] }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const path = adsListPath(params.get("platform") ?? "", params.get("kind") ?? "");
  if (path === null) {
    return Response.json({ ok: false, options: [] }, { status: 400 });
  }
  if (!isBackendConfigured()) {
    // Unconfigured is a working environment: nothing to list, and nothing broken.
    return Response.json({ ok: true, options: [] satisfies AdsListOption[] });
  }

  try {
    const reply = await apiRequest<unknown>(path, {
      method: "POST",
      body: { email: session.businessId, ...(session.userId ? { user_id: session.userId } : {}) },
      timeoutMs: LIST_TIMEOUT_MS,
    });
    return Response.json({ ok: true, options: parseAdsList(reply) });
  } catch (error) {
    if (isRedirectError(error)) {
      return Response.json({ ok: false, options: [] }, { status: 401 });
    }
    console.error(`[ads-lists] ${path} failed:`, error);
    return Response.json({ ok: false, options: [] });
  }
}
