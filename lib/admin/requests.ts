import { formatDateTime, normEmail, pick, pickString, timeOf, type Row } from "./fields";
import { FRONTEND_CHECK_TABLES } from "./tables";

/**
 * Integration requests: a customer asking for a platform to be disconnected
 * or switched to another account. The customer cannot do this themselves yet
 * (BACKEND.md A2), so an admin does it from here.
 */

export type RequestStatus = "pending" | "completed" | "rejected";
export type RequestStatusFilter = "all" | RequestStatus;

const PLATFORM_LABELS: Readonly<Record<string, string>> = {
  "google-ads": "Google Ads",
  "meta-ads": "Meta Ads",
  "linkedin-ads": "LinkedIn Ads",
  "google-analytics": "Google Analytics",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  linkedin: "LinkedIn Social",
  email: "Email (Gmail)",
  "business-details": "Business details",
};

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? (platform || "Unknown");
}

/**
 * The table whose row "disconnect" deletes. Null for business details, which
 * has no connection to remove — completing that request is just a status.
 */
export function frontendCheckTable(platform: string): string | null {
  return FRONTEND_CHECK_TABLES[platform] ?? null;
}

export interface IntegrationRequest {
  requestId: string;
  email: string;
  platform: string;
  platformLabel: string;
  type: "disconnect" | "change";
  status: RequestStatus;
  message: string;
  submittedAt: number | null;
  submittedLabel: string;
  completedLabel: string;
}

function statusOf(raw: string): RequestStatus {
  const value = raw.toLowerCase();
  if (value === "completed" || value === "rejected") return value;
  return "pending";
}

export function mapRequests(rows: readonly Row[]): IntegrationRequest[] {
  return rows
    .map((row) => {
      const platform = pickString(row, "platform");
      const submitted = pick(row, "createdAt", "created_at");
      return {
        requestId: pickString(row, "requestId"),
        email: normEmail(row.email),
        platform,
        platformLabel: platformLabel(platform),
        type: pickString(row, "requestType").toLowerCase() === "disconnect" ? "disconnect" : "change",
        status: statusOf(pickString(row, "status")),
        message: pickString(row, "message"),
        submittedAt: timeOf(submitted),
        submittedLabel: formatDateTime(submitted),
        completedLabel: formatDateTime(pick(row, "completedAt", "completed_at")),
      } satisfies IntegrationRequest;
    })
    // A request with no id cannot be acted on, and would collide as a row key.
    .filter((request) => request.requestId !== "")
    .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
}

export function readRequestStatusFilter(value: string | undefined): RequestStatusFilter {
  return value === "pending" || value === "completed" || value === "rejected" ? value : "all";
}

export function filterRequests(
  requests: readonly IntegrationRequest[],
  status: RequestStatusFilter,
): IntegrationRequest[] {
  return status === "all" ? [...requests] : requests.filter((request) => request.status === status);
}
