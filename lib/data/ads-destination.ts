import type { AdsPlatform, GenerateDestination } from "./ads-types";

/**
 * The destinations `generate` asks us to collect, and reading them back.
 *
 * Pure, because the Server Action that calls `generate` again cannot be tested
 * and this is the part that decides what the customer is asked for. The rule
 * the whole module exists to keep: **`missing` names brief fields verbatim**,
 * so an entry maps onto the input that answers it with no translation table —
 * add a field to the contract and it appears on the form without a release.
 */

/** The three the contract names. Anything else is reported, never invented. */
export const DESTINATION_FIELDS = ["app_store_url", "play_store_url", "destination_url"] as const;

export type DestinationField = (typeof DESTINATION_FIELDS)[number];

export interface DestinationPrompt {
  field: DestinationField;
  label: string;
  hint: string;
  placeholder: string;
}

const PROMPTS: Record<DestinationField, Omit<DestinationPrompt, "field">> = {
  app_store_url: {
    label: "App Store link",
    hint: "Where iPhone and iPad users install the app.",
    placeholder: "https://apps.apple.com/us/app/…",
  },
  play_store_url: {
    label: "Google Play link",
    hint: "Where Android users install the app.",
    placeholder: "https://play.google.com/store/apps/details?id=…",
  },
  destination_url: {
    label: "Website link",
    hint: "Where people on a browser land.",
    placeholder: "https://example.com",
  },
};

/**
 * Which destinations a set of platforms needs.
 *
 * The contract's own table: web needs a website, each app surface needs its
 * own store listing, and two or more of them means a smart link gets minted
 * from all of them. Asked on the setup form rather than discovered afterwards,
 * because the platforms are chosen two questions earlier and the answer is
 * knowable the moment they are — a round trip to be told "we also need your
 * App Store link" is a round trip nobody had to make.
 *
 * Nothing selected returns nothing, not everything: an empty campaign is not a
 * reason to ask for three links.
 */
export function destinationFieldsFor(
  platforms: readonly AdsPlatform[],
): DestinationField[] {
  const fields: DestinationField[] = [];
  if (platforms.includes("ios_app")) fields.push("app_store_url");
  if (platforms.includes("android_app")) fields.push("play_store_url");
  if (platforms.includes("web")) fields.push("destination_url");
  // One order, always — see `destinationPrompts`.
  return DESTINATION_FIELDS.filter((field) => fields.includes(field));
}

/** The wording for one field, so the form and the later prompt agree. */
export function destinationPrompt(field: DestinationField): DestinationPrompt {
  return { field, ...PROMPTS[field] };
}

/** Whether a name is one of the three we can actually ask for. */
export function isDestinationField(value: string): value is DestinationField {
  return (DESTINATION_FIELDS as readonly string[]).includes(value);
}

/**
 * One input per thing the service could not find, in a fixed order.
 *
 * Fixed rather than the service's own order, so the form does not reshuffle
 * between two rounds of the same conversation — a field that moves while
 * someone is typing into the one below it is a field they fill in twice.
 *
 * A name we do not recognise is DROPPED, not rendered: we would have no label
 * for it and no idea what a valid value looks like, and an input captioned
 * with a raw API field name asks the customer to guess at our contract.
 * `unknownMissing` reports those so they are visible rather than silent.
 */
export function destinationPrompts(
  destination: GenerateDestination | undefined,
): DestinationPrompt[] {
  const missing = new Set(destination?.missing ?? []);
  return DESTINATION_FIELDS.filter((field) => missing.has(field)).map((field) => ({
    field,
    ...PROMPTS[field],
  }));
}

/** Entries of `missing` we have no input for — a contract change, reported not hidden. */
export function unknownMissing(destination: GenerateDestination | undefined): string[] {
  return (destination?.missing ?? []).filter((name) => !isDestinationField(name));
}

/**
 * Whether the advert still cannot be built.
 *
 * `ready === false` is the answer; an ABSENT destination is not. The block
 * predates this feature and campaigns created before it have no destination at
 * all, so treating undefined as "not ready" would strand every one of them
 * behind a form asking for links the service never said it wanted.
 */
export function needsDestinations(destination: GenerateDestination | undefined): boolean {
  return destination?.ready === false;
}

/**
 * The minted link, or null when there is not one.
 *
 * Only for a smart link: a `single` destination is the URL the customer typed
 * on the setup form, and showing it back to them as a result is noise.
 *
 * **`dynamic_url` only — never `?? url`.** That fallback was written for the
 * `single` case, which the `needs_dynamic_url !== true` line above already
 * excludes, so the only thing it ever caught was a FAILED MINT: `url` is then
 * the website, and it was rendered under "one link for every platform" and
 * sent to `create` as `smart_link_url`. A failure that reads as a success is
 * worse than no answer, and this one was invisible at a glance.
 */
export function smartLink(destination: GenerateDestination | undefined): string | null {
  if (!destination?.ready || destination.needs_dynamic_url !== true) return null;
  const link = destination.dynamic_url;
  return typeof link === "string" && link.trim() !== "" ? link : null;
}

/**
 * Why no link exists, when the service tried and could not.
 *
 * The companion to `smartLink` returning null: between them the panel has three
 * honest states — a link, an explanation, or the inputs — instead of one
 * ambiguous one.
 */
export function smartLinkError(destination: GenerateDestination | undefined): string | null {
  return destination?.error?.trim() || null;
}

/**
 * Whether a link was WANTED and is not there.
 *
 * True only once the service has answered: it asked for no more links, said it
 * needed a device-aware one, and there is none. That is a failed mint, whether
 * or not it explained itself.
 */
export function smartLinkFailed(destination: GenerateDestination | undefined): boolean {
  if (!destination?.ready || destination.needs_dynamic_url !== true) return false;
  return smartLink(destination) === null;
}

/**
 * What the customer typed, ready to spread into a brief.
 *
 * Absent and blank both mean "not answered" and are left out entirely rather
 * than sent as `""` — an empty destination is a link to nowhere, and the
 * service would have to treat it as one. Values are trimmed and given a scheme
 * for the same reason `absoluteDestination` exists: a scheme-less URL is a
 * RELATIVE path, so it would point at a path on our own site.
 */
export function readDestinationFields(form: FormData): Partial<Record<DestinationField, string>> {
  const answers: Partial<Record<DestinationField, string>> = {};
  for (const field of DESTINATION_FIELDS) {
    const raw = form.get(field);
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value === "") continue;
    answers[field] = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  }
  return answers;
}

/**
 * The stored answers merged with a new round's, newest winning.
 *
 * Kept on the draft so a redraft does not ask again: `generate` is not
 * deterministic and a customer may redraft many times, and re-collecting the
 * same App Store link on each one would make the button unusable.
 */
export function mergeDestinations(
  stored: Partial<Record<DestinationField, string>> | undefined,
  fresh: Partial<Record<DestinationField, string>>,
): Partial<Record<DestinationField, string>> {
  return { ...(stored ?? {}), ...fresh };
}
