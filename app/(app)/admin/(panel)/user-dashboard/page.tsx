import type { Metadata } from "next";
import { GetForm, GetFormSubmit } from "@/components/ui/get-form";
import Link from "@/components/ui/app-link";
import { Suspense } from "react";
import { ArrowLeft, CaretRight, MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { PageLoading } from "@/components/ui/page-loading";
import { AdminPanel, ReadFailed, param } from "@/components/admin/admin-ui";
import { requirePermission } from "@/lib/admin/access";
import { loadClients } from "@/lib/admin/data";
import { getAdminRepo } from "@/lib/data/admin-repo";
import { USER_DASHBOARD_TABLES } from "@/lib/admin/tables";
import { clientSearchText, type Client } from "@/lib/admin/clients";
import { buildUserDashboard, type DashboardGroup, type UserDashboardSources } from "@/lib/admin/user-dashboard";
import { normEmail } from "@/lib/admin/fields";
import { countOf, formatCount, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "User dashboard · Admin · LeadByte" };

type Params = Promise<Record<string, string | string[] | undefined>>;

export default function UserDashboardPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<PageLoading title="User dashboard" />}>
      <UserDashboardBody searchParams={searchParams} />
    </Suspense>
  );
}

async function UserDashboardBody({ searchParams }: { searchParams: Params }) {
  await requirePermission("user_dashboard", "read");
  const params = await searchParams;
  const selected = normEmail(param(params, "user") ?? "");
  const { clients, ok } = await loadClients();

  if (selected !== "") {
    const client = clients.find((c) => c.email === selected);
    return (
      <PageContainer>
        <Link
          href="/admin/user-dashboard"
          className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-accent-ink hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to users
        </Link>
        <UserHeader email={selected} client={client} />
        <Suspense fallback={<PageLoading label={`Loading the dashboard for ${selected}`} />}>
          <UserDetail email={selected} />
        </Suspense>
      </PageContainer>
    );
  }

  // Its OWN search. The legacy screen reused the Clients tab's search box, so
  // a search typed there silently filtered this list too.
  const q = (param(params, "q") ?? "").trim();
  const needle = q.toLowerCase();
  const shown = needle ? clients.filter((c) => clientSearchText(c).toLowerCase().includes(needle)) : clients;

  return (
    <PageContainer>
      <PageHeader title="User dashboard" description="Open any account's dashboard figures." />
      {!ok && <ReadFailed what="the client list" />}

      <AdminPanel
        title="Select a user to view their dashboard"
        hint={q ? `${shown.length} of ${countOf(clients.length, "user")}` : countOf(clients.length, "user")}
      >
        <GetForm action="/admin/user-dashboard" className="mb-3 flex gap-2">
          <label htmlFor="ud-search" className="sr-only">
            Search users
          </label>
          <input
            id="ud-search"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search by company, email or name…"
            suppressHydrationWarning
            className="w-full max-w-sm rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent"
          />
          <GetFormSubmit
            aria-label="Search"
            className="min-h-10 min-w-10 rounded-md border border-border bg-surface text-ink-soft hover:bg-surface-raised hover:text-ink"
          >
            <MagnifyingGlass aria-hidden="true" className="size-4" />
          </GetFormSubmit>
        </GetForm>

        {shown.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-soft">
            {q ? "No users match your search." : "No users found."}
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shown.filter((c) => c.email !== "").map((c) => (
              <li key={c.key}>
                <Link
                  href={`/admin/user-dashboard?user=${encodeURIComponent(c.email)}`}
                  className="flex min-h-16 items-center gap-3 rounded-md border border-border bg-surface p-3 transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <Initial name={c.company || c.name || c.email} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {c.company || c.name || "Unnamed user"}
                    </span>
                    <span className="block truncate text-xs text-ink-soft">{c.email}</span>
                    <span className="block text-xs text-ink-soft">
                      {c.agents.length > 0 ? countOf(c.agents.length, "agent") : "No agents"}
                    </span>
                  </span>
                  <CaretRight aria-hidden="true" className="size-4 shrink-0 text-ink-soft" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>
    </PageContainer>
  );
}

/** A client's first letter in a circle — the old panel's avatar. */
function Initial({ name }: { name: string }) {
  const letter = (name || "?").charAt(0).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-ink"
    >
      {letter}
    </span>
  );
}

function UserHeader({ email, client }: { email: string; client?: Client }) {
  return (
    <div className="flex items-center gap-3">
      <Initial name={client?.company || client?.name || email} />
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold tracking-tight text-ink">
          {client?.company || client?.name || email}
        </h1>
        <p className="truncate text-sm text-ink-soft">{email}</p>
      </div>
    </div>
  );
}

async function UserDetail({ email }: { email: string }) {
  const repo = getAdminRepo();
  const keys = Object.keys(USER_DASHBOARD_TABLES).filter(
    // The breakdown tables are not part of this view.
    (key) => key !== "sessionPerSource" && key !== "sourceByCountry",
  ) as (keyof UserDashboardSources)[];

  const reads = await Promise.all(
    keys.map((key) => repo.userRows(USER_DASHBOARD_TABLES[key], email)),
  );
  const sources = Object.fromEntries(keys.map((key, i) => [key, reads[i]?.rows ?? []])) as unknown as UserDashboardSources;
  const failedCount = reads.filter((read) => !read.ok).length;
  const groups = buildUserDashboard(sources);

  return (
    <>
      {failedCount > 0 && (
        <ReadFailed what={`${failedCount} of this account's ${reads.length} tables`} />
      )}
      {groups.map((group) => (
        <GroupPanel key={group.id} group={group} />
      ))}
    </>
  );
}

function GroupPanel({ group }: { group: DashboardGroup }) {
  return (
    <AdminPanel title={group.title}>
      {group.empty ? (
        <p className="text-sm text-ink-soft">No {group.title.toLowerCase()} data for this account yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {group.facts.length > 0 && (
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              {group.facts.map((fact) => (
                <div key={fact.label} className="min-w-0">
                  <dt className="text-xs text-ink-soft">{fact.label}</dt>
                  <dd className="truncate text-ink">{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {group.figures.map((figure) => (
              <div key={figure.label} className="rounded-md border border-border bg-ground p-3">
                <dt className="text-xs font-medium text-ink-soft">{figure.label}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums text-ink">
                  {figure.value === null
                    ? "—"
                    : figure.kind === "money"
                      ? formatMoney(figure.value)
                      : formatCount(figure.value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </AdminPanel>
  );
}
