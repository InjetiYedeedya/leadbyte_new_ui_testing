import type {
  AdsCheck,
  KeysResult,
  SaveKeyResult,
  StoredKey,
  TrackingResult,
  TrackingState,
  VerifyResult,
} from "./ads-types";

/**
 * Reading the connect step's three answers: is the key good, is it stored, and
 * can this account measure conversions.
 *
 * Pure — no fetch, no cookies — so the awkward parts are testable against the
 * contract's own captures.
 */

/** A check, normalised. `ok` absent is read as NOT ok: unknown is not passing. */
export interface ConnectCheck {
  key: string;
  ok: boolean;
  value: string;
  /** A statement of fact, not a pass/fail. Never blocks, never shown as an error. */
  informational: boolean;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseChecks(checks: AdsCheck[] | undefined): ConnectCheck[] {
  if (!Array.isArray(checks)) return [];

  return checks
    .filter((check): check is AdsCheck => typeof check === "object" && check !== null)
    .map((check) => ({
      key: str(check.key),
      // A check that does not say it passed has not passed. The alternative —
      // defaulting to true — turns a malformed response into a green tick over
      // an account that cannot run ads.
      ok: check.ok === true,
      value: str(check.value),
      informational: check.informational === true,
    }))
    .filter((check) => check.key !== "");
}

/**
 * The check that is stopping this account, or null.
 *
 * `usable: false` says the customer cannot continue but not why; the reason is
 * whichever check failed. Naming it is the difference between "we can't connect
 * your account" and "your brand is still awaiting approval".
 */
export function blockingCheck(result: VerifyResult | SaveKeyResult): ConnectCheck | null {
  // `informational` rows are skipped: the service marks its tracking check that
  // way because it only echoes what we told it. Naming it as the blocker would
  // send someone to fix a pixel when the real problem is elsewhere — or, when
  // nothing is wrong at all, invent one.
  return parseChecks(result.checks).find((check) => !check.ok && !check.informational) ?? null;
}

/**
 * Whether the customer may go on to build a campaign.
 *
 * Reads `usable`, NOT `valid`. A key can be valid and the account still
 * unusable — suspended, or awaiting brand approval — and `valid` alone would
 * wave through an account that cannot spend.
 *
 * Absent is read as not usable, for the same reason `ok` is.
 */
export function canProceed(result: VerifyResult | SaveKeyResult): boolean {
  if ("usable" in result && typeof result.usable === "boolean") return result.usable;
  // `save_key` answers `saved` rather than `usable`, and only stores a key it
  // has already checked against the platform — so a save that happened is a key
  // that passed.
  return "saved" in result && result.saved === true;
}

/**
 * The key we have stored for this account, or null.
 *
 * `has_key` is checked as well as the row existing: `keys` lists what it knows
 * about, and a row whose secret has been removed is a record of a key, not a
 * key. Treating it as connected would send someone to a campaign form that
 * cannot submit.
 */
export function storedKey(result: KeysResult | null, email?: string): StoredKey | null {
  const keys = Array.isArray(result?.keys) ? result.keys : [];
  const usable = keys.filter((key) => key?.has_key !== false);
  if (usable.length === 0) return null;

  if (email !== undefined) {
    const match = usable.find((key) => str(key.email).toLowerCase() === email.trim().toLowerCase());
    if (match) return match;
  }
  return usable[0] ?? null;
}

/**
 * What to print for a stored key.
 *
 * The service returns `…7f3a` — already masked, already the last four of the
 * key it actually holds. Nothing here reconstructs or pads it: the full key is
 * never returned by anything, ever, and a mask we invented would be a mask of
 * something we were only guessing at.
 */
export function describeStoredKey(key: StoredKey | null): string | null {
  if (!key) return null;
  const lastFour = str(key.last_four);
  const label = str(key.label);
  if (lastFour === "") return label === "" ? "Key stored" : label;
  return label === "" ? lastFour : `${label} · ${lastFour}`;
}

/**
 * Conversion tracking, in the three states it really has.
 *
 * **`awaiting` is the one people miss**, and the contract says so outright: a
 * pixel that EXISTS is not a pixel that WORKS — someone still has to put it on
 * the customer's website. Collapsing this to a boolean shows a tick over an
 * account that will never optimise for conversions, and nobody looks into why
 * the leads campaign is being billed per click.
 *
 * Anything unrecognised is read as `none`. That is the safe end: it offers to
 * set tracking up, which is harmless if it already exists, whereas guessing
 * `receiving` promises optimisation that is not happening.
 */
export function parseTrackingState(result: TrackingResult | null): TrackingState {
  const state = str(result?.state).toLowerCase();
  if (state === "receiving") return "receiving";
  if (state === "awaiting") return "awaiting";
  return "none";
}

export interface TrackingSummary {
  state: TrackingState;
  /** Whether conversions can actually be optimised for. Only `receiving` can. */
  usable: boolean;
  /** The service's own explanation, when it gave one. */
  explanation: string;
  /** What the customer does next — the installation steps, for `awaiting`. */
  nextStep: string;
}

export function summariseTracking(result: TrackingResult | null): TrackingSummary {
  const state = parseTrackingState(result);
  return {
    state,
    // Derived, not read: `usable` and `state` could disagree, and the state is
    // the one with three values.
    usable: state === "receiving",
    explanation: str(result?.explanation),
    nextStep: str(result?.next_step),
  };
}

/**
 * Whether the goal the customer picked will actually be delivered.
 *
 * Lead, app and sales campaigns run as CLICKS campaigns until tracking is
 * receiving events. That is not a warning about setup quality — it changes what
 * the money buys, so the setup form has to say it before the budget is set,
 * not after.
 */
const CONVERSION_GOALS = new Set(["leads", "app", "sales"]);

export function goalNeedsTracking(goal: string): boolean {
  return CONVERSION_GOALS.has(goal);
}

export function trackingWarning(goal: string, tracking: TrackingSummary): string | null {
  if (!goalNeedsTracking(goal) || tracking.usable) return null;
  return tracking.state === "awaiting"
    ? "Your tracking is set up but has not received any events yet, so this runs as a clicks campaign. It starts optimising for conversions once the pixel is on your site and firing."
    : "Conversion tracking is not connected, so this runs as a clicks campaign. Connect tracking and it can optimise for enquiries instead.";
}
