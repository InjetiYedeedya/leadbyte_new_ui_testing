import type { Metadata } from "next";
import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { PageLoading } from "@/components/ui/page-loading";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { ActionResult, FilterPills, ReadFailed, param } from "@/components/admin/admin-ui";
import { RequestsTable } from "@/components/admin/requests-table";
import { adminCan, requirePermission } from "@/lib/admin/access";
import { scanTable } from "@/lib/admin/data";
import { ADMIN_TABLES } from "@/lib/admin/tables";
import { filterRequests, mapRequests, readRequestStatusFilter } from "@/lib/admin/requests";
import { completeRequest } from "../actions";

export const metadata: Metadata = { title: "Requests · Admin · LeadByte" };

type Params = Promise<Record<string, string | string[] | undefined>>;

export default function AdminRequestsPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<PageLoading title="Requests" />}>
      <RequestsBody searchParams={searchParams} />
    </Suspense>
  );
}

async function RequestsBody({ searchParams }: { searchParams: Params }) {
  const me = await requirePermission("requests", "read");
  const canWrite = await adminCan(me, "requests", "write");
  const params = await searchParams;
  const read = await scanTable(ADMIN_TABLES.integrationRequests);
  const all = mapRequests(read.rows);
  const status = readRequestStatusFilter(param(params, "status"));
  const shown = filterRequests(all, status);
  const pending = all.filter((request) => request.status === "pending").length;

  // Set by `disconnectRequest` when the connection could not be removed.
  const confirmId = param(params, "confirm");
  const confirming = confirmId ? all.find((request) => request.requestId === confirmId) : undefined;

  return (
    <PageContainer>
      <PageHeader
        title="Requests"
        description={
          <span className="inline-flex items-center gap-2">
            Integration requests from customers
            {pending > 0 && <Badge variant="request-pending">{pending} pending</Badge>}
          </span>
        }
      />
      <ActionResult notice={param(params, "notice")} error={param(params, "error")} />

      {confirming && confirming.status === "pending" && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          <span>
            {confirming.platformLabel} for {confirming.email} may still be connected. Mark the request
            completed anyway?
          </span>
          <form action={completeRequest}>
            <input type="hidden" name="requestId" value={confirming.requestId} />
            <SubmitButton pendingLabel="Completing…" className="rounded-md border border-warn/40 bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-raised">
              Mark completed anyway
            </SubmitButton>
          </form>
        </div>
      )}

      {!read.ok && <ReadFailed what="integration requests" />}

      <FilterPills
        label="Status"
        options={[
          { id: "all", label: "All", count: all.length },
          { id: "pending", label: "Pending", count: pending },
          { id: "completed", label: "Completed", count: all.filter((r) => r.status === "completed").length },
          { id: "rejected", label: "Rejected", count: all.filter((r) => r.status === "rejected").length },
        ]}
        active={status}
        hrefFor={(id) => (id === "all" ? "/admin/requests" : `/admin/requests?status=${id}`)}
      />

      <RequestsTable requests={shown} filtered={status !== "all"} canWrite={canWrite} />
    </PageContainer>
  );
}
