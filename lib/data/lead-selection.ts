import { cookies } from "next/headers";
import { getAdsLeads } from "@/lib/data/ads-leads";

/**
 * Which of the account's ad-captured leads should actually be qualified.
 *
 * ## Why a cookie, not component state
 *
 * Picking leads happens on its own page now (`/agents/[agentId]/leads`) —
 * 209 rows of checkboxes never fit inside the "Configure" popup or even the
 * detail-page form. That means the choice has to survive a real navigation
 * away and back, which client state cannot do; this is the exact
 * `lib/gating/gate.ts` / `lib/data/cart.ts` reasoning applied to a third
 * cookie. Scoped per business, same as those two.
 *
 * ## `null` means "never chosen", and that is NOT the same as "chose none"
 *
 * A brand-new account has no cookie at all — that must default to "use every
 * lead", the same behaviour this had before there was a picker page.
 * Someone who visits the picker and clicks "Clear" then "Use these leads" HAS
 * made a choice, and it is zero leads — `resolveLeadDatabase` has to tell
 * those two apart to know whether to fall back to the full table or refuse
 * to run with nothing selected.
 */

const SELECTION_COOKIE = "leadbyte_lead_selection";

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

/** A day: long enough to pick leads, get distracted, and come back, without a
    stale choice from weeks ago silently narrowing a much larger lead table. */
const SELECTION_MAX_AGE = 60 * 60 * 24;

/** `null` when nothing has ever been saved. Never throws — a malformed cookie
    reads the same as "never chosen" rather than as an error. */
export async function getSelectedLeadIds(businessId: string): Promise<string[] | null> {
  const store = await cookies();
  const raw = store.get(`${SELECTION_COOKIE}_${businessId}`)?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return null;
  }
}

/** Writable only from a Server Action or Route Handler, same restriction as
    every other cookie-backed module in this repo. */
export async function setSelectedLeadIds(businessId: string, ids: string[]): Promise<void> {
  const store = await cookies();
  store.set(`${SELECTION_COOKIE}_${businessId}`, JSON.stringify(ids), {
    ...COOKIE_OPTIONS,
    maxAge: SELECTION_MAX_AGE,
  });
}

/**
 * What the "Use my ads leads" summary needs, computed once so the popup and
 * the detail-page form can't disagree about it. `selected` is capped at
 * `total` and only counts ids that still exist in the table — a lead the
 * account had selected before it dropped out of `leadbyte-leads` cannot
 * count toward a total that no longer includes it.
 */
export async function adsLeadsSummary(
  businessId: string,
): Promise<{ total: number; selected: number }> {
  const [leads, saved] = await Promise.all([
    getAdsLeads(businessId),
    getSelectedLeadIds(businessId),
  ]);
  if (saved === null) return { total: leads.length, selected: leads.length };

  const knownIds = new Set(leads.map((lead) => lead.id));
  const selected = saved.filter((id) => knownIds.has(id)).length;
  return { total: leads.length, selected };
}
