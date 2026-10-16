"use server";

import { signText } from "@/lib/signed-text";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "@/lib/auth/session-expired";
import { requirePermission } from "@/lib/admin/access";
import { buildCouponWrite, buildPricingWrite, normaliseAgentId, normaliseCode } from "@/lib/admin/billing-admin";
import { BillingAdminError, billingAdminRepo } from "@/lib/data/billing-admin-repo";

/**
 * Admin writes for Agent pricing and Coupons.
 *
 * Super admin only, checked HERE and not just on the page: a Server Action is
 * a POST anyone signed in can call without the page. Outcomes go through the
 * URL (`?notice=` / `?error=`), the admin panel's house pattern.
 */

function back(path: string, key: "notice" | "error", message: string): never {
  if (key === "notice") revalidatePath(path);
  redirect(`${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(signText(message))}`);
}

function saveFailure(error: unknown, what: string): string {
  if (error instanceof BillingAdminError) {
    return error.conflict
      ? `Someone else changed ${what} since you opened it. The latest values are shown; please make your change again.`
      : error.message;
  }
  return "The save did not go through. Please try again.";
}

export async function saveAgentPricing(form: FormData): Promise<void> {
  await requirePermission("pricing", "write");
  const agentId = normaliseAgentId(form.get("agentId"));
  if (agentId === "") back("/admin/pricing", "error", "That agent could not be found.");
  const write = buildPricingWrite(form);
  if (!write.ok) back("/admin/pricing", "error", write.errors.join(" "));

  let queued = false;
  try {
    ({ subscribersQueued: queued } = await billingAdminRepo.savePricing(agentId, write.body));
  } catch (error) {
    if (isRedirectError(error)) throw error;
    back("/admin/pricing", "error", saveFailure(error, agentId));
  }
  back(
    "/admin/pricing",
    "notice",
    queued
      ? `Saved ${agentId}. Existing autopay customers pay the new price from their next month.`
      : `Saved ${agentId}. The Pricing page shows it now.`,
  );
}

/** A new agent starts inactive, so it is priced before anyone can buy it. */
export async function addPricedAgent(form: FormData): Promise<void> {
  await requirePermission("pricing", "write");
  const agentId = normaliseAgentId(form.get("agentId"));
  const title = typeof form.get("title") === "string" ? String(form.get("title")).trim() : "";
  if (agentId === "" || title === "") back("/admin/pricing", "error", "A new agent needs an id and a title.");
  try {
    await billingAdminRepo.savePricing(agentId, { title, active: false });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    back("/admin/pricing", "error", saveFailure(error, agentId));
  }
  back("/admin/pricing", "notice", `Added ${agentId}, switched off. Set its prices, then switch it on.`);
}

export async function saveCoupon(form: FormData): Promise<void> {
  await requirePermission("coupons", "write");
  const write = buildCouponWrite(form);
  if (!write.ok || !write.code) back("/admin/coupons", "error", write.ok ? "A coupon needs a code." : write.errors.join(" "));
  try {
    await billingAdminRepo.saveCoupon(write.code, write.body);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    back("/admin/coupons", "error", saveFailure(error, write.code));
  }
  back("/admin/coupons", "notice", `Saved ${write.code}.`);
}

export async function toggleCoupon(form: FormData): Promise<void> {
  await requirePermission("coupons", "write");
  const code = normaliseCode(form.get("code"));
  const version = Number(form.get("version"));
  const active = form.get("active") === "true";
  if (code === "") back("/admin/coupons", "error", "That coupon could not be found.");
  try {
    await billingAdminRepo.saveCoupon(code, { active, ...(Number.isFinite(version) ? { expected_version: version } : {}) });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    back("/admin/coupons", "error", saveFailure(error, code));
  }
  back("/admin/coupons", "notice", `${code} is ${active ? "on" : "off"}.`);
}
