/**
 * Pulling a list out of whatever n8n put in the callback URL.
 *
 * Each Google flow names its payload differently and nests it differently:
 *
 *   accounts  Analytics       — a bare array of property objects
 *   sites     Search Console  — a bare array of site objects
 *   data      both at once    — an array wrapping ONE object that holds both
 *                               lists under `analytics_properties` and
 *                               `search_console_sites`
 *
 * Rather than hard-coding those key names, this walks the value and keeps every
 * row the caller's parser recognises. Rows it doesn't — Search Console sites
 * when looking for Analytics properties, and vice versa — simply drop out. A
 * new flow, or a renamed wrapper key, therefore needs no change here.
 */

/** A cookie has to carry the result, and cookies cap around 4KB. */
export const MAX_ROWS = 50;

/**
 * How long the offered lists stay valid, in seconds.
 *
 * An hour, not the 15 minutes this started at. The window has to cover someone
 * approving Google, getting distracted, and coming back — and when it lapses
 * they do not merely lose the picker, they have to walk through Google consent
 * again to see the same list. That is a bad trade against a list of property
 * names sitting in an httpOnly cookie for a while longer.
 */
export const OFFER_MAX_AGE = 60 * 60;

/**
 * Marks that a selection was stored, so a repeat submit is not called a failure.
 *
 * On success the offered lists are cleared. A second submit of the same form —
 * a double click, or Back then re-post — then finds nothing and looks exactly
 * like an expired offer, which told a customer their connection had failed
 * seconds after it succeeded. This cookie is how the two are told apart.
 */
export const GOOGLE_SAVED_COOKIE = "leadbyte_google_saved";

/** How deep to walk. The payload comes from outside: a deep or cyclic object
    must not turn a redirect into a hang. */
const MAX_DEPTH = 5;

/**
 * Which fields a row inherits from the object that contains it.
 *
 * The combined payload names the Google account once, on the wrapper —
 * `{ email, name, analytics_properties: [...], search_console_sites: [...] }` —
 * so a row read on its own has neither, and the picker would have nothing to
 * name the connected account with. A field is only filled in when the row
 * already declares it and left it empty, so a type that has no `name` does not
 * acquire one.
 */
const INHERITED = ["email", "name"] as const;

/**
 * Collects every row `parse` recognises, anywhere in `raw`.
 */
export function collectFromPayload<T extends { email: string }>(
  raw: unknown,
  parse: (node: unknown) => T[],
  idOf: (item: T) => string,
): T[] {
  let value = raw;

  if (typeof raw === "string") {
    if (raw.trim() === "") return [];
    try {
      value = JSON.parse(raw);
    } catch {
      // Never throws: this runs on a redirect the customer has just completed
      // successfully, and a malformed list should cost them a picker, not the
      // connection.
      return [];
    }
  }

  const found: T[] = [];
  const seen = new Set<string>();

  const walk = (node: unknown, depth: number, ancestor: Record<string, string>): void => {
    if (depth > MAX_DEPTH || node === null || typeof node !== "object") return;

    const fields = Array.isArray(node) ? {} : (node as Record<string, unknown>);
    const inherited: Record<string, string> = { ...ancestor };
    for (const field of INHERITED) {
      const value = fields[field];
      if (typeof value === "string" && value.trim() !== "") {
        inherited[field] = value.trim();
      }
    }

    for (const item of parse(node)) {
      const id = idOf(item);
      if (seen.has(id)) continue;
      seen.add(id);

      const filled = { ...item } as Record<string, unknown>;
      for (const field of INHERITED) {
        if (filled[field] === "" && inherited[field]) filled[field] = inherited[field];
      }
      found.push(filled as T);
    }

    const children = Array.isArray(node) ? node : Object.values(node);
    for (const child of children) walk(child, depth + 1, inherited);
  };

  walk(value, 0, {});
  return found.slice(0, MAX_ROWS);
}
