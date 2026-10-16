import { normEmail, pickString, type Row } from "./fields";
import { isActiveAdminRow, isStartingAdmin } from "./roles";
import { DEFAULT_ROLE } from "./rbac";

/**
 * Admin invites: a pending row with a secret token, a claim link emailed to
 * the invitee, and a claim that only works signed in as that same address.
 *
 * The token is what makes a leaked link useless: the claim compares it with
 * the one stored on the invitee's own row, and that row is keyed by the email
 * they are signed in with.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

export type InviteRefusal = "invalid" | "exists";

/** Why an invite cannot be sent, or null when it can. */
export function inviteRefusal(email: string, existing: readonly Row[]): InviteRefusal | null {
  const normalized = normEmail(email);
  if (!isEmail(normalized)) return "invalid";
  const own = existing.find((row) => normEmail(row.email) === normalized);
  // A revoked admin can be invited again; an active admin, a pending invite,
  // or a starting admin with no row yet is already an admin (or about to be).
  if (own) return isActiveAdminRow(own) || pickString(own, "status").toLowerCase() === "pending" ? "exists" : null;
  return isStartingAdmin(normalized) ? "exists" : null;
}

export function buildInviteRow(
  email: string,
  invitedBy: string,
  token: string,
  now: Date = new Date(),
  role: string = DEFAULT_ROLE,
): Row {
  const at = now.toISOString();
  return {
    email: normEmail(email),
    status: "pending",
    // Kept through the claim, which writes the row back whole.
    role,
    token,
    invited_by: normEmail(invitedBy),
    invited_at: at,
    created_at: at,
  };
}

/**
 * The link in the invite email. Built from `APP_URL`, never from the request's
 * Host header — that is attacker-controlled, and would let someone mint a
 * claim link that points at their own site.
 */
export function claimUrl(appUrl: string, token: string): string {
  return `${appUrl}/admin/claim?token=${encodeURIComponent(token)}`;
}

/** What the invite webhook expects — the legacy body, field for field. */
export function inviteEmailBody(email: string, invitedBy: string, url: string, now: Date = new Date()) {
  return {
    request_type: "admin_invite",
    user_email: normEmail(email),
    invited_by: normEmail(invitedBy),
    claim_url: url,
    timestamp: now.toISOString(),
  };
}

export type ClaimOutcome = "claim" | "already-active" | "no-invite" | "bad-token";

/**
 * Whether the signed-in account may claim with this token.
 *
 * `row` must be the one keyed by the SIGNED-IN email; the caller never looks
 * a row up by anything taken from the link.
 */
export function checkClaim(row: Row | null, token: string): ClaimOutcome {
  if (!row) return "no-invite";
  const status = pickString(row, "status").toLowerCase();
  if (status === "" || status === "active") return "already-active";
  const stored = pickString(row, "token");
  if (token === "" || stored === "" || stored !== token) return "bad-token";
  return "claim";
}
