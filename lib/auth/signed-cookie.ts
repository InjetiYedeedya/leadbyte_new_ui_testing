/**
 * Tamper-proof cookie values.
 *
 * ## Why
 *
 * The identity cookies (`leadbyte_session` = the account email, `_owner`,
 * `_uid`) were plain values, and the app treats them as who the visitor IS.
 * `httpOnly` stops page scripts reading them; it does not stop the visitor
 * editing them in DevTools. An edited email opened the admin panel (built-in
 * admins are recognised by email) and linked OAuth accounts to someone else's
 * workspace. Audit, 2026-09-25.
 *
 * ## How
 *
 * Each value is stored as `value.signature`, where the signature is an
 * HMAC-SHA256 of the cookie NAME and value under a server-only secret. The
 * name is in the MAC so a signed value cannot be moved from one cookie to
 * another (a uid pasted into the email slot). A value whose signature does not
 * match — edited, or written before signing existed — reads as absent, which
 * everywhere means "signed out".
 *
 * Web Crypto rather than `node:crypto`, so the same code runs in Node and on
 * Cloudflare Workers.
 *
 * ## The secret
 *
 * `SESSION_SECRET`, at least 32 characters. Development falls back to a fixed
 * value so localhost works untouched; production WITHOUT it signs nothing and
 * verifies nothing, so nobody can sign in — failing closed, loudly, rather
 * than quietly accepting forgeable cookies.
 */

const DEV_SECRET = "leadbyte-development-only-secret-not-for-production";

export class MissingSessionSecretError extends Error {
  constructor() {
    super("SESSION_SECRET is not set (or shorter than 32 characters) in production.");
    this.name = "MissingSessionSecretError";
  }
}

function secret(): string | null {
  const value = process.env.SESSION_SECRET ?? "";
  if (value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") return null;
  return DEV_SECRET;
}

let keyPromise: Promise<CryptoKey> | null = null;
let keyFor: string | null = null;

function key(value: string): Promise<CryptoKey> {
  if (keyPromise === null || keyFor !== value) {
    keyFor = value;
    keyPromise = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(value),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  }
  return keyPromise;
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function mac(name: string, value: string, secretValue: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await key(secretValue),
    new TextEncoder().encode(`${name}=${value}`),
  );
  return toBase64Url(signature);
}

/** Constant-time comparison, so a timing difference cannot leak the MAC. */
function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `value.signature`. Throws in production when there is no secret. */
export async function signValue(name: string, value: string): Promise<string> {
  const s = secret();
  if (s === null) throw new MissingSessionSecretError();
  return `${value}.${await mac(name, value, s)}`;
}

/** The original value when the signature matches, otherwise null. */
export async function verifyValue(name: string, stored: string | undefined): Promise<string | null> {
  if (!stored) return null;
  const s = secret();
  if (s === null) {
    console.error("[auth] SESSION_SECRET is missing in production — every session is rejected.");
    return null;
  }
  const dot = stored.lastIndexOf(".");
  if (dot <= 0) return null;
  const value = stored.slice(0, dot);
  const signature = stored.slice(dot + 1);
  return equal(signature, await mac(name, value, s)) ? value : null;
}

/**
 * Encrypted cookie values, for the few that hold a customer's own secret —
 * their OpenAI API key, which was stored in plain text and sent with every
 * request (audit, 2026-09-25). AES-GCM under a key derived from the same
 * `SESSION_SECRET`; a value that does not decrypt reads as absent.
 */
let sealKeyPromise: Promise<CryptoKey> | null = null;
let sealKeyFor: string | null = null;

function sealKey(value: string): Promise<CryptoKey> {
  if (sealKeyPromise === null || sealKeyFor !== value) {
    sealKeyFor = value;
    sealKeyPromise = crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(`seal:${value}`))
      .then((raw) => crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]));
  }
  return sealKeyPromise;
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  return new Uint8Array(Array.from(atob(padded), (c) => c.charCodeAt(0)));
}

export async function sealValue(value: string): Promise<string> {
  const s = secret();
  if (s === null) throw new MissingSessionSecretError();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await sealKey(s),
    new TextEncoder().encode(value),
  );
  return `${toBase64Url(iv.buffer)}.${toBase64Url(cipher)}`;
}

export async function unsealValue(stored: string | undefined): Promise<string | null> {
  if (!stored) return null;
  const s = secret();
  if (s === null) return null;
  const [ivText, cipherText] = stored.split(".");
  if (!ivText || !cipherText) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(ivText) },
      await sealKey(s),
      fromBase64Url(cipherText),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
