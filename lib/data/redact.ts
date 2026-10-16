/**
 * A copy of a value with anything credential-shaped blanked out, by KEY name
 * (token, secret, password, key, credential, auth, code, cookie, session).
 * Pure, so it is tested. For debug output only — never a reason to fetch a
 * secret in the first place.
 */
const SENSITIVE = /token|secret|password|key|credential|auth|code|cookie|session/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE.test(key) ? "[redacted]" : redact(inner);
    }
    return out;
  }
  // A JSON string (`selectedAccount` is stored as one) is redacted inside too.
  if (typeof value === "string" && /^\s*[[{]/.test(value)) {
    try {
      return redact(JSON.parse(value));
    } catch {
      return value;
    }
  }
  return value;
}
