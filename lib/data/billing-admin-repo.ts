import { ApiError, apiRequest } from "@/lib/api/client";
import { isBackendConfigured } from "@/lib/api/config";
import { isRedirectError } from "@/lib/auth/session-expired";
import {
  mapAdminCoupons,
  mapAdminPricing,
  mapPriceHistory,
  mapRedemptions,
  type AdminCoupon,
  type AdminPriceRow,
  type PriceChange,
  type Redemption,
} from "@/lib/admin/billing-admin";

/**
 * The admin pricing and coupon routes. Server-only.
 *
 * Reads never throw: they return `{ ok: false }` and the screen says it could
 * not load, the same shape `admin-repo.ts` uses. Until the backend ships these
 * routes they answer 404, which reads as "not available yet" rather than as a
 * broken panel. Writes throw `BillingAdminError`, and every one is checked:
 * the legacy panel reported failed saves as successes.
 */

export type Read<T> = { ok: true; rows: T[] } | { ok: false; notDeployed: boolean };

export class BillingAdminError extends Error {
  constructor(
    message: string,
    /** Someone else saved it since the form was drawn (409). */
    readonly conflict: boolean,
  ) {
    super(message);
    this.name = "BillingAdminError";
  }
}

async function read<T>(path: string, map: (raw: unknown) => T[]): Promise<Read<T>> {
  if (!isBackendConfigured()) return { ok: false, notDeployed: true };
  try {
    return { ok: true, rows: map(await apiRequest<unknown>(path)) };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const notDeployed = error instanceof ApiError && error.status === 404;
    if (!notDeployed) console.warn(`[billing-admin] ${path} failed:`, error instanceof Error ? error.message : error);
    return { ok: false, notDeployed };
  }
}

async function write(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const answer = await apiRequest<Record<string, unknown> | null>(path, { method: "PUT", body });
    if (answer && answer.success === false) {
      throw new BillingAdminError(typeof answer.error === "string" ? answer.error : "The save was refused.", false);
    }
    return answer ?? {};
  } catch (error) {
    if (isRedirectError(error) || error instanceof BillingAdminError) throw error;
    if (error instanceof ApiError) {
      throw new BillingAdminError(error.message, error.status === 409);
    }
    throw new BillingAdminError("The save did not go through. Please try again.", false);
  }
}

const seg = encodeURIComponent;

export const billingAdminRepo = {
  pricing: (): Promise<Read<AdminPriceRow>> => read("/api/admin/pricing", mapAdminPricing),
  history: (agentId: string): Promise<Read<PriceChange>> =>
    read(`/api/admin/pricing/${seg(agentId)}/history`, mapPriceHistory),
  /** Returns whether existing autopay subscribers were queued for the new price. */
  async savePricing(agentId: string, body: Record<string, unknown>): Promise<{ subscribersQueued: boolean }> {
    const answer = await write(`/api/admin/pricing/${seg(agentId)}`, body);
    return { subscribersQueued: answer.subscriptions_price_sync === "queued" };
  },

  coupons: (): Promise<Read<AdminCoupon>> => read("/api/admin/coupons", mapAdminCoupons),
  redemptions: (code: string): Promise<Read<Redemption>> =>
    read(`/api/admin/coupons/${seg(code)}/redemptions`, mapRedemptions),
  async saveCoupon(code: string, body: Record<string, unknown>): Promise<void> {
    await write(`/api/admin/coupons/${seg(code)}`, body);
  },
};
