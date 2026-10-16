import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { Suspense } from "react";
import { Check, UserPlus } from "@phosphor-icons/react/ssr";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { PageLoading } from "@/components/ui/page-loading";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { ActionResult, ReadFailed, param } from "@/components/admin/admin-ui";
import { adminCan, requirePermission } from "@/lib/admin/access";
import { scanTable } from "@/lib/admin/data";
import { ADMIN_TABLES } from "@/lib/admin/tables";
import { mapNotifications } from "@/lib/admin/activity";
import { countOf } from "@/lib/format";
import { markAllNotificationsRead, markNotificationRead } from "../actions";

export const metadata: Metadata = { title: "Notifications · Admin · LeadByte" };

type Params = Promise<Record<string, string | string[] | undefined>>;

const PAGE_SIZE = 20;

export default function AdminNotificationsPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<PageLoading title="Notifications" />}>
      <NotificationsBody searchParams={searchParams} />
    </Suspense>
  );
}

async function NotificationsBody({ searchParams }: { searchParams: Params }) {
  const me = await requirePermission("notifications", "read");
  const canWrite = await adminCan(me, "notifications", "write");
  const params = await searchParams;
  const read = await scanTable(ADMIN_TABLES.adminNotifications);
  const all = mapNotifications(read.rows);
  const unread = all.filter((n) => !n.read).length;

  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const requested = Number(param(params, "page") ?? "1");
  const page = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), pages) : 1;
  const shown = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const here = page > 1 ? `/admin/notifications?page=${page}` : "/admin/notifications";

  return (
    <PageContainer width="reading">
      <PageHeader
        title="Notifications"
        description={
          <span className="inline-flex items-center gap-2">
            {countOf(all.length, "notification")}
            {unread > 0 && <Badge variant="admin-super">{unread} unread</Badge>}
          </span>
        }
        actions={
          unread > 0 && canWrite ? (
            <form action={markAllNotificationsRead}>
              <SubmitButton
                pendingLabel="Marking…"
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-surface-raised"
              >
                Mark all read
              </SubmitButton>
            </form>
          ) : undefined
        }
      />
      <ActionResult notice={param(params, "notice")} error={param(params, "error")} />
      {!read.ok && <ReadFailed what="notifications" />}

      {all.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-ink-soft">
          No notifications yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((n) => (
            <li
              key={n.notificationId}
              className={`flex items-start gap-3 rounded-lg border p-4 ${
                n.read ? "border-border bg-surface" : "border-accent/40 bg-accent-soft/40"
              }`}
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink-soft"
              >
                <UserPlus className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  {n.title}
                  {!n.read && <span className="sr-only"> (unread)</span>}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
                  <span className="font-medium text-ink [overflow-wrap:anywhere]">{n.email || "—"}</span>
                  {n.displayName && <span>({n.displayName})</span>}
                  {n.provider !== "unknown" && (
                    <Badge variant={n.provider === "google" ? "provider-google" : "provider-email"}>
                      {n.provider === "google" ? "Google" : "Email"}
                    </Badge>
                  )}
                </p>
                <p className="mt-1 text-xs text-ink-soft">{n.atLabel} IST</p>
              </div>
              {!n.read && canWrite && (
                <form action={markNotificationRead}>
                  <input type="hidden" name="notificationId" value={n.notificationId} />
                  <input type="hidden" name="back" value={here} />
                  <SubmitButton
                    pendingLabel="…"
                    className="flex min-h-9 min-w-9 items-center justify-center rounded-md border border-border bg-surface text-ink-soft hover:bg-surface-raised hover:text-ink"
                  >
                    <Check aria-hidden="true" className="size-4" />
                    <span className="sr-only">Mark as read</span>
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Notification pages" className="flex items-center justify-between text-sm">
          <span className="text-xs tabular-nums text-ink-soft">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(all.length, page * PAGE_SIZE)} of {all.length}
          </span>
          <span className="flex gap-2">
            {page > 1 && (
              <Link href={`/admin/notifications?page=${page - 1}`} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-raised">
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={`/admin/notifications?page=${page + 1}`} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-raised">
                Next
              </Link>
            )}
          </span>
        </nav>
      )}
    </PageContainer>
  );
}
