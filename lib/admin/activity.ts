import { formatDateTime, normEmail, pick, pickString, timeOf, type Row } from "./fields";

/**
 * The Activity Log (sign-ins and sign-outs) and the admin Notifications feed.
 * Two small tables with the same shape of problem: rows keyed by an id with
 * no user index, read whole by the admin scan.
 */

/**
 * `admin` is a change made in the admin panel — an invite, a role change, a
 * permissions edit — written by `recordAdminAction` with an `admin_` action
 * and a one-line `detail` (the roles guide's audit log, in the table this
 * panel already has).
 */
export type ActivityAction = "login" | "logout" | "admin" | "other";
export type ActivityFilter = "all" | "login" | "logout" | "admin";

export interface ActivityEntry {
  id: string;
  email: string;
  action: ActivityAction;
  /** What an admin change did, in a sentence. Empty for sign-ins. */
  detail: string;
  browser: string;
  at: number | null;
  atLabel: string;
}

/**
 * The browser, from a user-agent string.
 *
 * Order matters: Edge's string contains "Chrome", and Chrome's contains
 * "Safari", so the more specific name has to be tested first.
 */
export function browserOf(userAgent: string): string {
  if (userAgent === "") return "—";
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/Chrome\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent)) return "Safari";
  return "Other";
}

function actionOf(raw: string): ActivityAction {
  const value = raw.toLowerCase();
  if (value === "login" || value === "logout") return value;
  if (value.startsWith("admin_")) return "admin";
  return "other";
}

export function mapActivity(rows: readonly Row[]): ActivityEntry[] {
  return rows
    .map((row, index) => {
      const at = pick(row, "timestamp", "created_at");
      return {
        id: pickString(row, "logId") || `row-${index}`,
        email: normEmail(row.email),
        action: actionOf(pickString(row, "action")),
        detail: pickString(row, "detail"),
        browser: browserOf(pickString(row, "userAgent", "user_agent")),
        at: timeOf(at),
        atLabel: formatDateTime(at, true),
      };
    })
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

export function readActivityFilter(value: string | undefined): ActivityFilter {
  return value === "login" || value === "logout" || value === "admin" ? value : "all";
}

export function filterActivity(entries: readonly ActivityEntry[], filter: ActivityFilter): ActivityEntry[] {
  return filter === "all" ? [...entries] : entries.filter((entry) => entry.action === filter);
}

export interface AdminNotification {
  notificationId: string;
  type: string;
  title: string;
  email: string;
  displayName: string;
  provider: "google" | "email" | "unknown";
  read: boolean;
  at: number | null;
  atLabel: string;
}

const TITLES: Readonly<Record<string, string>> = {
  new_user: "New user signed up",
};

/**
 * A notification's heading, from its type.
 *
 * The legacy feed titled EVERY row "New user signed up", whatever its type —
 * true only while `new_user` was the one type anything wrote. An unknown type
 * is shown as itself, in words, rather than borrowing that sentence.
 */
export function notificationTitle(type: string): string {
  const known = TITLES[type];
  if (known) return known;
  if (type === "") return "Notification";
  const words = type.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function mapNotifications(rows: readonly Row[]): AdminNotification[] {
  return rows
    .map((row) => {
      const type = pickString(row, "type");
      const provider = pickString(row, "provider").toLowerCase();
      const at = pick(row, "timestamp", "created_at");
      const read = row.read === true || pickString(row, "read").toLowerCase() === "true";
      return {
        notificationId: pickString(row, "notificationId"),
        type,
        title: notificationTitle(type),
        email: normEmail(row.email),
        displayName: pickString(row, "displayName", "name"),
        provider: provider === "" ? "unknown" : provider.includes("google") ? "google" : "email",
        read,
        at: timeOf(at),
        atLabel: formatDateTime(at),
      } satisfies AdminNotification;
    })
    .filter((notification) => notification.notificationId !== "")
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}
