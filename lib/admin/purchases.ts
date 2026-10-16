import { buildSubscription, type OrderRecord, type UserRecord } from "@/lib/entitlements";
import { agentLabel } from "./agents";
import { companyByEmail } from "./clients";
import { formatDate, formatDateTime, normEmail, pick, pickString, timeOf, type Row } from "./fields";

/**
 * The Purchases screen: who has paid, or been granted, for which agents.
 *
 * "Purchased" means a completed order for that email, OR an active
 * subscription with at least one agent on the user record — the second is how
 * admin grants and the backend's payment mirror both show up. The same two
 * sources `lib/entitlements` reads, for the same reason: the user record is
 * routinely missing dates for a purchase that succeeded.
 */

export type PurchaseFilter = "all" | "purchased" | "not-purchased";

export interface PurchaseRow {
  key: string;
  email: string;
  company: string;
  name: string;
  purchased: boolean;
  agents: string[];
  subscription: "active" | "expired" | "none";
  /** The end date, formatted — "" when there is none. */
  subscriptionEnd: string;
  subscriptionEndAt: number | null;
  joinedAt: number | null;
  joinedLabel: string;
}

export interface Purchases {
  rows: PurchaseRow[];
  totalUsers: number;
  purchased: number;
  notPurchased: number;
  /** Completed orders only — an abandoned checkout is not a purchase. */
  totalOrders: number;
}

function cartItems(order: Row): unknown[] {
  let items = order.cart_items;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      return [];
    }
  }
  return Array.isArray(items) ? items : [];
}

export function buildPurchases(
  users: readonly Row[],
  orders: readonly Row[],
  details: readonly Row[],
  now: Date = new Date(),
): Purchases {
  const companies = companyByEmail(details);
  const byEmail = new Map<string, Set<string>>();
  let totalOrders = 0;

  for (const order of orders) {
    if (order.status !== "completed") continue;
    totalOrders += 1;
    const email = normEmail(pick(order, "email", "user_email"));
    if (email === "") continue;
    const set = byEmail.get(email) ?? new Set<string>();
    for (const raw of cartItems(order)) {
      const item = (raw ?? {}) as Row;
      const label = agentLabel(pick(item, "id", "title"));
      if (label !== "") set.add(label);
    }
    byEmail.set(email, set);
  }

  const seen = new Set<string>();
  const rows: PurchaseRow[] = [];

  for (const user of users) {
    const email = normEmail(user.email);
    const key = email || pickString(user, "user_id", "uid");
    if (key === "" || seen.has(key)) continue;
    seen.add(key);

    const subscribed = Array.isArray(user.subscribed_agents) ? user.subscribed_agents : [];
    const stated = pickString(user, "subscription_status").toLowerCase();
    const hasOrder = email !== "" && byEmail.has(email);
    const purchased = hasOrder || (stated === "active" && subscribed.length > 0);

    const agents = new Set(byEmail.get(email) ?? []);
    for (const value of subscribed) {
      const label = agentLabel(value);
      if (label !== "") agents.add(label);
    }

    // `buildSubscription` rather than the raw status field: a stored "active"
    // whose window has closed is expired, and the legacy screen reported it as
    // active until someone noticed.
    const subscription = buildSubscription(user as UserRecord, null as OrderRecord | null, now);
    const joined = pick(user, "created_at", "createdAt");

    rows.push({
      key,
      email,
      company: pickString(user, "companyName") || companies.get(email) || "",
      name: pickString(user, "displayName", "name"),
      purchased,
      agents: [...agents].sort((a, b) => a.localeCompare(b)),
      subscription: subscription.status,
      subscriptionEnd: subscription.endDate ? formatDate(subscription.endDate) : "",
      subscriptionEndAt: timeOf(subscription.endDate),
      joinedAt: timeOf(joined),
      joinedLabel: formatDateTime(joined),
    });
  }

  rows.sort((a, b) => (b.joinedAt ?? 0) - (a.joinedAt ?? 0));
  const purchasedCount = rows.filter((row) => row.purchased).length;

  return {
    rows,
    totalUsers: rows.length,
    purchased: purchasedCount,
    notPurchased: rows.length - purchasedCount,
    totalOrders,
  };
}

export function filterPurchases(rows: readonly PurchaseRow[], filter: PurchaseFilter): PurchaseRow[] {
  if (filter === "purchased") return rows.filter((row) => row.purchased);
  if (filter === "not-purchased") return rows.filter((row) => !row.purchased);
  return [...rows];
}

export function readPurchaseFilter(value: string | undefined): PurchaseFilter {
  return value === "purchased" || value === "not-purchased" ? value : "all";
}
