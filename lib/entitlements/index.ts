import { isRedirectError } from "@/lib/auth/session-expired";
import { rowsFrom } from "@/lib/api/read-cascade";
import { cache } from "react";
import { revalidateTag } from "next/cache";
import { apiGet } from "@/lib/api/client";
import { getSession } from "@/lib/auth/session";
import { demoUnlocksAllowed, isBackendConfigured } from "@/lib/api/config";
import { ALL_AGENT_IDS } from "./agents";
import {
  agentsFromOrders,
  agentsFromUserRecord,
  buildSubscription,
  pickLatestOrder,
  type OrderRecord,
  type Subscription,
  type UserRecord,
  userRecordKeys,
  userRecordTrusted,
} from "./subscription";

export * from "./agents";
export * from "./subscription";

/**
 * What this account is entitled to use.
 *
 * The hybrid model the business owner chose is:
 *
 *     entitled = agents included in the plan tier
 *              ∪ agents purchased individually
 *              ± manual overrides
 *
 * SERVER ONLY — it reads httpOnly cookies through `lib/api/client.ts`.
 */

const USERS_TABLE = "tf96ffabb6"; // leadbyte_users
const ORDERS_TABLE = "t6b4ec5643"; // leadbyte_orders

/**
 * Agents included with each plan tier.
 *
 * ⚠️ DELIBERATELY EMPTY. Which agents come with which tier is an open business
 * decision (see docs/migration/2026-08-28-legacy-parity-inventory.md, R2). It is
 * left empty rather than guessed because a wrong guess in either direction is
 * damaging: too generous gives away paid agents, too mean locks out paying
 * customers on cutover day.
 *
 * Per-agent purchases work fully today without this. Fill it in once the mapping
 * is signed off, and every gate in the app picks it up.
 */
export const TIER_AGENTS: Record<string, string[]> = {
  // free:   [],
  // growth: [...],
  // scale:  [...],
};

/**
 * Manual access grants, by lowercased email.
 *
 * PORTED from the live app, where this list shipped **inside the browser bundle**
 * — readable by any visitor, and applied client-side. Here it stays on the
 * server and is never sent to the browser.
 *
 * These are real production grants (team accounts and support arrangements).
 * Removing them would revoke access on cutover, so they are preserved as-is.
 * They should ultimately live on the user record; see the backend note.
 */
const ACCESS_OVERRIDES: Record<string, { grantAll?: boolean; grant?: string[]; deny?: string[] }> = {
  "apps@ntimes.ai": { grantAll: true },
  "srini@ntimes.ai": { grantAll: true },
  "raja@ntimes.ai": { grantAll: true },
  "kiran@ntimes.ai": { grantAll: true },
  "analytics.logisoft@gmail.com": { grantAll: true },
  "eventbookingplus0@gmail.com": { grantAll: true },
  "logisoft.chefgaa@gmail.com": { grantAll: true },
  "tester@leadbyte.ai": { grantAll: true },
  "leads@chefgaa.com": { grant: ["lead-qualification"] },
  "saithilak456@gmail.com": { grant: ["social-media"] },
};

/** Pure, so the override rules are testable without a network call. */
export function applyOverrides(email: string, ids: string[]): string[] {
  const override = ACCESS_OVERRIDES[email.toLowerCase().trim()];
  if (!override) return ids;

  let result = override.grantAll ? [...ALL_AGENT_IDS] : [...ids];
  for (const id of override.grant ?? []) {
    if (!result.includes(id)) result.push(id);
  }
  if (override.deny) {
    result = result.filter((id) => !override.deny!.includes(id));
  }
  return result;
}

/** Combines every grant source. Pure — the fetching happens in `getEntitlements`. */
export function resolveEntitledAgents(input: {
  email: string;
  user: UserRecord | null;
  orders: OrderRecord[];
  subscription: Subscription;
  now?: Date;
}): string[] {
  const { email, user, orders, subscription, now = new Date() } = input;

  const fromTier =
    subscription.status === "active" && subscription.plan
      ? (TIER_AGENTS[subscription.plan.toLowerCase()] ?? [])
      : [];

  const merged = new Set<string>([
    ...fromTier,
    ...(userRecordTrusted(user, orders) ? agentsFromUserRecord(user, now) : []),
    ...agentsFromOrders(orders, now),
  ]);

  return applyOverrides(email, [...merged]);
}

export interface Entitlements {
  subscription: Subscription;
  /** Canonical agent ids this account may use. */
  agents: string[];
  canAccess(agentId: string): boolean;
}

/**
 * The user row from any envelope. Only an object under `data` was read, so
 * `{ Item: {…} }` or a list of one came back as no user — no subscription, and
 * every agent it grants Locked (audit, 2026-09-29).
 */
