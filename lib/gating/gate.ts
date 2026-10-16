import { cookies } from "next/headers";

/**
 * Persisted paywall gating.
 *
 * ## Why this is cookie-backed, not in-memory
 *
 * The original version held the pending action in `globalThis`. That was
 * already the *second* attempt — a client-side closure came first, and was a
 * real bug: choosing a plan silently did nothing because the pending action had
 * been dropped by a remount.
 *
 * `globalThis` fixed that, but CLAUDE.md recorded the remaining flaw plainly:
 * **it cannot survive a real Stripe redirect.** Checkout leaves the site
 * entirely and returns across a cold start, quite possibly to a different
 * instance, with process memory gone. The gate would be lost at exactly the
 * moment it matters — after the customer has paid.
 *
 * An httpOnly cookie travels with the browser, so it comes back from Stripe
 * intact. It is also the smallest thing that works: no schema, no table, no
 * backend change. If gates ever need to be readable server-side without a
 * request (reporting, support tooling), that is when this moves to DynamoDB.
 *
 * ## Writable only from a Server Action
 *
 * Next.js allows cookie *writes* only in Server Actions and Route Handlers.
 * `getPlan` and `getGate` are safe to read anywhere; `setPlan`, `setGate` and
 * `clearGate` must be called from an action. Every current caller already is.
 */

const PLAN_COOKIE = "leadbyte_plan";
const GATE_COOKIE = "leadbyte_gate";

export type PlanId = "free" | "growth" | "scale";

export type GateActionId = "generate-strategy" | "connect-linkedin";

const PLAN_IDS: PlanId[] = ["free", "growth", "scale"];
const GATE_IDS: GateActionId[] = ["generate-strategy", "connect-linkedin"];

interface PendingGate {
  actionId: GateActionId;
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

/**
 * The chosen plan.
 *
 * NOTE: this is the *local* plan choice, used by the mock paywall. Once billing
 * is live, real entitlements come from `lib/entitlements` — which reads the
 * subscription and purchases off the backend. This remains for the pre-billing
 * flow and for mock mode.
 */
export async function getPlan(businessId: string): Promise<PlanId> {
  const store = await cookies();
  const raw = store.get(`${PLAN_COOKIE}_${businessId}`)?.value;
  return PLAN_IDS.includes(raw as PlanId) ? (raw as PlanId) : "free";
}

export async function setPlan(businessId: string, plan: PlanId): Promise<void> {
  const store = await cookies();
  store.set(`${PLAN_COOKIE}_${businessId}`, plan, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 30,
  });
}

/**
 * Remembers what the user was trying to do when the paywall interrupted them.
 *
 * Short-lived on purpose: a gate is only meaningful for the length of one
 * checkout attempt. An hour comfortably covers a Stripe round trip, including
 * a card challenge, without leaving a stale intent to fire days later.
 */
export async function setGate(businessId: string, actionId: GateActionId): Promise<void> {
  const store = await cookies();
  store.set(`${GATE_COOKIE}_${businessId}`, actionId, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60,
  });
}

export async function getGate(businessId: string): Promise<PendingGate | null> {
  const store = await cookies();
  const raw = store.get(`${GATE_COOKIE}_${businessId}`)?.value;
  // Validate rather than trust: the cookie is user-controlled, and an unknown
  // action id must not reach the resume switch.
  return GATE_IDS.includes(raw as GateActionId) ? { actionId: raw as GateActionId } : null;
}

export async function clearGate(businessId: string): Promise<void> {
  const store = await cookies();
  store.delete(`${GATE_COOKIE}_${businessId}`);
}
