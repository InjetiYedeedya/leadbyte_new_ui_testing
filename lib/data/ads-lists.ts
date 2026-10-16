/**
 * The live lists the ad setup forms pick from — saved audiences, lead forms,
 * store locations — read from the customer's own ad account.
 *
 * From the legacy campaign-flow guide (§3, 2026-09-30). Each is a `POST` with
 * `{ email }` that the Lambda forwards to n8n:
 *
 *   saved audiences   google-retargeting        meta-retargeting
 *   lead forms        google-lead-forms         meta-instant-forms
 *   store locations   google-store-locations    —
 *
 * The browser asks OUR Route Handler (`app/api/ads/lists/route.ts`), a fixed
 * menu of these five, never n8n or the Lambda — the same seam as
 * `/api/locations`.
 *
 * ## The reply shape is not documented
 *
 * n8n's answers here were never captured, so `parseAdsList` reads them
 * defensively: the first array it can find (bare, or under a usual envelope),
 * and each item's id and name under the spellings these platforms use. An
 * item with no id is dropped — it could not be sent back as a choice. A reply
 * with no list in it at all is an ERROR, never an empty list (`parseAdsList`).
 *
 * Client-safe: no network in this file.
 */

export type AdsListKind = "audiences" | "lead-forms" | "store-locations";
export type AdsListPlatform = "google" | "meta";

const PATHS: Partial<Record<`${AdsListPlatform}:${AdsListKind}`, string>> = {
  "google:audiences": "/api/webhook/google-retargeting",
  "meta:audiences": "/api/webhook/meta-retargeting",
  "google:lead-forms": "/api/webhook/google-lead-forms",
  "meta:lead-forms": "/api/webhook/meta-instant-forms",
  "google:store-locations": "/api/webhook/google-store-locations",
};

/** The webhook for a list, or null for a combination that has none. */
export function adsListPath(platform: string, kind: string): string | null {
  return PATHS[`${platform}:${kind}` as keyof typeof PATHS] ?? null;
}

export interface AdsListOption {
  id: string;
  name: string;
  /** A second line: an audience's size, a form's status, a store's address. */
  detail: string;
  /** Store locations: the Google Business Profile id. Empty when it has none. */
  profileId: string;
  /** Store locations: the asset set the executor wants back. */
  assetSet: string;
}

type Rec = Record<string, unknown>;

function record(value: unknown): Rec | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : null;
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function first(rec: Rec, ...keys: string[]): string {
  for (const key of keys) {
    const value = text(rec[key]);
    if (value !== "") return value;
  }
  return "";
}

/**
 * The first array in the reply: bare, under an envelope, or a JSON string.
 * Null when there is none at all — a reply this cannot read, which is not the
 * same thing as an empty list (`[]`, or `{ audiences: [] }`).
 */
function findArray(reply: unknown, depth = 0): unknown[] | null {
  if (depth > 4) return null;
  if (typeof reply === "string") {
    try {
      return findArray(JSON.parse(reply), depth + 1);
    } catch {
      return null;
    }
  }
  if (Array.isArray(reply)) {
    // n8n often answers `[{ audiences: [...] }]` — one wrapper item.
    const only = reply.length === 1 ? record(reply[0]) : null;
    if (only && !first(only, "id", "audience_id", "form_id", "location_id", "resource_name", "resourceName")) {
      const inner = findArray(only, depth + 1);
      if (inner !== null) return inner;
    }
    return reply;
  }
  const rec = record(reply);
  if (!rec) return null;
  let empty: unknown[] | null = null;
  for (const key of [
    "data", "items", "results", "output", "audiences", "userLists", "user_lists", "forms",
    "leadForms", "lead_forms", "instantForms", "instant_forms", "locations", "stores", "storeLocations",
  ]) {
    if (key in rec) {
      const inner = findArray(rec[key], depth + 1);
      if (inner !== null && inner.length > 0) return inner;
      // An empty list is still a list; keep looking for a fuller one first.
      if (inner !== null) empty = inner;
    }
  }
  return empty;
}

