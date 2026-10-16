import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { PageLoading } from "@/components/ui/page-loading";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { CheckboxField, SelectField, TextField } from "@/components/ui/form";
import { ActionResult, param } from "@/components/admin/admin-ui";
import { requirePermission } from "@/lib/admin/access";
import { formatDateTime } from "@/lib/admin/fields";
import { billingAdminRepo } from "@/lib/data/billing-admin-repo";
import type { AdminPriceRow } from "@/lib/admin/billing-admin";
import { addPricedAgent, saveAgentPricing } from "../billing-actions";

export const metadata: Metadata = { title: "Agent pricing · Admin · LeadByte" };

type Params = Promise<Record<string, string | string[] | undefined>>;

const SAVE =
  "inline-flex min-h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-surface hover:bg-accent-ink";

/**
 * What each agent costs, per currency, with its own discount and the yearly
 * rate. What is saved here is what the Pricing page and Checkout charge.
 *
 * Plain forms, one per agent. They send every field; `buildPricingWrite`
 * decides which ones count (a "% off" discount ignores the amount boxes).
 * The row's version rides along so a save over someone else's is refused.
 */
export default function AdminPricingPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<PageLoading title="Agent pricing" />}>
      <PricingBody searchParams={searchParams} />
    </Suspense>
  );
}

async function PricingBody({ searchParams }: { searchParams: Params }) {
  await requirePermission("pricing", "read");
  const params = await searchParams;
  const historyFor = param(params, "history");
  const [read, history] = await Promise.all([
    billingAdminRepo.pricing(),
    historyFor ? billingAdminRepo.history(historyFor) : Promise.resolve(null),
  ]);

  return (
    <PageContainer width="reading">
      <PageHeader
        title="Agent pricing"
        description="Monthly prices in ₹ and $, each agent's discount, and the yearly rate. Changes show on the Pricing page straight away; autopay customers pay a new price from their next month."
      />
      <ActionResult notice={param(params, "notice")} error={param(params, "error")} />

      {!read.ok && (
        <p role="status" className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          {read.notDeployed
            ? "The pricing table isn't on the backend yet. Once it is, every agent and its prices appear here. Until then the Pricing page shows the standard price list."
            : "We couldn't load the pricing table. Try again in a moment."}
        </p>
      )}

      {history && historyFor && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-ink">Price history: {historyFor}</h2>
            <Link href="/admin/pricing" className="text-sm font-medium text-accent-ink hover:underline">
              Close
            </Link>
          </div>
          {!history.ok ? (
            <p className="mt-2 text-sm text-ink-soft">The history could not be loaded.</p>
          ) : history.rows.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">No changes recorded yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border text-sm">
              {history.rows.map((change, index) => (
                <li key={`${change.at}-${index}`} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="text-ink-soft">
                    {change.at ? formatDateTime(change.at) : "—"} · {change.by || "unknown"}
                  </span>
                  <span className="tabular-nums text-ink">
                    ₹ {change.inr.from ?? "—"} → {change.inr.to ?? "—"} · $ {change.usd.from ?? "—"} → {change.usd.to ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {read.ok && read.rows.length === 0 && (
        <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-ink-soft">
          No agents in the pricing table yet. Add the first one below.
        </p>
      )}

      {read.ok && (
        <ul className="flex flex-col gap-4">
          {read.rows.map((row) => (
            <li key={`${row.id}-${row.version}`}>
              <PriceCard row={row} />
            </li>
          ))}
        </ul>
      )}

      {read.ok && (
        <form action={addPricedAgent} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <h2 className="text-base font-bold text-ink">Add an agent</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField name="agentId" id="new-agent-id" label="Agent id" required placeholder="blog-posting" hint="Lower-case, with dashes. It cannot be changed later." />
            <TextField name="title" id="new-agent-title" label="Title" required placeholder="Blog Posting Agent" />
          </div>
          <p className="text-xs text-ink-soft">It starts switched off, so nobody can buy it until it has prices.</p>
          <div>
            <SubmitButton pendingLabel="Adding…" className={SAVE}>
              Add agent
            </SubmitButton>
          </div>
        </form>
      )}
    </PageContainer>
  );
}

function PriceCard({ row }: { row: AdminPriceRow }) {
  const id = (field: string) => `${row.id}-${field}`;
  return (
    <form action={saveAgentPricing} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <input type="hidden" name="agentId" value={row.id} />
      <input type="hidden" name="version" value={row.version} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-base font-bold text-ink">
            {row.title}
            <Badge variant={row.active ? "issue-cleared" : "issue-open"}>{row.active ? "On sale" : "Off"}</Badge>
          </h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            {row.id} · version {row.version}
            {row.updatedBy !== "" && ` · last saved by ${row.updatedBy}`}
          </p>
        </div>
        <Link href={`/admin/pricing?history=${encodeURIComponent(row.id)}`} className="text-sm font-medium text-accent-ink hover:underline">
          Price history
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <TextField name="inr" id={id("inr")} type="number" label="₹ per month" defaultValue={row.inr?.toString() ?? ""} placeholder="Not sold" hint="Empty = not sold in INR." />
        <TextField name="usd" id={id("usd")} type="number" label="$ per month" defaultValue={row.usd?.toString() ?? ""} placeholder="Not sold" hint="Empty = not sold in USD." />
        <TextField name="yearlyPercent" id={id("yearly")} type="number" label="Yearly discount %" defaultValue={String(row.yearlyPercent)} hint="Off the monthly price, when paid yearly." />
      </div>

      <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-semibold text-ink">Discount</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField
            name="discountKind"
            id={id("kind")}
            label="Type"
            defaultValue={row.discountKind}
            options={[
              { value: "none", label: "No discount" },
              { value: "percent", label: "% off" },
              { value: "fixed", label: "Amount off" },
            ]}
          />
          <TextField name="discountPercent" id={id("pct")} type="number" label="% off" defaultValue={row.discountPercent?.toString() ?? ""} hint="For % off: 1 to 90." />
          <TextField name="discountLabel" id={id("label")} label="Label" defaultValue={row.discountLabel} placeholder="Diwali offer" maxLength={60} hint="Shown beside the price." />
          <TextField name="discountInr" id={id("offinr")} type="number" label="₹ off" defaultValue={row.discountInr?.toString() ?? ""} hint="For amount off." />
          <TextField name="discountUsd" id={id("offusd")} type="number" label="$ off" defaultValue={row.discountUsd?.toString() ?? ""} hint="For amount off." />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={id("ends")} className="text-xs font-medium text-ink-soft">
              Ends on
            </label>
            <input
              id={id("ends")}
              name="discountEnds"
              type="date"
              defaultValue={row.discountEnds}
              className="w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:outline-none"
            />
            <p className="text-xs text-ink-soft">Empty = no end date.</p>
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <CheckboxField name="active" id={id("active")} label="On sale" description="Shown on the Pricing page and can be bought." defaultChecked={row.active} />
        <SubmitButton pendingLabel="Saving…" className={SAVE}>
          Save {row.title}
        </SubmitButton>
      </div>
    </form>
  );
}
