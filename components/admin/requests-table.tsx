"use client";

/**
 * Integration requests, with their actions.
 *
 * `"use client"` for the `DataTable` column renderers only. The actions are
 * ordinary `<form action={serverAction}>` forms — a Server Action imported
 * into a client module runs on the server exactly as it would from a page.
 */

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { SubmitButton } from "@/components/ui/submit-button";
import type { IntegrationRequest, RequestStatus } from "@/lib/admin/requests";
import { completeRequest, disconnectRequest, rejectRequest } from "@/app/(app)/admin/(panel)/actions";

const STATUS: Record<RequestStatus, { label: string; variant: BadgeVariant }> = {
  pending: { label: "Pending", variant: "request-pending" },
  completed: { label: "Completed", variant: "request-completed" },
  rejected: { label: "Rejected", variant: "request-rejected" },
};

const SMALL =
  "rounded-md px-2.5 py-1 text-xs font-medium transition active:scale-[0.98] motion-reduce:transform-none";

function Actions({ request, canWrite }: { request: IntegrationRequest; canWrite: boolean }) {
  if (request.status !== "pending") {
    return <span className="text-xs text-ink-soft">{request.status === "completed" ? "Processed" : "Closed"}</span>;
  }
  // A role that may read requests but not act on them sees the queue only;
  // the actions refuse it regardless (`requirePermission`).
  if (!canWrite) return <span className="text-xs text-ink-soft">Pending</span>;
  const noConnection = request.platform === "business-details";
  return (
    <span className="flex flex-wrap justify-end gap-1.5">
      <form action={noConnection ? completeRequest : disconnectRequest}>
        <input type="hidden" name="requestId" value={request.requestId} />
        <SubmitButton
          pendingLabel={noConnection ? "Completing…" : "Disconnecting…"}
          className={`${SMALL} bg-accent text-surface hover:bg-accent-ink`}
        >
          {noConnection ? "Complete" : "Disconnect"}
        </SubmitButton>
      </form>
      <form action={rejectRequest}>
        <input type="hidden" name="requestId" value={request.requestId} />
        <SubmitButton pendingLabel="Rejecting…" className={`${SMALL} border border-border bg-surface text-ink hover:bg-surface-raised`}>
          Reject
        </SubmitButton>
      </form>
    </span>
  );
}

const columns = (canWrite: boolean): Column<IntegrationRequest>[] => [
  { key: "email", header: "User email", cell: (r) => <span className="whitespace-nowrap">{r.email || "—"}</span>, sortValue: (r) => r.email },
  { key: "platform", header: "Platform", cell: (r) => r.platformLabel, sortValue: (r) => r.platformLabel },
  {
    key: "type",
    header: "Request",
    cell: (r) => (
      <span title={r.message || undefined}>{r.type === "disconnect" ? "Disconnect" : "Change account"}</span>
    ),
    sortValue: (r) => r.type,
  },
  { key: "status", header: "Status", cell: (r) => <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>, sortValue: (r) => r.status },
  { key: "submitted", header: "Submitted (IST)", cell: (r) => <span className="whitespace-nowrap">{r.submittedLabel}</span>, sortValue: (r) => r.submittedAt ?? 0, secondary: true },
  { key: "completed", header: "Completed (IST)", cell: (r) => <span className="whitespace-nowrap">{r.completedLabel}</span>, secondary: true },
  { key: "actions", header: "Actions", cell: (r) => <Actions request={r} canWrite={canWrite} /> },
];

export function RequestsTable({
  requests,
  filtered,
  canWrite = true,
}: {
  requests: IntegrationRequest[];
  filtered: boolean;
  /** Whether this admin's role may complete, reject or disconnect. */
  canWrite?: boolean;
}) {
  return (
    <DataTable
      rows={requests}
      columns={columns(canWrite)}
      rowKey={(r) => r.requestId}
      searchText={(r) => `${r.email} ${r.platformLabel} ${r.platform}`}
      searchPlaceholder="Search by email or platform…"
      initialSort={{ key: "submitted", direction: "desc" }}
      caption="Integration requests"
      empty={
        <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-ink-soft">
          {filtered ? "No requests match this filter." : "No integration requests yet."}
        </p>
      }
    />
  );
}
