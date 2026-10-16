import { resolveAgentId } from "./agents";

/**
 * Pure subscription and entitlement logic.
 *
 * PORTED from the live app's `purchaseService.js`, kept pure and `now`-injectable
 * so every rule below is testable without a network call. Nothing here fetches.
 *
 * Where entitlements actually live (confirmed from the live Lambda):
 *
 *   leadbyte_users  — subscription_status, subscription_plan, subscribed_agents[],
 *                     subscription_start_date, subscription_end_date
 *   leadbyte_orders — status, cart_items[], subscription_*_date, created_at
 *
 * The payment handler always stamps the dates on the ORDER row but only mirrors
 * them onto the user row when the webhook had a user_id — and it swallows write
 * errors. So the user record is frequently missing dates for a purchase that
 * genuinely succeeded. Every read here falls back to orders for that reason.
 */

export type SubscriptionStatus = "active" | "expired" | "none";

export interface Subscription {
  status: SubscriptionStatus;
  startDate: string | null;
  endDate: string | null;
  /** Tier name, where one was recorded. */
  plan: string | null;
  /** Which record answered — useful when support is debugging access. */
  source: "user" | "order" | null;
}

export interface UserRecord {
  subscription_status?: unknown;
  /** The order the last payment wrote onto this row. */
  last_order_id?: unknown;
  /** Stamped by Admin → Grant access; an admin decision outranks a refund. */
  access_granted_at?: unknown;
  subscription_plan?: unknown;
  subscription_start_date?: unknown;
  subscription_end_date?: unknown;
  subscribed_agents?: unknown;
}

