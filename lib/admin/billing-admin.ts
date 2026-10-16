/**
 * The admin side of billing: the agent pricing table and coupons, as the
 * admin screens read and write them.
 *
 * The contract is the billing handoff's (LeadByteBilling.tsx, 2026-09-28):
 * `GET/PUT /api/admin/pricing[/{id}[/history]]` and
 * `GET/PUT /api/admin/coupons[/{code}[/redemptions]]`. All of it answers on
 * leadbyte-api_v1 (probed 2026-09-28).
 *
 * Pure: every rule about what an admin may save is here and tested. The
 * screens are plain forms with no script, so the form sends every field and
 * this decides which ones mean something (a "% off" discount ignores the
 * amount boxes, and so on).
 */

export type Row = Record<string, unknown>;
const record = (value: unknown): Row => (value && typeof value === "object" ? (value as Row) : {});
const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const str = (value: unknown): string => (typeof value === "string" ? value : "");
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** A form value as a number, or null when empty or not a number. */
function formNumber(value: FormDataEntryValue | null): number | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (text === "") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}
const formText = (value: FormDataEntryValue | null): string => (typeof value === "string" ? value.trim() : "");

/** A date input's day as the end of that day, or null. */
function endOfDay(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T23:59:59`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function startOfDay(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export type Write = { ok: true; body: Record<string, unknown> } | { ok: false; errors: string[] };

// ═══════════════════════════ Agent pricing ═══════════════════════════

export interface AdminPriceRow {
  id: string;
  title: string;
  active: boolean;
  sortOrder: number;
  inr: number | null;
  usd: number | null;
  discountKind: "none" | "percent" | "fixed";
  discountPercent: number | null;
  discountInr: number | null;
  discountUsd: number | null;
  discountLabel: string;
  /** YYYY-MM-DD, for a date input. */
  discountEnds: string;
  yearlyPercent: number;
  version: number;
  updatedBy: string;
}

export function mapAdminPricing(raw: unknown): AdminPriceRow[] {
  const list = record(raw).agents;
  if (!Array.isArray(list)) return [];
  return list
    .map(record)
    .map((agent) => {
      const prices = record(agent.prices);
      const discount = agent.discount === null || agent.discount === undefined ? null : record(agent.discount);
      const amount = record(discount?.amount);
      const kind: AdminPriceRow["discountKind"] = !discount
        ? "none"
        : discount.type === "fixed"
          ? "fixed"
          : "percent";
      return {
        id: str(agent.agent_id),
        title: str(agent.title) || str(agent.agent_id),
        active: agent.active === true,
        sortOrder: num(agent.sort_order) ?? 0,
        inr: num(prices.INR),
        usd: num(prices.USD),
        discountKind: kind,
        discountPercent: num(discount?.percent),
        discountInr: num(amount.INR),
        discountUsd: num(amount.USD),
        discountLabel: str(discount?.label),
        discountEnds: str(discount?.ends_at).slice(0, 10),
        yearlyPercent: num(agent.yearly_discount_percent) ?? 15,
        version: num(agent.version) ?? 0,
        updatedBy: str(agent.updated_by),
      };
    })
    .filter((row) => row.id !== "")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}

/** The body for `PUT /api/admin/pricing/{id}`, or every reason it cannot be saved. */
export function buildPricingWrite(form: FormData): Write {
  const errors: string[] = [];
  const inr = formNumber(form.get("inr"));
  const usd = formNumber(form.get("usd"));
  if (inr !== null && inr <= 0) errors.push("The ₹ price must be more than 0, or empty to not sell in INR.");
  if (usd !== null && usd <= 0) errors.push("The $ price must be more than 0, or empty to not sell in USD.");

  const kind = formText(form.get("discountKind"));
  let discount: Record<string, unknown> | null = null;
  if (kind === "percent" || kind === "fixed") {
    const label = formText(form.get("discountLabel")).slice(0, 60);
    const endsRaw = formText(form.get("discountEnds"));
    const ends = endsRaw === "" ? null : endOfDay(endsRaw);
    if (endsRaw !== "" && ends === null) errors.push("The discount end date is not a date.");
    if (kind === "percent") {
      const percent = formNumber(form.get("discountPercent"));
      if (percent === null || percent < 1 || percent > 90) errors.push("A % discount must be between 1 and 90.");
      discount = { type: "percent", percent, label, ends_at: ends };
    } else {
      const offInr = formNumber(form.get("discountInr"));
      const offUsd = formNumber(form.get("discountUsd"));
      if (offInr === null && offUsd === null) errors.push("An amount discount needs a ₹ or $ amount.");
      if (offInr !== null && inr !== null && offInr >= inr) errors.push("The ₹ discount must be less than the ₹ price.");
      if (offUsd !== null && usd !== null && offUsd >= usd) errors.push("The $ discount must be less than the $ price.");
      if ((offInr !== null && offInr <= 0) || (offUsd !== null && offUsd <= 0)) errors.push("A discount amount must be more than 0.");
      discount = {
        type: "fixed",
        amount: { ...(offInr !== null ? { INR: offInr } : {}), ...(offUsd !== null ? { USD: offUsd } : {}) },
        label,
        ends_at: ends,
      };
    }
  } else if (kind !== "none") {
    errors.push("Choose a discount type.");
  }

  const yearly = formNumber(form.get("yearlyPercent"));
  if (yearly === null || yearly < 0 || yearly > 90) errors.push("The yearly discount must be between 0 and 90.");

  const version = formNumber(form.get("version"));
  const title = formText(form.get("title"));

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    body: {
      prices: { INR: inr, USD: usd },
      discount,
      yearly_discount_percent: yearly,
      active: form.get("active") === "on",
      ...(title !== "" ? { title } : {}),
      // Optimistic lock: the backend refuses (409) when someone else saved
      // this agent since the form was drawn, rather than overwriting them.
      ...(version !== null ? { expected_version: version } : {}),
    },
  };
}

/** A new agent's id: lower-case letters, digits and dashes, like the rest. */
export function normaliseAgentId(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "") : "";
}

export interface PriceChange {
  at: string;
  by: string;
  inr: { from: number | null; to: number | null };
  usd: { from: number | null; to: number | null };
}

export function mapPriceHistory(raw: unknown): PriceChange[] {
  const list = record(raw).history;
  if (!Array.isArray(list)) return [];
  return list.map(record).map((entry) => {
    const before = record(record(entry.previous).prices);
    const after = record(record(entry.new).prices);
    return {
      // The backend sorts its history key as `<iso>#<suffix>`.
      at: str(entry.changed_at).split("#")[0] ?? "",
      by: str(entry.changed_by),
      inr: { from: num(before.INR), to: num(after.INR) },
      usd: { from: num(before.USD), to: num(after.USD) },
    };
  });
}

