import { cookies } from "next/headers";
import {
  readLinkedInAdsForm,
  targetingField,
  type CriterionId,
  type LinkedInAdsSetup,
} from "@/lib/data/linkedin-ads-setup";

/**
 * The LinkedIn setup form's last posted answers, so the form comes back
 * filled in when it is sent back.
 *
 * Any problem — a validation error, n8n busy, an agent that returned no plan
 * — redirects to the agent page, and the LinkedIn form came back empty but for
 * the business name: goal, format, every targeting chip, budget and days gone,
 * under a message that could say "Your details are saved" (review,
 * 2026-10-08). Google and Meta keep unsent answers in the browser
 * (`form-draft.tsx`), but that restores by replaying input events, and
 * LinkedIn's goal, format and targeting live in island state those events do
 * not reach. So the server keeps the answers it was posted, briefly, and
 * hands them to the form as starting values.
 *
 * An httpOnly `leadbyte_` cookie: cleared at sign-out with every other one,
 * an hour long, and never a credential (the form has none). Read back
 * through `readLinkedInAdsForm`, so a hand-edited cookie gets the same checks
 * a post does.
 */

const COOKIE = "leadbyte_linkedin_setup";
const MAX_AGE = 60 * 60;
/** One cookie's worth; a draft larger than this is simply not kept. */
export const MAX_DRAFT_CHARS = 3_500;

/** The answers as the form would post them. Pure. */
export function draftToFormData(setup: LinkedInAdsSetup): FormData {
  const form = new FormData();
  form.set("businessName", setup.businessName);
  form.set("goal", setup.goal);
  form.set("adFormat", setup.adFormat);
  form.set("budgetType", setup.budgetType);
  if (setup.budgetAmount > 0) form.set("budgetAmount", String(setup.budgetAmount));
  if (setup.days > 0) form.set("days", String(setup.days));
  form.set("customTargeting", setup.customTargeting);
  for (const id of setup.criteria) form.append("criteria", id);
  for (const [id, values] of Object.entries(setup.targeting) as [CriterionId, string[]][]) {
    for (const value of values) form.append(targetingField(id), value);
  }
  return form;
}

/** The stored form, or null when it would not fit one cookie. Pure. */
export function encodeDraft(setup: LinkedInAdsSetup): string | null {
  const text = JSON.stringify([...draftToFormData(setup).entries()]);
  return text.length <= MAX_DRAFT_CHARS ? text : null;
}

/** A stored draft, re-read exactly as a post would be; null for junk. Pure. */
export function decodeDraft(raw: string | undefined): LinkedInAdsSetup | null {
  if (!raw) return null;
  let entries: unknown;
  try {
    entries = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(entries)) return null;
  const form = new FormData();
  for (const entry of entries) {
    if (Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "string") {
      form.append(entry[0], entry[1]);
    }
  }
  return readLinkedInAdsForm(form);
}

/** Keeps what was just posted. Server Action / Route Handler only. */
export async function keepLinkedInDraft(setup: LinkedInAdsSetup): Promise<void> {
  const store = await cookies();
  const text = encodeDraft(setup);
  if (text === null) {
    store.delete(COOKIE);
    return;
  }
  store.set(COOKIE, text, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** The kept answers, if any. Safe anywhere on the server. */
export async function readLinkedInDraft(): Promise<LinkedInAdsSetup | null> {
  return decodeDraft((await cookies()).get(COOKIE)?.value);
}
