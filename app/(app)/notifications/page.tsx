import { notFound } from "next/navigation";
import { isBackendConfigured } from "@/lib/api/config";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { PageLoading } from "@/components/ui/page-loading";
import Link from "@/components/ui/app-link";
import { PageShell, currentBusinessId } from "@/components/page-shell";
import { getNotificationsRepo } from "@/lib/data/notifications-repo";
import { markAllRead } from "./actions";
import { PageContainer, PageHeader } from "@/components/ui/page-container";

export const metadata: Metadata = { title: "Inbox · LeadByte" };

async function NotificationsPageBody() {
  const businessId = await currentBusinessId();
  const items = await getNotificationsRepo().list(businessId);
  const unread = items.filter((i) => !i.read).length;

  return (
    <>
      <PageContainer>
        <PageHeader
          title="Inbox"
          description={`${unread} unread`}
          actions={
            unread > 0 ? (
              <form action={markAllRead}>
                <SubmitButton pendingLabel="Marking…" className="text-sm text-accent-ink">
                  Mark all read
                </SubmitButton>
              </form>
            ) : undefined
          }
        />

        {items.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-4 text-sm text-ink-soft">
            {/* Was "nothing needs your attention right now" — an app-wide
                claim made by the notifications list, which contradicted the
                Agents tab badge on the same account. It can only speak for
                itself. */}
            No notifications yet.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={
                  item.read
                    ? "block rounded-lg border border-border bg-surface p-4"
                    : "block rounded-md border border-accent bg-surface-raised p-4"
                }
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    {item.agentName} agent
                  </span>
                  <span className="text-xs text-ink-soft">{item.time}</span>
                </div>
                <div className="font-medium text-ink">{item.title}</div>
                <div className="text-sm text-ink-soft">{item.detail}</div>
              </Link>
            ))}
          </div>
        )}
      </PageContainer>
    </>
  );
}

/**
 * The page's own reads sit behind a boundary so the frame does not wait on
 * them. Without it the whole screen — header, tabs, rail — was held back until
 * the slowest backend read landed, and a click showed the previous page for
 * the entire wait. See the note on `PageShell`; this is NOT a route-level
 * `loading.tsx` (rule 0).
 */
export default function NotificationsPage() {
  // No backend stores these yet, so on a live site this screen could only
  // show nothing or demo content. Hidden until it has a real source.
  if (isBackendConfigured()) notFound();
  return (
    <PageShell activeTab="/notifications" currentStageId="agents">
      <Suspense fallback={<PageLoading title="Inbox" />}>
        <NotificationsPageBody />
      </Suspense>
    </PageShell>
  );
}