// ═══════════════════════════ Coupons ═══════════════════════════

export interface AdminCoupon {
  code: string;
  description: string;
  kind: "percent" | "fixed";
  percent: number | null;
  offInr: number | null;
  offUsd: number | null;
  emails: string[];
  listed: boolean;
  agents: string[];
  /** Empty means every currency. */
  currencies: string[];
  flows: string[];
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  maxPerUser: number;
  active: boolean;
  redemptions: number;
  version: number;
}

export function mapAdminCoupons(raw: unknown): AdminCoupon[] {
  const list = record(raw).coupons;
  if (!Array.isArray(list)) return [];
  return list
    .map(record)
    .map((coupon) => {
      const off = record(coupon.amount_off);
      return {
        code: str(coupon.code).toUpperCase(),
        description: str(coupon.description),
        kind: coupon.discount_type === "fixed" ? ("fixed" as const) : ("percent" as const),
        percent: num(coupon.percent_off),
        offInr: num(off.INR),
        offUsd: num(off.USD),
        emails: strings(coupon.allowed_emails),
        listed: coupon.show_in_list === true,
        agents: strings(coupon.applies_to_agents),
        currencies: strings(coupon.currencies),
        flows: strings(coupon.flows),
        startsAt: str(coupon.starts_at) || null,
        endsAt: str(coupon.ends_at) || null,
        maxRedemptions: num(coupon.max_redemptions),
        maxPerUser: num(coupon.max_per_user) ?? 1,
        active: coupon.active === true,
        redemptions: num(coupon.redemption_count) ?? 0,
        version: num(coupon.version) ?? 0,
      };
    })
    .filter((coupon) => coupon.code !== "");
}

/** "20% off", "₹200 off / $3 off". */
export function couponSummary(coupon: AdminCoupon): string {
  if (coupon.kind === "percent") return coupon.percent ? `${coupon.percent}% off` : "";
  return [coupon.offInr ? `₹${coupon.offInr} off` : "", coupon.offUsd ? `$${coupon.offUsd} off` : ""]
    .filter((part) => part !== "")
    .join(" / ");
}

