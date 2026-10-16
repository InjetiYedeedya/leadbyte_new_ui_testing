"use server";

import { redirect } from "next/navigation";
import { getSession, switchBusiness as switchSessionBusiness } from "@/lib/auth/session";
import { isBackendConfigured } from "@/lib/api/config";
import { getBusinessRepo } from "@/lib/data/business-repo";

/**
 * Demo mode only, and only to a business this account owns.
 *
 * It used to set the session to ANY posted value with no session check, and
 * with a live backend the session's business is the account email — so one
 * POST could make anyone any user, admins included (audit, 2026-09-25). A live
 * account has exactly one business, its own, so there is nothing to switch to.
 */
export async function switchBusinessAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (isBackendConfigured()) redirect("/settings");

  const businessId = String(formData.get("businessId") ?? "");
  const owned = await getBusinessRepo().list(session.ownerId);
  if (!owned.some((business) => business.businessId === businessId)) redirect("/settings");

  await switchSessionBusiness(businessId);
  redirect("/overview");
}

export async function addBusiness(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (isBackendConfigured()) redirect("/settings");

  const websiteUrl = String(formData.get("websiteUrl") ?? "").trim();
  if (!websiteUrl) redirect("/settings");

  const summary = await getBusinessRepo().add(session.ownerId, websiteUrl);
  await switchSessionBusiness(summary.businessId);
  redirect("/overview");
}
