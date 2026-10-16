import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { PageLoading } from "@/components/ui/page-loading";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { ActionResult, param } from "@/components/admin/admin-ui";
import { requirePermission } from "@/lib/admin/access";
import { formatDate, formatDateTime } from "@/lib/admin/fields";
import { billingAdminRepo } from "@/lib/data/billing-admin-repo";
import { couponAudience, couponSummary, type AdminCoupon } from "@/lib/admin/billing-admin";
import { saveCoupon, toggleCoupon } from "../billing-actions";

export const metadata: Metadata = { title: "Coupons · Admin · LeadByte" };

type Params = Promise<Record<string, string | string[] | undefined>>;

const PRIMARY =
  "inline-flex min-h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-surface hover:bg-accent-ink";
const QUIET =
  "inline-flex min-h-9 items-center justify-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-raised";

/**
 * Coupons: % or amount off, for everyone or for named emails, limited by
 * agent, currency, one-time or autopay, dates and use counts. Customers only
 * ever see a coupon on the final step of paying.
 *
 * `?edit=CODE` opens a coupon in the form; `?usage=CODE` shows who used it.
 */
export default function AdminCouponsPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<PageLoading title="Coupons" />}>
      <CouponsBody searchParams={searchParams} />
    </Suspense>
  );
}

