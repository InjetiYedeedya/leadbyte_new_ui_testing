import { orAbsent } from "./ads-chat-payload";

/**
 * The ad setup forms' offer: the customer's own words, or none.
 *
 * Shared by Meta (MA-STEP-03) and Google, which ask it the same way: two chips,
 * "Custom offer" and "No offer", and under the first a free-text "Describe your
 * offer" with the presets below as suggestions. It replaced Google's fixed
 * percentages ("5", "10", "25"…): a percentage alone is not something an ad can
 * say, and "$20 off your first purchase" is. A value from before this — a stored
 * draft's "5" — reads as `none` rather than failing.
 */
export const AD_OFFERS = ["custom", "none"] as const;
export type AdOffer = (typeof AD_OFFERS)[number];

/** Suggestions for "Describe your offer". Editable — they are a start, not a list to pick from. */
export const OFFER_PRESETS = [
  "$20 off your first purchase",
  "10% off your first booking",
  "20% off annual plans",
  "Save $50 on your first order",
  "$10 off for new customers",
  "15% off when you book today",
  "$100 off orders over $500",
  "25% off for the first 50 customers",
  "Get 2 months free with annual plans",
  "Limited-time offer — save 20%",
  "Free consultation for new customers",
  "Buy one, get one free",
  "$25 off your next booking",
  "$100 off for early enrollment",
  "Limited seats available",
] as const;

/** The posted chip: `custom` only when it says exactly that; anything else is no offer. */
export function readOffer(raw: FormDataEntryValue | null): AdOffer {
  return typeof raw === "string" && raw.trim() === "custom" ? "custom" : "none";
}

/** What "Offer value" says: the customer's text, or a spelled-out absence. */
export function offerValue(offer: AdOffer, customOffer: string): string {
  return offer === "custom" ? orAbsent(customOffer.trim(), "Custom offer") : "No offer";
}
