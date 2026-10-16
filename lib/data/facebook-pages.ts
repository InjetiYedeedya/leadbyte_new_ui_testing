import { apiRequest } from "@/lib/api/client";
import { refusalOf } from "@/lib/api/refusal";
import { isRedirectError } from "@/lib/auth/session-expired";

/**
 * Telling the backend WHICH Facebook page to post as (2026-10-01).
 *
 * Facebook consent grants a login; posting needs one of its pages and that
 * page's own access token. The legacy app finished the connection in two
 * calls after consent (`Integrations.jsx` `fetchFacebookAccounts` /
 * `handleFacebookSubmit`):
 *
 *   GET  /api/webhook/facebook-accounts?email=     the pages, each with its token
 *   POST /api/webhook/facebook-selected-account    { id, name, category,
 *                                                    access_token, email, userId }
 *
 * This app never made the second call, so the backend had no page and no page
 * token: its status read Facebook as not connected even after the customer
 * picked a page, and n8n had nothing to post with.
 *
 * Server-only, and the token never leaves it: it is read here and sent on
 * here — never into a cookie, a prop, a log line or a return value.
 */

export interface FacebookPage {
  id: string;
  name: string;
  category: string;
}

interface PageWithToken extends FacebookPage {
  accessToken: string;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

/**
 * The pages in any of the three shapes the webhook has answered with:
 * `[{ user, pages: [...] }]`, a flat `[{ id, name }]`, or `{ pages: [...] }`.
 * A page with no id is dropped — it cannot be chosen. Pure, so it is tested;
 * it keeps the token because `saveFacebookPage` needs it, which is why it is
 * not exported beyond this module's tests.
 */
export function parsePagesWithTokens(payload: unknown): PageWithToken[] {
  let raw: unknown[] = [];
  if (Array.isArray(payload)) {
    const first = record(payload[0]);
    raw = Array.isArray(first.pages) ? first.pages : payload;
  } else if (Array.isArray(record(payload).pages)) {
    raw = record(payload).pages as unknown[];
  }
  return raw
    .map((item) => {
      const row = record(item);
      return {
        id: text(row.id) || text(row.pageId),
        name: text(row.name) || text(row.pageName),
        category: text(row.category),
        accessToken: text(row.access_token),
      };
    })
    .filter((page) => page.id !== "");
}

async function pagesWithTokens(email: string): Promise<PageWithToken[]> {
  const payload = await apiRequest<unknown>(
    `/api/webhook/facebook-accounts?${new URLSearchParams({ email })}`,
  );
  return parsePagesWithTokens(payload);
}

/** The account's Facebook pages, without their tokens. Never throws. */
export async function fetchFacebookPages(email: string): Promise<FacebookPage[]> {
  try {
    return (await pagesWithTokens(email)).map(({ id, name, category }) => ({ id, name, category }));
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[facebook-pages] could not list pages:", error instanceof Error ? error.message : error);
    return [];
  }
}

/** Why a save failed, safe to show: anything token-shaped is cut out first. */
function shownReason(text: string): string {
  return text
    .replace(/EAA[A-Za-z0-9]{20,}/g, "[hidden]")
    .replace(/[A-Za-z0-9_\-]{40,}/g, "[hidden]")
    .trim()
    .slice(0, 200);
}

export type FacebookPageSave = { saved: true } | { saved: false; reason: string };

/**
 * The page list, for its token and category, when the backend can give it.
 * `null` when it cannot: the list route (n8n `facebook-outh`) answered
 * `500 Error in workflow` on 2026-10-12 even when called exactly as the
 * legacy app did, and the save must not depend on it.
 */
async function pagesIfAvailable(email: string): Promise<PageWithToken[] | null> {
  try {
    return await pagesWithTokens(email);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.warn(
      "[facebook-pages] page list unavailable, saving the choice without it:",
      shownReason(error instanceof Error ? error.message : ""),
    );
    return null;
  }
}

/**
 * Saves the chosen page with the backend: `POST
 * /api/webhook/facebook-selected-account`, which the Lambda hands to n8n's
 * `fb_selected_account`. Never throws: returns `saved: false` with the reason,
 * so the caller can say the setup is unfinished — and why — rather than
 * claiming a connection that cannot post.
 *
 * The token and category come from the page list when it answers; when it
 * does not, the choice is still sent (with an empty token, as the legacy app
 * sent for a page that had none) rather than stopping before
 * `fb_selected_account` is ever reached.
 */
export async function saveFacebookPage(
  email: string,
  userId: string | undefined,
  chosen: { id: string; name: string },
): Promise<FacebookPageSave> {
  const pages = await pagesIfAvailable(email);
  const listed = pages?.find((candidate) => candidate.id === chosen.id);
  // A list that answered with pages, none of them this one: the id did not
  // come from this login, so it is not sent.
  if (pages !== null && pages.length > 0 && !listed) {
    console.warn(`[facebook-pages] page ${chosen.id} is not among this login's ${pages.length} page(s) — not saved`);
    return { saved: false, reason: "The page you chose isn't in the list Facebook gave us for this login." };
  }

  try {
    const reply = await apiRequest<unknown>("/api/webhook/facebook-selected-account", {
      method: "POST",
      body: {
        id: chosen.id,
        name: listed?.name || chosen.name,
        category: listed?.category ?? "",
        access_token: listed?.accessToken ?? "",
        email,
        userId: userId ?? "",
      },
    });
    // The Lambda answers a failed hand-off to n8n with a 200 carrying
    // `{ success: false }`, so a reply that did not throw is not yet a save.
    const refusal = refusalOf(reply);
    if (refusal !== null) throw new Error(refusal);
    return { saved: true };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    // The message only: an error from this call could echo the body back.
    const message = `${shownReason(error instanceof Error ? error.message : "") || "The backend refused it"} (while saving the page you chose).`;
    console.error("[facebook-pages] could not save the chosen page:", message);
    return { saved: false, reason: message };
  }
}
