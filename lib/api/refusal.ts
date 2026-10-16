/**
 * Whether a 200 answer is really a refusal.
 *
 * The Lambda reports some failures as HTTP 200 with `{ success: false, error }`
 * — `apiRequest` only throws on a non-2xx status, so a caller that does not
 * look at the body treats a refused write as done. The legacy admin panel
 * shipped six buttons that reported failed saves as successes this way, and
 * the same gap was found in agent launches, account selections, mailbox saves
 * and payment checks (audit, 2026-09-29).
 *
 * Returns the backend's own reason when it gave one, a generic one when it did
 * not, and null when the answer is not a refusal. n8n replies are often a
 * single-element array, so the first element is read as well.
 */
export function refusalOf(payload: unknown): string | null {
  const node = Array.isArray(payload) ? payload[0] : payload;
  if (!node || typeof node !== "object") return null;
  const body = node as { success?: unknown; error?: unknown; message?: unknown };
  if (body.success !== false) return null;
  if (typeof body.error === "string" && body.error.trim() !== "") return body.error.trim();
  if (typeof body.message === "string" && body.message.trim() !== "") return body.message.trim();
  return "The request was refused.";
}
