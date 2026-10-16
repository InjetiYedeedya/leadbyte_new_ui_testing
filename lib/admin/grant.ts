import { ALL_AGENT_IDS, resolveAgentId } from "@/lib/entitlements";
import { normEmail, pickString, type Row } from "./fields";

/**
 * Granting agents to a customer by hand — the admin override for "they paid
 * outside Stripe" or "give them a trial".
 *
 * It writes the same fields a purchase does onto the `leadbyte_users` row, so
 * `lib/entitlements` honours a grant exactly as it honours a payment. That is
 * the only contract that matters here: a grant the rest of the app does not
 * read is a promise to the customer that the product then breaks.
 */

export type GrantDuration = 1 | 12;

export function readGrantDuration(value: unknown): GrantDuration {
  return value === "1" || value === 1 ? 1 : 12;
}

/** Only ids entitlements recognise survive, so a forged form cannot grant "admin". */
export function cleanAgentIds(values: readonly unknown[]): string[] {
  const ids = values.map(resolveAgentId).filter((id): id is string => id !== null);
  return ALL_AGENT_IDS.filter((id) => ids.includes(id));
}

/** The agents currently on a user row that the grant form knows about. */
export function currentGrant(user: Row): string[] {
  const stored = Array.isArray(user.subscribed_agents) ? user.subscribed_agents : [];
  return cleanAgentIds(stored);
}

export interface GrantWrite {
  /** The key the users table is keyed on. */
  userId: string;
  /** The whole row, updated — written back with POST, like the legacy panel. */
  row: Row;
  endDate: string | null;
}

/**
 * The updated user row for a grant, or a revoke when `agents` is empty.
 *
 * A revoke clears the agent list and leaves the dates alone rather than
 * inventing an end date: the row then reads as a subscription with nothing in
 * it, which entitlements treats as no access. Null when the row has no key —
 * writing it would create a second, orphaned user.
 */
export function buildGrantWrite(
  user: Row,
  agents: readonly string[],
  months: GrantDuration,
  grantedBy: string,
  now: Date = new Date(),
): GrantWrite | null {
  const userId = pickString(user, "user_id", "uid");
  if (userId === "") return null;

  const granting = agents.length > 0;
  const end = new Date(now);
  end.setMonth(end.getMonth() + months);
  const endDate = granting ? end.toISOString() : null;

  const row: Row = {
    ...user,
    user_id: userId,
    email: normEmail(user.email),
    subscription_status: granting
      ? "active"
      : pickString(user, "subscription_status") || "inactive",
    subscribed_agents: [...agents],
    access_granted_by: normEmail(grantedBy),
    access_granted_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  if (endDate) row.subscription_end_date = endDate;

  return { userId, row, endDate };
}