function userFrom(payload: unknown): UserRecord | null {
  return (rowsFrom<UserRecord>(payload)[0] as UserRecord | undefined) ?? null;
}

/** By user id first — the table's real key — then email; see `userRecordKeys`. */
async function fetchUserRecord(businessId: string): Promise<UserRecord | null> {
  for (const key of userRecordKeys(businessId, await getSession())) {
    try {
      const user = userFrom(
        await apiGet<{ data?: unknown }>(`/api/data/${USERS_TABLE}/${encodeURIComponent(key)}`),
      );
      if (user) return user;
    } catch (error) {
      // A dead session leaves as a redirect to sign in, not as this call's
      // own failure (audit, 2026-09-29).
      if (isRedirectError(error)) throw error;
      // One key failing must not skip the next.
      console.error(`[entitlements] user lookup failed for ${businessId}:`, error);
    }
  }
  return null;
}

/**
 * Orders are keyed inconsistently, so scan then query — the same fallback the
 * live app uses. Failing here must not lock the account out; it returns [] and
 * the user record still decides.
 */
async function fetchOrders(businessId: string): Promise<OrderRecord[]> {
  const key = encodeURIComponent(businessId);
  for (const path of [`/api/scan/${ORDERS_TABLE}/${key}`, `/api/query/${ORDERS_TABLE}/${key}`]) {
    try {
      const payload = await apiGet<{ data?: unknown }>(path);
      const rows = rowsFrom<OrderRecord>(payload);
      if (rows.length > 0) return rows;
    } catch (error) {
      // A dead session leaves as a redirect to sign in, not as this call's
      // own failure (audit, 2026-09-29).
      if (isRedirectError(error)) throw error;
      console.error(`[entitlements] ${path} failed:`, error);
    }
  }
  return [];
}

/** Tags an account's purchases, so a payment or grant marks the browser's
    router cache stale (`dropEntitlementsCache`). */
const entitlementsTag = (email: string) => `entitlements:${email.toLowerCase()}`;

/** The user row and orders for one account. */
async function readRecords(
  businessId: string,
): Promise<{ user: UserRecord | null; orders: OrderRecord[] }> {
  // Read fresh, no `unstable_cache` (2026-10-05). On Cloudflare there is no
  // shared cache (`open-next.config.ts`), so it never hit — and every refusal
  // inside it made both reads run a second time on the way out. These reads
  // can refresh an expired token, and fail open to whatever could be read.
  // `getEntitlements` is `cache()`d, so one render still reads once.
  const [user, orders] = await Promise.all([fetchUserRecord(businessId), fetchOrders(businessId)]);
  return { user, orders };
}

/**
 * Mark an account's purchases changed, so the browser's router cache re-reads
 * them. Call after anything that changes them — a confirmed payment, an admin grant or revoke. Server Action or
 * Route Handler only.
 */
export function dropEntitlementsCache(email: string): void {
  revalidateTag(entitlementsTag(email));
}

/**
 * Reads this account's entitlements.
 *
 * Memoised per render: the nav, the agent list and each gate all ask, and every
 * ask would otherwise be two backend round trips.
 *
 * With no backend configured, everything is unlocked — an unconfigured
 * environment is a working environment, the same rule as `isBackendConfigured()`
 * elsewhere. It never grants access against a live backend.
 */
export const getEntitlements = cache(async function getEntitlements(
  businessId: string,
): Promise<Entitlements> {
  // A production build with no backend grants nothing: fail closed.
  if (!isBackendConfigured() && !demoUnlocksAllowed()) {
    return {
      subscription: buildSubscription(null, null),
      agents: [],
      canAccess: () => false,
    };
  }
  if (!isBackendConfigured()) {
    return {
      subscription: {
        status: "active",
        startDate: null,
        endDate: null,
        plan: "mock",
        source: null,
      },
      agents: [...ALL_AGENT_IDS],
      canAccess: () => true,
    };
  }

  // Orders are ALWAYS read. Skipping them whenever the user row had a list
  // looked like a saving and was a lockout: each payment overwrites that list
  // with the latest order's agents only, so a customer who bought a second
  // agent lost the first (PAYMENT_FLOW.md §9.3). Orders are also the only
  // record a refund or a closed-tab payment (webhook only) ever touches.
  const { user, orders } = await readRecords(businessId);

  const subscription = buildSubscription(user, pickLatestOrder(orders));
  const agents = resolveEntitledAgents({ email: businessId, user, orders, subscription });

  return {
    subscription,
    agents,
    canAccess: (agentId: string) => agents.includes(agentId),
  };
});
