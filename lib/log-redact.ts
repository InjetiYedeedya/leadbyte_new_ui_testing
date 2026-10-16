/**
 * Makes a value safe to write to a server log.
 *
 * Several places print the body they send to n8n, because "was it our
 * request or their workflow" is otherwise unanswerable. Those bodies can carry
 * credentials the customer typed: the On-Page SEO setup sent the customer's
 * WordPress password as `blogApiKey`, and it was written to the log in plain
 * text on every run (audit, 2026-09-25).
 *
 * Any key that names a secret is replaced with `[redacted]`, at any depth.
 * The KEY is kept, because whether a field was sent is often the question.
 */

const SECRET_KEY = /pass(word)?|secret|token|api[_-]?key|apikey|authori[sz]ation|credential|cookie|private[_-]?key/i;

export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] =
      SECRET_KEY.test(key) && inner !== undefined && inner !== null && inner !== ""
        ? "[redacted]"
        : redactSecrets(inner, depth + 1);
  }
  return out;
}

/** Query-string parameter NAMES only — values can carry codes and tokens. */
export function paramNames(params: URLSearchParams): string {
  return [...new Set(params.keys())].join(", ") || "none";
}
