import { formatDateTime, pick, pickString, timeOf, truthy, type Row } from "./fields";

/**
 * The Errors board: workflow failures n8n writes to LeadByteErrorNotifications.
 *
 * The documented schema is `errorId, timestamp, agentType, errorMessage,
 * priority, workflowName`, but older rows use other spellings for every one of
 * those, so each field reads a fall-back list — the same lists the legacy
 * panel used.
 */

export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface AdminError {
  /** Row identity for the board. The stored errorId when there is one. */
  id: string;
  /** The stored key, or "" when the row has none — such a row cannot be cleared. */
  errorId: string;
  severity: Severity;
  category: string;
  summary: string;
  workflow: string;
  cleared: boolean;
  at: number | null;
  atLabel: string;
}

function severityOf(raw: string): Severity {
  const value = raw.toUpperCase();
  if (value.includes("CRIT")) return "CRITICAL";
  if (value.includes("HIGH")) return "HIGH";
  if (value.includes("MED")) return "MEDIUM";
  return "LOW";
}

const CLEARED_STATUSES = new Set(["cleared", "resolved", "done", "closed"]);

export function normalizeError(row: Row, index: number): AdminError {
  const errorId = pickString(row, "errorId", "id", "error_id", "notificationId");
  const status = pickString(row, "status", "state").toLowerCase();
  const date = pick(row, "timestamp", "created_at", "createdAt", "date", "time");

  return {
    // An index fallback rather than the legacy `Math.random()`, which gave the
    // same row a different key on every render.
    id: errorId || `row-${index}`,
    errorId,
    severity: severityOf(pickString(row, "priority", "severity", "level", "urgency")),
    category: pickString(row, "agentType", "category", "type", "error_type", "errorType") || "Unknown",
    summary:
      pickString(row, "errorMessage", "error_message", "summary", "description", "message", "detail") ||
      "No description provided",
    workflow: pickString(row, "workflowName", "workflow_name", "workflow"),
    cleared:
      truthy(pick(row, "cleared", "resolved", "is_cleared", "alerted")) ||
      CLEARED_STATUSES.has(status),
    at: timeOf(date),
    atLabel: formatDateTime(date),
  };
}

export function normalizeErrors(rows: readonly Row[]): AdminError[] {
  return rows
    .map((row, index) => normalizeError(row, index))
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

export interface ErrorFilters {
  q: string;
  /** yyyy-mm-dd, inclusive. */
  from: string;
  to: string;
  status: "all" | "open" | "cleared";
  category: string;
}

export function readErrorFilters(params: Record<string, string | string[] | undefined>): ErrorFilters {
  const one = (key: string): string => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  };
  const status = one("status");
  const isDay = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "");
  return {
    q: one("q"),
    from: isDay(one("from")),
    to: isDay(one("to")),
    status: status === "open" || status === "cleared" ? status : "all",
    category: one("category") || "all",
  };
}

/**
 * Applies the board's filters.
 *
 * A row with no readable date is KEPT under a date filter, as the legacy panel
 * did: dropping it would hide exactly the malformed rows someone is most
 * likely to be hunting for.
 */
export function filterErrors(errors: readonly AdminError[], filters: ErrorFilters): AdminError[] {
  const needle = filters.q.toLowerCase();
  const from = filters.from ? timeOf(`${filters.from}T00:00:00`) : null;
  const to = filters.to ? timeOf(`${filters.to}T23:59:59.999`) : null;

  return errors.filter((error) => {
    if (needle) {
      const haystack = `${error.errorId} ${error.category} ${error.workflow} ${error.summary}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (filters.status === "open" && error.cleared) return false;
    if (filters.status === "cleared" && !error.cleared) return false;
    if (filters.category !== "all" && error.category !== filters.category) return false;
    if (error.at !== null) {
      if (from !== null && error.at < from) return false;
      if (to !== null && error.at > to) return false;
    }
    return true;
  });
}

export function groupBySeverity(errors: readonly AdminError[]): Record<Severity, AdminError[]> {
  const groups: Record<Severity, AdminError[]> = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [] };
  for (const error of errors) groups[error.severity].push(error);
  return groups;
}

/** Counted over what the filters left, the same as the legacy board. */
export function errorStats(errors: readonly AdminError[]) {
  const groups = groupBySeverity(errors);
  return {
    total: errors.length,
    pending: errors.filter((error) => !error.cleared).length,
    highOrCritical: groups.CRITICAL.length + groups.HIGH.length,
    medium: groups.MEDIUM.length,
  };
}

export function errorCategories(errors: readonly AdminError[]): string[] {
  return [...new Set(errors.map((error) => error.category))].sort((a, b) => a.localeCompare(b));
}
