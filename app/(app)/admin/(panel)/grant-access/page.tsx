import type { Metadata } from "next";
import { GetForm, GetFormSubmit } from "@/components/ui/get-form";
import { Suspense } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { PageLoading } from "@/components/ui/page-loading";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionResult, AdminPanel, ReadFailed, param } from "@/components/admin/admin-ui";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { adminCan, requirePermission } from "@/lib/admin/access";
import { loadClients, scanTable } from "@/lib/admin/data";
import { ADMIN_TABLES } from "@/lib/admin/tables";
import { agentsFromOrders, type OrderRecord } from "@/lib/entitlements";
import { GRANTABLE_AGENTS } from "@/lib/admin/agents";
import { currentGrant } from "@/lib/admin/grant";
import { formatDate, normEmail, pick, pickString } from "@/lib/admin/fields";
import { grantAgentAccess } from "../actions";

export const metadata: Metadata = { title: "Grant agent access · Admin · LeadByte" };

type Params = Promise<Record<string, string | string[] | undefined>>;

export default function GrantAccessPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<PageLoading title="Grant agent access" />}>
      <GrantBody searchParams={searchParams} />
    </Suspense>
  );
}

const INPUT =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent";
const PRIMARY =
  "rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none";

async function GrantBody({ searchParams }: { searchParams: Params }) {
  const me = await requirePermission("grant_access", "read");
  // A role that may look but not grant sees the account's agents with the
  // controls switched off; `grantAgentAccess` refuses it regardless.
  const canWrite = await adminCan(me, "grant_access", "write");
  const params = await searchParams;
  const email = normEmail(param(params, "email") ?? "");

  return (
    <PageContainer width="reading">
      <PageHeader
        title="Grant agent access"
        description="Give a registered account access to agents without a payment — for trials, or when they paid another way."
      />
      <ActionResult notice={param(params, "notice")} error={param(params, "error")} />

      <AdminPanel title="Find the account">
        {/* A GET form: the looked-up account is part of the URL, so the page
            can be reloaded or shared mid-task. */}
        <GetForm action="/admin/grant-access" className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="grant-email" className="sr-only">
            Account email
          </label>
          <input
            id="grant-email"
            name="email"
            type="email"
            required
            defaultValue={email}
            placeholder="customer@company.com"
            autoComplete="off"
            suppressHydrationWarning
            className={INPUT}
          />
          <GetFormSubmit pendingLabel="Looking up…" className={PRIMARY}>
            <MagnifyingGlass aria-hidden="true" className="size-4" />
            Look up user
          </GetFormSubmit>
        </GetForm>
      </AdminPanel>

      {email !== "" && <Lookup email={email} canWrite={canWrite} />}
    </PageContainer>
  );
}

async function Lookup({ email, canWrite }: { email: string; canWrite: boolean }) {
  const [{ userRows, ok }, orders] = await Promise.all([loadClients(), scanTable(ADMIN_TABLES.orders)]);
  if (!ok) return <ReadFailed what="the users table" />;

  const user = userRows.find((row) => normEmail(row.email) === email);
  if (!user) {
    return (
      <p role="status" className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
        <span className="font-medium">{email}</span> hasn&apos;t registered yet. Ask them to sign up
        first, then grant access.
      </p>
    );
  }

  const granted = currentGrant(user);
  // Agents they PAID for. Pre-ticked too, because saving this form makes the
  // user record the answer: once it holds an agent list and an end date,
  // entitlements stops consulting orders, so an agent left unticked here is
  // an agent taken away — paid or not.
  const paid = agentsFromOrders(
    orders.rows.filter((order) => normEmail(pick(order, "email", "user_email")) === email) as OrderRecord[],
  );
  const ticked = new Set([...granted, ...paid]);
  const status = pickString(user, "subscription_status") || "none";
  const end = pick(user, "subscription_end_date");

  return (
    <AdminPanel
      title={email}
      hint={
        granted.length > 0
          ? `Currently ${status}${end ? ` until ${formatDate(end)}` : ""} · ${granted.length} ${granted.length === 1 ? "agent" : "agents"}`
          : "No agents granted yet"
      }
    >
      <form action={grantAgentAccess} className="flex flex-col gap-4">
        <input type="hidden" name="email" value={email} />

        {!canWrite && (
          <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-ink">
            Your role can see this account&apos;s agents but not change them.
          </p>
        )}
        <fieldset disabled={!canWrite} className="border-0 p-0">
          <legend className="mb-1 p-0 text-sm font-semibold text-ink">Agents</legend>
          <p className="mb-2 text-xs text-ink-soft">
            Saving replaces their whole agent list. Anything left unticked is removed, including
            agents marked Paid.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {GRANTABLE_AGENTS.map((agent) => (
              <label
                key={agent.id}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border border-border bg-surface px-3 text-sm text-ink transition-colors hover:bg-surface-raised has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
              >
                <input
                  type="checkbox"
                  name="agents"
                  value={agent.id}
                  defaultChecked={ticked.has(agent.id)}
                  suppressHydrationWarning
                  className="size-4 shrink-0 accent-accent"
                />
                <span className="flex-1">{agent.label}</span>
                {paid.includes(agent.id) && <span className="text-xs text-ink-soft">Paid</span>}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="grant-months" className="text-sm font-semibold text-ink">
            Access valid for
          </label>
          <select id="grant-months" name="months" defaultValue="12" disabled={!canWrite} suppressHydrationWarning className={`${INPUT} sm:max-w-48`}>
            <option value="1">1 month</option>
            <option value="12">1 year</option>
          </select>
          <p className="text-xs text-ink-soft">Counted from today. It replaces any end date already set.</p>
        </div>

        {canWrite && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <SubmitButton pendingLabel="Granting…" className={PRIMARY}>
              Grant access
            </SubmitButton>
          </div>
        )}
      </form>

      {canWrite && (granted.length > 0 || paid.length > 0) && (
        <form action={grantAgentAccess} className="mt-3 flex justify-end">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="intent" value="revoke" />
          <ConfirmSubmit
            title={`Revoke all access for ${email}?`}
            body="Every agent on their account record is removed straight away, and that can include agents they paid for. Nothing is refunded."
            confirmLabel="Revoke all access"
            pendingLabel="Revoking…"
            className="rounded-md border border-crit/40 px-4 py-2 text-sm font-medium text-crit hover:bg-crit-soft"
          >
            Revoke all access
          </ConfirmSubmit>
        </form>
      )}
    </AdminPanel>
  );
}
