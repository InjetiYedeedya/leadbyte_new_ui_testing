import { cookies } from "next/headers";
import type { SummaryRow } from "@/lib/data/launch-summary";

/**
 * The just-launched campaign's summary, carried from `launchCampaign` to the
 * agent page's "We are creating your campaign" dialog.
 *
 * The plan it is built from is cleared at launch, so it has to be written
 * before that and travel with the redirect. A cookie, not the URL: a campaign
 * name in a query string ends up in history and logs. Short-lived — it only
 * has to survive one redirect — and `leadbyte_`-prefixed, so signing out
 * sweeps it with everything else.
 */

const COOKIE = "leadbyte_launch_summary";
const MAX_AGE = 10 * 60;

/** Cookies are writable only from a Server Action — `launchCampaign`. */
export async function rememberLaunchSummary(agentId: string, rows: SummaryRow[]): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, JSON.stringify({ agentId, rows }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** This agent's summary, or [] — never another agent's, never a throw. */
export async function readLaunchSummary(agentId: string): Promise<SummaryRow[]> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { agentId?: unknown; rows?: unknown };
    if (parsed.agentId !== agentId || !Array.isArray(parsed.rows)) return [];
    return parsed.rows.filter(
      (row): row is SummaryRow =>
        Array.isArray(row) && row.length === 2 && typeof row[0] === "string" && typeof row[1] === "string",
    );
  } catch {
    return [];
  }
}
