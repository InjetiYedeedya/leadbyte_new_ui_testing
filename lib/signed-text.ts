import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * On-screen messages that only OUR code can write.
 *
 * Several screens show a sentence taken from the address bar
 * (`?message=`, `?notice=`, `?error=`), because a Server Action or return
 * route redirects with it. That also meant anyone could craft a link that put
 * their own words on our page — "Your account is suspended, call +1 …" in our
 * own error box (audit, 2026-09-25). React escapes it, so it is not script
 * injection, but it is a convincing phishing surface.
 *
 * Senders now wrap the text with `signText`, which appends a short HMAC; the
 * pages show it only through `readSignedText`, which returns null for text
 * without a valid signature, and the page then shows its own generic line.
 *
 * Synchronous (`node:crypto`) because it is used inside template strings at
 * redirect time. Same secret as the session.
 */

const SEPARATOR = "~~";
const DEV_SECRET = "leadbyte-development-only-secret-not-for-production";

function secret(): string | null {
  const value = process.env.SESSION_SECRET ?? "";
  if (value.length >= 32) return value;
  return process.env.NODE_ENV === "production" ? null : DEV_SECRET;
}

function mac(text: string, key: string): string {
  return createHmac("sha256", key).update(`msg:${text}`).digest("base64url").slice(0, 22);
}

/** The text with its signature appended. Unsigned (and so never shown) without a secret. */
export function signText(text: string): string {
  const key = secret();
  return key === null ? text : `${text}${SEPARATOR}${mac(text, key)}`;
}

/** The original text when its signature is valid, otherwise null. */
export function readSignedText(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const key = secret();
  if (key === null) return null;
  const at = raw.lastIndexOf(SEPARATOR);
  if (at <= 0) return null;
  const text = raw.slice(0, at);
  const given = Buffer.from(raw.slice(at + SEPARATOR.length));
  const expected = Buffer.from(mac(text, key));
  return given.length === expected.length && timingSafeEqual(given, expected) ? text : null;
}
