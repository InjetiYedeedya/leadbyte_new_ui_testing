import "server-only";
import { cookies } from "next/headers";
import { sealValue, unsealValue } from "@/lib/auth/signed-cookie";

/**
 * The customer's OpenAI API key.
 *
 * ## Why a cookie, and why httpOnly
 *
 * The other three ad platforms are connected by OAuth: the browser walks
 * through a consent screen and n8n keeps the token. OpenAI Ads has no such
 * flow — the credential is a secret the customer types in — and there is no
 * backend field to put it in yet (checked 2026-09-10: no OpenAI anything in
 * the Lambda or n8n).
 *
 * So it is held in an httpOnly cookie: it travels with the browser, survives a
 * reload, and is never readable by page JavaScript, which is the whole point.
 * A key in `localStorage` is one XSS away from being spent by someone else.
 * The same mechanism the connected mailbox uses (`email-callback.ts`), for the
 * same reason — no endpoint will tell us the value back.
 *
 * ## What this costs, said plainly
 *
 * It is per-browser and it expires. Someone who signs in on a second machine
 * types the key again. That is the trade for not storing a live third-party
 * credential in plaintext in DynamoDB next to campaign rows, which was the
 * alternative.
 *
 * ## The name is load-bearing
 *
 * The `leadbyte_` prefix is what makes `lib/auth/sign-out.ts` sweep it —
 * that module clears by prefix rather than by a hand-kept list, precisely
 * because the list went stale and leaked one account's state to the next
 * person on the same browser. A key is the worst thing that could leak that
 * way, since it is chargeable.
 */
export const OPENAI_KEY_COOKIE = "leadbyte_openai_key";

/**
 * Thirty days, matching the mailbox cookie.
 *
 * Not longer: this is a credential, and one that outlives the customer's
 * memory of giving it to us is worse than one they have to re-enter.
 */
export const OPENAI_KEY_MAX_AGE = 30 * 24 * 60 * 60;

function str(value: FormDataEntryValue | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The key as typed. Trimmed, because a pasted key arrives with whitespace. */
export function readApiKeyForm(form: FormData): string {
  return str(form.get("apiKey"));
}

/** Parses the cookie back. A blank value means "not set", never an error. */
export function parseKeyCookie(raw: string | undefined): string | null {
  const key = str(raw);
  return key === "" ? null : key;
}

/** Safe anywhere — reading cookies has no restriction. */
export async function getOpenAiKey(): Promise<string | null> {
  const store = await cookies();
  // Encrypted at rest (2026-09-25). A key stored in plain text before then
  // does not decrypt and reads as "no key", so the customer pastes it once more.
  return parseKeyCookie((await unsealValue(store.get(OPENAI_KEY_COOKIE)?.value)) ?? undefined);
}

/**
 * Stores the key.
 *
 * Writable ONLY from a Server Action or Route Handler — calling this from a
 * page render throws and 500s the page, the same trap `setSession` documents.
 */
export async function setOpenAiKey(key: string): Promise<void> {
  const store = await cookies();
  store.set(OPENAI_KEY_COOKIE, await sealValue(key), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OPENAI_KEY_MAX_AGE,
  });
}

/** Forgets the key. Same restriction as writing it. */
export async function clearOpenAiKey(): Promise<void> {
  const store = await cookies();
  store.delete(OPENAI_KEY_COOKIE);
}
