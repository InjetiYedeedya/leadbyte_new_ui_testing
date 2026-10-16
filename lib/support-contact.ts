/**
 * Who a customer contacts for help, in one place.
 *
 * Shown on `/creative/edit`, where asking our team IS the edit flow (a
 * product decision carried over from the legacy app, whose
 * `config/supportContact.js` held these same values). Add a second address
 * or number to the lists and every page that shows them picks it up.
 */
export const SUPPORT_CONTACT = {
  emails: [{ label: "Email support", value: "apps@ntimes.ai" }],
  phones: [{ label: "Phone support", value: "+1 914 473 1849" }],
} as const;

/** `+1 914 473 1849` → `tel:+19144731849`. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
