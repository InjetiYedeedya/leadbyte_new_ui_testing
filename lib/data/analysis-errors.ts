/**
 * The parts of an analysis that failed while the rest succeeded.
 *
 * ## Why this exists
 *
 * `/api/website-analyze/status/{job}` answers `done` and then reports, in a
 * `partial_errors` map, which SECTIONS could not be produced:
 *
 * ```json
 * { "audit": "Function not found: arn:aws:lambda:…:function:seo-geo-auditor:$LATEST" }
 * ```
 *
 * We threw that away, so a job that finished with `seo: null` and `geo: null`
 * looked identical to an account that had never been analysed — and the audit
 * screen said "Nobody has run an audit for this account", which is false and
 * sends people to press Run analysis again against a service that is not there.
 *
 * ## Why the message is translated
 *
 * The backend's text is an AWS diagnostic. An ARN on a customer's screen tells
 * them nothing and reads as the app being broken in a way they might have
 * caused. So each known shape gets a sentence that says whose problem it is and
 * whether retrying could help — and anything unrecognised is passed through
 * verbatim rather than replaced with a guess.
 *
 * `section` is the backend's own key. One `audit` step produces BOTH the
 * website audit and the GEO analysis, which is why both screens read that key.
 */

export interface SectionFailure {
  /** The backend's key: `audit`, `brand`, … */
  section: string;
  /** The backend's own message, kept for logs and for the detail line. */
  message: string;
  /** What to tell the customer. */
  reason: string;
}

/** What each backend section is called on screen. */
export const SECTION_LABELS: Record<string, string> = {
  audit: "The website audit and GEO analysis",
  brand: "The business profile",
  seo: "The website audit",
  geo: "The GEO analysis",
};

/**
 * A missing Lambda is not a retryable condition, and saying "try again" would
 * send someone round a loop that cannot end. A timeout is the opposite.
 */
function reasonFor(message: string): string {
  if (/function not found|cannot find|does not exist|no such function/i.test(message)) {
    return (
      "The crawl finished, but the service that scores it did not respond. " +
      "That is a fault on our end — nothing is wrong with your site, and " +
      "running the analysis again will not change it."
    );
  }
  if (/timed? ?out|timeout|etimedout/i.test(message)) {
    return "That step ran out of time. Running the analysis again usually clears it.";
  }
  if (/denied|forbidden|unauthorized|unauthorised|403|401/i.test(message)) {
    return "We were not allowed to run that step. We are looking into it on our end.";
  }
  return message;
}

/** Reads the `partial_errors` map. Anything unexpected yields no failures. */
export function parsePartialErrors(raw: unknown): SectionFailure[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return [];

  return Object.entries(raw as Record<string, unknown>).flatMap(([section, value]) => {
    if (typeof value !== "string" || value.trim() === "") return [];
    const message = value.trim();
    return [{ section, message, reason: reasonFor(message) }];
  });
}

/** The failure for one section, or null when that section is fine. */
export function failureFor(
  failures: readonly SectionFailure[],
  section: string,
): SectionFailure | null {
  return failures.find((f) => f.section === section) ?? null;
}