async function CouponsBody({ searchParams }: { searchParams: Params }) {
  await requirePermission("coupons", "read");
  const params = await searchParams;
  const editCode = param(params, "edit")?.toUpperCase();
  const usageCode = param(params, "usage")?.toUpperCase();

  const [read, usage] = await Promise.all([
    billingAdminRepo.coupons(),
    usageCode ? billingAdminRepo.redemptions(usageCode) : Promise.resolve(null),
  ]);
  const editing = read.ok && editCode ? read.rows.find((coupon) => coupon.code === editCode) : undefined;

  return (
    <PageContainer width="reading">
      <PageHeader
        title="Coupons"
        description="Discount codes for checkout and autopay. On autopay a coupon applies to the first month only."
      />
      <ActionResult notice={param(params, "notice")} error={param(params, "error")} />

      {!read.ok && (
        <p role="status" className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          {read.notDeployed
            ? "Coupons aren't on the backend yet. Once they are, you can create and manage them here."
            : "We couldn't load the coupons. Try again in a moment."}
        </p>
      )}

      {read.ok && <CouponForm key={editing?.code ?? "new"} coupon={editing} />}

      {usage && usageCode && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-ink">
              {usageCode}: used {usage.ok ? usage.rows.length : "?"} {usage.ok && usage.rows.length === 1 ? "time" : "times"}
            </h2>
            <Link href="/admin/coupons" className="text-sm font-medium text-accent-ink hover:underline">
              Close
            </Link>
          </div>
          {!usage.ok ? (
            <p className="mt-2 text-sm text-ink-soft">Usage could not be loaded.</p>
          ) : usage.rows.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">Nobody has used it yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border text-sm">
              {usage.rows.map((row, index) => (
                <li key={`${row.who}-${row.at}-${index}`} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="text-ink">
                    {row.who || "unknown"} <span className="text-ink-soft">· {row.flow}</span>
                  </span>
                  <span className="tabular-nums text-ink-soft">
                    {row.at ? formatDateTime(row.at) : "—"} · saved {row.currency} {row.saved ?? "—"} · paid {row.paid ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {read.ok && (
        <section className="overflow-x-auto rounded-lg border border-border scroll-x-hint">
          {read.rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-soft">No coupons yet.</p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-surface-raised text-left text-xs text-ink-soft">
                  {["Code", "Discount", "Who", "Used", "Ends", "Status", ""].map((heading, index) => (
                    <th key={index} scope="col" className="px-4 py-2.5 font-medium">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {read.rows.map((coupon) => (
                  <tr key={coupon.code} className="border-t border-border align-top">
                    <td className="px-4 py-3">
                      <span className="font-semibold text-ink">{coupon.code}</span>
                      {coupon.description !== "" && <span className="block text-xs text-ink-soft">{coupon.description}</span>}
                    </td>
                    <td className="px-4 py-3 text-ink">{couponSummary(coupon)}</td>
                    <td className="px-4 py-3 text-ink-soft">{couponAudience(coupon)}</td>
                    <td className="px-4 py-3 tabular-nums text-ink">
                      {coupon.redemptions}
                      {coupon.maxRedemptions !== null && ` / ${coupon.maxRedemptions}`}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{coupon.endsAt ? formatDate(coupon.endsAt) : "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={coupon.active ? "issue-cleared" : "issue-open"}>{coupon.active ? "On" : "Off"}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link href={`/admin/coupons?edit=${encodeURIComponent(coupon.code)}`} className={QUIET}>
                          Edit
                        </Link>
                        <form action={toggleCoupon}>
                          <input type="hidden" name="code" value={coupon.code} />
                          <input type="hidden" name="version" value={coupon.version} />
                          <input type="hidden" name="active" value={coupon.active ? "false" : "true"} />
                          <SubmitButton pendingLabel="…" className={QUIET}>
                            {coupon.active ? "Switch off" : "Switch on"}
                          </SubmitButton>
                        </form>
                        <Link href={`/admin/coupons?usage=${encodeURIComponent(coupon.code)}`} className={QUIET}>
                          Usage
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </PageContainer>
  );
}

function CouponForm({ coupon }: { coupon?: AdminCoupon }) {
  const everyCurrency = !coupon || coupon.currencies.length === 0;
  const date = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
  return (
    <form action={saveCoupon} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-ink">{coupon ? `Edit ${coupon.code}` : "Create a coupon"}</h2>
        {coupon && (
          <Link href="/admin/coupons" className="text-sm font-medium text-accent-ink hover:underline">
            Cancel
          </Link>
        )}
      </div>
      {coupon && <input type="hidden" name="version" value={coupon.version} />}
      {/* A code is the coupon's identity: it is fixed once created. */}
      {coupon && <input type="hidden" name="code" value={coupon.code} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name={coupon ? "code-shown" : "code"} id="coupon-code" label="Code" required={!coupon} readOnly={Boolean(coupon)} defaultValue={coupon?.code ?? ""} placeholder="DIWALI20" hint="Letters, digits, dashes. Fixed once created." />
        <TextField name="description" id="coupon-description" label="Description" defaultValue={coupon?.description ?? ""} placeholder="Festive offer" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField
          name="kind"
          id="coupon-kind"
          label="Type"
          defaultValue={coupon?.kind ?? "percent"}
          options={[
            { value: "percent", label: "% off" },
            { value: "fixed", label: "Amount off" },
          ]}
        />
        <TextField name="percent" id="coupon-percent" type="number" label="% off" defaultValue={coupon?.percent?.toString() ?? "10"} hint="For % off: 1 to 90." />
        <div className="grid grid-cols-2 gap-3">
          <TextField name="offInr" id="coupon-inr" type="number" label="₹ off" defaultValue={coupon?.offInr?.toString() ?? ""} />
          <TextField name="offUsd" id="coupon-usd" type="number" label="$ off" defaultValue={coupon?.offUsd?.toString() ?? ""} />
        </div>
      </div>

      <TextAreaField
        name="emails"
        id="coupon-emails"
        rows={3}
        label="Only these emails"
        defaultValue={coupon?.emails.join("\n") ?? ""}
        placeholder="priya@acme.in"
        hint="One per line. Empty = anyone with the code."
      />
      <CheckboxField name="listed" id="coupon-listed" label="Show to every customer" description="Listed on the payment step for everyone. Never for an emails-only coupon." defaultChecked={coupon?.listed ?? false} />
      <TextField name="agents" id="coupon-agents" label="Agents" defaultValue={coupon?.agents.join(", ") ?? ""} placeholder="meta-ads, google-ads" hint="Agent ids, separated by commas. Empty = every agent." />

      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-semibold text-ink">Currencies</legend>
          <CheckboxField name="inr" id="coupon-cur-inr" label="INR" defaultChecked={everyCurrency || coupon.currencies.includes("INR")} />
          <CheckboxField name="usd" id="coupon-cur-usd" label="USD" defaultChecked={everyCurrency || coupon.currencies.includes("USD")} />
        </fieldset>
        <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-semibold text-ink">Works on</legend>
          <CheckboxField name="oneTime" id="coupon-onetime" label="One-time checkout" defaultChecked={!coupon || coupon.flows.includes("one_time")} />
          <CheckboxField name="autopay" id="coupon-autopay" label="Autopay (first month)" defaultChecked={!coupon || coupon.flows.includes("autopay")} />
        </fieldset>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { name: "starts", label: "Starts", value: date(coupon?.startsAt ?? null) },
          { name: "ends", label: "Ends", value: date(coupon?.endsAt ?? null) },
        ].map((field) => (
          <div key={field.name} className="flex flex-col gap-1.5">
            <label htmlFor={`coupon-${field.name}`} className="text-xs font-medium text-ink-soft">
              {field.label}
            </label>
            <input
              id={`coupon-${field.name}`}
              name={field.name}
              type="date"
              defaultValue={field.value}
              className="w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>
        ))}
        <TextField name="max" id="coupon-max" type="number" label="Total uses" defaultValue={coupon?.maxRedemptions?.toString() ?? ""} placeholder="Unlimited" />
        <TextField name="perUser" id="coupon-per-user" type="number" label="Uses per customer" defaultValue={String(coupon?.maxPerUser ?? 1)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <CheckboxField name="active" id="coupon-active" label="On" description="Can be used now (within its dates)." defaultChecked={coupon?.active ?? true} />
        <SubmitButton pendingLabel="Saving…" className={PRIMARY}>
          {coupon ? "Save changes" : "Create coupon"}
        </SubmitButton>
      </div>
    </form>
  );
}