/** Thrown by `parseAdsList` for a reply it cannot read. */
export class UnreadableAdsListError extends Error {
  constructor() {
    super("The ad account's list came back in a shape we cannot read.");
    this.name = "UnreadableAdsListError";
  }
}

/**
 * The options in an n8n reply, or null when the reply holds no list at all.
 * Pure, so it is tested against several shapes.
 */
export function readAdsList(reply: unknown): AdsListOption[] | null {
  const items = findArray(reply);
  if (items === null) return null;
  const seen = new Set<string>();
  const options: AdsListOption[] = [];
  for (const item of items) {
    const rec = record(item);
    if (!rec) continue;
    const id = first(rec, "id", "audience_id", "audienceId", "form_id", "formId", "location_id", "locationId", "resource_name", "resourceName");
    if (id === "" || seen.has(id)) continue;
    seen.add(id);
    const address = first(rec, "address", "formatted_address", "formattedAddress", "location_address");
    const name = first(rec, "name", "audience_name", "audienceName", "form_name", "formName", "title", "business_name", "businessName", "location_name") || address || id;
    options.push({
      id,
      name,
      detail:
        address && address !== name
          ? address
          : first(rec, "size", "audience_size", "approximate_count", "status", "description"),
      profileId: first(rec, "business_profile_id", "businessProfileId", "gbp_id", "profile_id", "place_id", "placeId"),
      assetSet: first(rec, "asset_set", "assetSet", "asset_set_id", "assetSetId"),
    });
  }
  // A list in which nothing is an option — `[{ received: true }]` — is not a
  // list of these at all.
  return items.length > 0 && options.length === 0 ? null : options;
}

/**
 * The options in an n8n reply. THROWS (`UnreadableAdsListError`) when the
 * reply holds no list at all — `{ received: true }`, an empty body, an error
 * page — so `/api/ads/lists` answers `ok: false` and the picker says "Unable to
 * load … Please try again." Reading such a reply as `[]` told the customer
 * their account had no audiences, forms or stores, which is a different and
 * usually false statement.
 */
export function parseAdsList(reply: unknown): AdsListOption[] {
  const options = readAdsList(reply);
  if (options === null) throw new UnreadableAdsListError();
  return options;
}

/* ---------- carrying a choice through the form ---------- */

/** What a picked option posts as: small, and self-describing. */
export interface PickedOption {
  id: string;
  name: string;
  profileId?: string;
  assetSet?: string;
}

export function encodePick(option: AdsListOption): string {
  const pick: PickedOption = { id: option.id, name: option.name };
  if (option.profileId) pick.profileId = option.profileId;
  if (option.assetSet) pick.assetSet = option.assetSet;
  return JSON.stringify(pick);
}

/** A posted pick, or null for anything that is not one. */
export function decodePick(raw: FormDataEntryValue | null): PickedOption | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const parsed = record(JSON.parse(raw));
    if (!parsed) return null;
    const id = text(parsed.id);
    if (id === "") return null;
    const pick: PickedOption = { id, name: text(parsed.name) || id };
    const profileId = text(parsed.profileId);
    const assetSet = text(parsed.assetSet);
    if (profileId) pick.profileId = profileId;
    if (assetSet) pick.assetSet = assetSet;
    return pick;
  } catch {
    return null;
  }
}

/** Every posted pick under a name, once each. */
export function decodePicks(values: FormDataEntryValue[]): PickedOption[] {
  const picks = values.map(decodePick).filter((p): p is PickedOption => p !== null);
  return picks.filter((pick, index) => picks.findIndex((p) => p.id === pick.id) === index);
}

/** New audience or retargeting — the legacy flow's step 5. */
export type AudienceType = "new" | "retargeting";

export function readAudienceType(raw: FormDataEntryValue | null): AudienceType {
  return raw === "retargeting" ? "retargeting" : "new";
}
