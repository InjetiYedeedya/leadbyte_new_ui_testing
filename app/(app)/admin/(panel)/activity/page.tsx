import type { Metadata } from "next";
import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { PageLoading } from "@/components/ui/page-loading";
import { FilterPills, ReadFailed, param } from "@/components/admin/admin-ui";
import { ActivityTable } from "@/components/admin/activity-table";
import { requirePermission } from "@/lib/admin/access";
import { scanTable } from "@/lib/admin/data";
import { ADMIN_TABLES } from "@/lib/admin/tables";
import { filterActivity, mapActivity, readActivityFilter } from "@/lib/admin/activity";
import { countOf, formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Activity log · Admin · LeadByte" };

type Params = Promise<Record<string, string | string[] | undefined>>;

export default function AdminActivityPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<PageLoading title="Activity log" />}>
      <ActivityBody searchParams={searchParams} />
    </Suspense>
  );
}

/** How many entries the table receives at most. */
const SHOWN_MAX = 1000;

async function ActivityBody({ searchParams }: { searchParams: Params }) {
  await requirePermission("activity", "read");
  const params = await searchParams;
  const read = await scanTable(ADMIN_TABLES.activityLog);
  const all = mapActivity(read.rows);
  const filter = readActivityFilter(param(params, "action"));
  const matching = filterActivity(all, filter);
  // The newest rows only. Every entry was sent to the browser — 3,075 of them
  // on the live site, all serialised into one page — which is a large part
  // of what pushed the server past its limits (2026-09-29). The counts above
  // stay complete; the Login / Logout filter narrows to older entries.
  const shown = [...matching].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, SHOWN_MAX);

  return (
    <PageContainer>
      <PageHeader title="Activity log" description={`Sign-ins, sign-outs and admin changes · ${countOf(all.length, "entry", "entries")}`} />
      {!read.ok && <ReadFailed what="the activity log" />}
      <FilterPills
        label="Action"
        options={[
          { id: "all", label: "All", count: all.length },
          { id: "login", label: "Login", count: all.filter((e) => e.action === "login").length },
          { id: "logout", label: "Logout", count: all.filter((e) => e.action === "logout").length },
          { id: "admin", label: "Admin changes", count: all.filter((e) => e.action === "admin").length },
        ]}
        active={filter}
        hrefFor={(id) => (id === "all" ? "/admin/activity" : `/admin/activity?action=${id}`)}
      />
      {matching.length > shown.length && (
        <p className="text-xs text-ink-soft">
          Showing the newest {formatCount(shown.length)} of {formatCount(matching.length)} entries.
        </p>
      )}
      <ActivityTable entries={shown} filtered={filter !== "all"} />
    </PageContainer>
  );
}