/** Who can use it, in words. */
export function couponAudience(coupon: AdminCoupon): string {
  if (coupon.emails.length > 0) return `${coupon.emails.length} ${coupon.emails.length === 1 ? "email" : "emails"} only`;
  return coupon.listed ? "Everyone (shown to all)" : "Anyone with the code";
}

const words = (text: string): string[] =>
  text
    .split(/[\s,;]+/)
    .map((word) => word.trim())
    .filter((word) => word !== "");

export function normaliseCode(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "") : "";
}

/** The body for `PUT /api/admin/coupons/{code}`, or every reason it cannot be saved. */
export function buildCouponWrite(form: FormData): Write & { code?: string } {
  const errors: string[] = [];
  const code = normaliseCode(form.get("code"));
  if (code.length < 3) errors.push("A code needs at least 3 letters or digits.");

  const kind = formText(form.get("kind")) === "fixed" ? "fixed" : "percent";
  const percent = formNumber(form.get("percent"));
  const offInr = formNumber(form.get("offInr"));
  const offUsd = formNumber(form.get("offUsd"));
  if (kind === "percent" && (percent === null || percent < 1 || percent > 90)) errors.push("A % coupon must be between 1 and 90.");
  if (kind === "fixed" && offInr === null && offUsd === null) errors.push("An amount coupon needs a ₹ or $ amount.");
  if (kind === "fixed" && ((offInr !== null && offInr <= 0) || (offUsd !== null && offUsd <= 0))) {
    errors.push("A coupon amount must be more than 0.");
  }

  const emails = words(formText(form.get("emails"))).map((email) => email.toLowerCase());
  const badEmail = emails.find((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if (badEmail) errors.push(`"${badEmail}" is not an email address.`);

  const inrOk = form.get("inr") === "on";
  const usdOk = form.get("usd") === "on";
  if (!inrOk && !usdOk) errors.push("Choose at least one currency.");
  const oneTime = form.get("oneTime") === "on";
  const autopay = form.get("autopay") === "on";
  if (!oneTime && !autopay) errors.push("Choose one-time checkout, autopay, or both.");

  const startsRaw = formText(form.get("starts"));
  const endsRaw = formText(form.get("ends"));
  const starts = startsRaw === "" ? null : startOfDay(startsRaw);
  const ends = endsRaw === "" ? null : endOfDay(endsRaw);
  if (startsRaw !== "" && starts === null) errors.push("The start date is not a date.");
  if (endsRaw !== "" && ends === null) errors.push("The end date is not a date.");
  if (starts && ends && ends < starts) errors.push("The coupon ends before it starts.");

  const max = formNumber(form.get("max"));
  const perUser = formNumber(form.get("perUser"));
  if (max !== null && max < 1) errors.push("Total uses must be at least 1, or empty for unlimited.");
  if (perUser === null || perUser < 1) errors.push("Uses per customer must be at least 1.");

  const version = formNumber(form.get("version"));

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    code,
    body: {
      description: formText(form.get("description")).slice(0, 200),
      discount_type: kind,
      ...(kind === "percent"
        ? { percent_off: percent }
        : { amount_off: { ...(offInr !== null ? { INR: offInr } : {}), ...(offUsd !== null ? { USD: offUsd } : {}) } }),
      allowed_emails: emails,
      // A coupon for named emails is never listed for everyone.
      show_in_list: emails.length === 0 && form.get("listed") === "on",
      applies_to_agents: words(formText(form.get("agents"))).map((id) => id.toLowerCase()),
      currencies: inrOk && usdOk ? [] : [inrOk ? "INR" : "USD"],
      flows: [oneTime && "one_time", autopay && "autopay"].filter((flow): flow is string => typeof flow === "string"),
      starts_at: starts,
      ends_at: ends,
      max_redemptions: max,
      max_per_user: perUser,
      active: form.get("active") === "on",
      ...(version !== null ? { expected_version: version } : {}),
    },
  };
}

export interface Redemption {
  at: string;
  who: string;
  flow: string;
  currency: string;
  saved: number | null;
  paid: number | null;
}

export function mapRedemptions(raw: unknown): Redemption[] {
  const list = record(raw).redemptions;
  if (!Array.isArray(list)) return [];
  return list.map(record).map((entry) => ({
    at: str(entry.redeemed_at),
    who: str(entry.email) || str(entry.user_id),
    flow: str(entry.flow) === "autopay" ? "Autopay" : "One-time",
    currency: str(entry.currency),
    saved: num(entry.discount),
    paid: num(entry.amount_paid),
  }));
}