export interface OrderRecord {
  status?: unknown;
  cart_items?: unknown;
  created_at?: unknown;
  subscription_plan?: unknown;
  billing_period?: unknown;
  subscription_start_date?: unknown;
  subscription_end_date?: unknown;
  order_id?: unknown;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function timeOf(value: unknown): number {
  const t = new Date(String(value ?? "")).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Picks the order to source subscription dates from: completed orders first,
 * then whichever has the latest end or creation date.
 */
export function pickLatestOrder(orders: OrderRecord[]): OrderRecord | null {
  if (!Array.isArray(orders) || orders.length === 0) return null;
  const completed = orders.filter((o) => o?.status === "completed");
  const pool = completed.length > 0 ? completed : orders;
  const rank = (o: OrderRecord) =>
    Math.max(timeOf(o.subscription_end_date), timeOf(o.created_at));
  return [...pool].sort((a, b) => rank(b) - rank(a))[0] ?? null;
}

/**
 * Builds the subscription summary. User record wins; the order fills gaps.
 *
 * Status is INFERRED when neither record states one but a window exists — an
 * expired window must read as `expired`, not as `none`, or the UI offers a
 * "subscribe" flow to someone who needs a "renew" one.
 */
export function buildSubscription(
  user: UserRecord | null,
  order: OrderRecord | null,
  now: Date = new Date(),
): Subscription {
  const u = user ?? {};
  const o = order ?? {};

  const startDate =
    str(u.subscription_start_date) ?? str(o.subscription_start_date) ?? str(o.created_at);
  const endDate = str(u.subscription_end_date) ?? str(o.subscription_end_date);
  const plan = str(u.subscription_plan) ?? str(o.subscription_plan) ?? str(o.billing_period);

  let status: SubscriptionStatus = "none";
  const stated = str(u.subscription_status);
  if (stated === "active" || stated === "expired") {
    status = stated;
  } else if (endDate !== null) {
    status = timeOf(endDate) > now.getTime() ? "active" : "expired";
  } else if (o.status === "completed") {
    status = "active";
  }

  // An "active" status with a window that has already closed is expired,
  // whatever the record says — stale status fields are common here.
  if (status === "active" && endDate !== null && timeOf(endDate) <= now.getTime()) {
    status = "expired";
  }

  const fromUser =
    u.subscription_start_date ?? u.subscription_end_date ?? u.subscription_status;
  const fromOrder = o.subscription_end_date ?? o.subscription_start_date ?? o.status;

  return {
    status,
    startDate,
    endDate,
    plan,
    source: fromUser ? "user" : fromOrder ? "order" : null,
  };
}

/**
 * `subscribed_agents` as a list: an array, or a JSON string holding one. Only
 * an array was read, so a list stored as JSON text granted nothing (audit,
 * 2026-09-29). Any other string is still the wrong type and grants nothing —
 * an entitlement is never guessed from loose text.
 */
function agentList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return [];
  const text = value.trim();
  if (!text.startsWith("[")) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Agent ids granted by an active subscription on the user record.
 * Returns [] unless the subscription is genuinely current.
 */
export function agentsFromUserRecord(user: UserRecord | null, now: Date = new Date()): string[] {
  if (!user) return [];
  const subscription = buildSubscription(user, null, now);
  if (subscription.status !== "active") return [];
  return agentList(user.subscribed_agents).map(resolveAgentId).filter((id): id is string => id !== null);
}

/**
 * Agent ids granted by completed orders whose own window is still open.
 *
 * Each order carries its own `subscription_end_date` (a one-month, one-time
 * payment — nothing renews), so each order is judged on its own dates. That
 * is what keeps a first purchase unlocked after a second one: the payment
 * handler REPLACES the user row's `subscribed_agents` with the latest order's
 * agents and moves one end date for all of them (PAYMENT_FLOW.md §9.3), so the
 * user row alone forgets every earlier purchase. An order with no dates at all
 * predates the stamping and cannot be judged, so it still grants.
 *
 * `cart_items` is sometimes a JSON string rather than an array in production,
 * so it is parsed defensively. An unparseable row is skipped, not thrown on —
 * one malformed order must not remove access to every other purchase.
 */
export function agentsFromOrders(orders: OrderRecord[], now: Date = new Date()): string[] {
  if (!Array.isArray(orders)) return [];
  const granted = new Set<string>();

  for (const order of orders) {
    if (order?.status !== "completed") continue;
    const end = str(order.subscription_end_date);
    if (end !== null && timeOf(end) <= now.getTime()) continue;

    let items: unknown = order.cart_items;
    if (typeof items === "string") {
      try {
        items = JSON.parse(items);
      } catch {
        continue;
      }
    }
    if (!Array.isArray(items)) continue;

    for (const raw of items) {
      const item = (raw ?? {}) as Record<string, unknown>;
      const id = resolveAgentId(item.id) ?? resolveAgentId(item.title);
      if (id !== null) granted.add(id);
    }
  }

  return [...granted];
}

/**
 * Whether the user row's agent list should be believed.
 *
 * A Stripe refund marks the ORDER `refunded` but leaves the user row active
 * (PAYMENT_FLOW.md §8), so a refunded customer kept every agent. When the
 * row's `last_order_id` names a refunded order, its list is ignored — unless
 * an admin granted access by hand, which is a later, deliberate decision.
 */
export function userRecordTrusted(user: UserRecord | null, orders: OrderRecord[]): boolean {
  if (!user) return false;
  if (str(user.access_granted_at) !== null) return true;
  const lastOrder = str(user.last_order_id);
  if (lastOrder === null) return true;
  return !orders.some((order) => order?.order_id === lastOrder && order?.status === "refunded");
}

/**
 * The keys to read this account's `leadbyte_users` row by, in order.
 *
 * The table is keyed by `user_id` (the Firebase uid), not email. Every read
 * here went by email, which matched no row — so the user record was never
 * seen, paying customers got in only through their orders, and an admin
 * grant (which writes ONLY the user row) unlocked nothing: "Granted 9
 * agents" on the admin panel, a buy button for the customer (2026-10-08).
 *
 * The uid comes from the session, and only when the session IS this account —
 * never another account's id. Email stays as the fallback for a session that
 * predates the uid cookie.
 */
export function userRecordKeys(
  email: string,
  session: { businessId: string; userId?: string } | null,
): string[] {
  const own = session !== null && session.businessId.trim().toLowerCase() === email.trim().toLowerCase();
  const uid = own ? session.userId?.trim() : undefined;
  return uid ? [uid, email] : [email];
}
