import { AGE_RANGES } from "./google-ads-setup";
/**
 * The extra fields a semi-automated launch asks for.
 *
 * ## Where this shape comes from
 *
 * Probed live on 2026-09-04. `POST /api/webhook/{platform}-ads-semi` does not
 * launch anything — it answers with a FORM SCHEMA:
 *
 *   { success: true, output: [
 *       { fieldLabel: "Budget Type", fieldType: "dropdown",
 *         placeholder: "Select budget type", defaultValue: "",
 *         requiredField: true, fieldOptions: { values: ["Daily", "Lifetime"] } },
 *       …
 *   ]}
 *
 * So semi is two calls, not one: ask what else is needed, then send the answers
 * back to the same endpoint along with the creative. An earlier version posted
 * once and treated it as the launch, which silently discarded eleven fields the
 * agent was waiting for.
 *
 * ## Why the labels are the keys
 *
 * `fieldLabel` is what comes back and what has to go back — there is no
 * separate machine name. "Daily Budget (USD)" is the key, brackets and all.
 * They are used verbatim rather than slugified, because a slug would have to be
 * un-slugified on the way out and the mapping is not ours to invent.
 */

import {
  PICKS_SUFFIX,
  decodePicks,
  encodePicks,
  levelsUsed,
  pickAddress,
  pickProblems,
  summarisePicks,
} from "@/lib/data/location-picks";
import { internationalNumber, isPlausibleInternational } from "@/lib/data/dial-codes";

/**
 * A phone field's country picker posts under `<field name>_dial`, holding the
 * ISO country (`IN`). Read with the number and folded into ONE answer, so the
 * key the workflow reads is the one it always read (2026-10-09).
 */
export const DIAL_SUFFIX = "_dial";

export type SemiFieldType = "text" | "textarea" | "number" | "date" | "dropdown" | "url" | "tel";

export interface SemiField {
  label: string;
  type: SemiFieldType;
  placeholder: string;
  defaultValue: string;
  required: boolean;
  /** Present for dropdowns; empty otherwise. */
  options: string[];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

const TYPES: SemiFieldType[] = ["text", "textarea", "number", "date", "dropdown", "url", "tel"];

/** Type spellings that mean one of ours. */
const TYPE_ALIASES: Record<string, SemiFieldType> = { phone: "tel" };

/**
 * Every spelling the legacy spec says a schema key can arrive in. The
 * workflows are edited by hand in n8n, and each one has drifted its own way —
 * `fieldLabel`, `field_label`, `label`, `name`… — so the first one present wins.
 */
const LABEL_KEYS = ["fieldLabel", "fieldlabel", "field_label", "label", "name", "fieldName", "field_name"];
const TYPE_KEYS = ["fieldType", "fieldtype", "field_type", "type", "inputType", "input_type"];
const PLACEHOLDER_KEYS = ["placeholder", "placeHolder", "place_holder"];
const DEFAULT_KEYS = ["defaultValue", "defaultvalue", "default_value", "default", "value"];
const REQUIRED_KEYS = ["requiredField", "requiredfield", "required_field", "required", "isRequired"];
const OPTION_KEYS = ["fieldOptions", "fieldoptions", "field_options", "options"];

/** Where a reply may keep its list of fields, in the order they are looked for. */
const CONTAINER_KEYS = ["fields", "formFields", "form_fields", "data", "form", "output", "items", "schema"];

function firstStr(r: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = str(r[key]);
    if (value !== "") return value;
  }
  return "";
}

/** An option as text: a bare value, or `{ option }` / `{ label }` / `{ value }`. */
function optionText(value: unknown): string {
  if (value && typeof value === "object") {
    const r = record(value);
    return str(r.option) || str(r.label) || str(r.value);
  }
  return str(value);
}

/** Options as a plain list, or `{ values: [...] }`. */
function readOptions(r: Record<string, unknown>): string[] {
  for (const key of OPTION_KEYS) {
    const raw = r[key];
    const list = Array.isArray(raw) ? raw : record(raw).values;
    if (Array.isArray(list)) return list.map(optionText).filter(Boolean);
  }
  return [];
}

/** True for a row that describes a field rather than wrapping a list of them. */
function isFieldRow(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = record(value);
  if (CONTAINER_KEYS.some((key) => Array.isArray(r[key]))) return false;
  return [...LABEL_KEYS, ...TYPE_KEYS].some((key) => str(r[key]) !== "");
}

/**
 * The list of fields, wherever the reply keeps it.
 *
 * n8n answers `{ output: [...] }` from a direct probe and `[{ output: [...] }]`
 * through the live app — the same reply, wrapped differently — and the legacy
 * spec adds `fields`, `formFields`, `data`, `form`, `schema` and friends, and
 * a JSON string in any of them. Reading only one wrapper yields an EMPTY form
 * for a campaign the agent is waiting on, so each is unwrapped in turn, a few
 * levels deep at most.
 */
function findRows(value: unknown, depth = 0): unknown[] | null {
  if (depth > 5) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
    try {
      return findRows(JSON.parse(trimmed), depth + 1);
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    if (value.some(isFieldRow)) return value;
    for (const item of value) {
      const found = findRows(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const r = record(value);
  for (const key of CONTAINER_KEYS) {
    if (!(key in r)) continue;
    const found = findRows(r[key], depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Reads the schema out of the semi endpoint's reply.
 *
 * Unknown field types fall back to `text` rather than being dropped: a field
 * the agent is waiting for must be askable even if we do not recognise how it
 * wanted to render it. A field with no label is dropped — it has no key to send
 * back under, so nothing could be done with the answer.
 */
export function parseSemiFields(payload: unknown): SemiField[] {
  const rows = findRows(payload);
  if (!rows) return [];

  return rows
    .map((row) => {
      const r = record(row);
      const rawType = firstStr(r, TYPE_KEYS).toLowerCase();
      const requiredKey = REQUIRED_KEYS.find((key) => key in r);
      const required = requiredKey === undefined ? true : r[requiredKey];

      return {
        label: firstStr(r, LABEL_KEYS),
        type: TYPES.find((t) => t === rawType) ?? TYPE_ALIASES[rawType] ?? "text",
        placeholder: firstStr(r, PLACEHOLDER_KEYS),
        defaultValue: firstStr(r, DEFAULT_KEYS),
        // Anything but an explicit false is required: the agent asked for it.
        required: required !== false && required !== "false",
        options: readOptions(r),
      };
    })
    .filter((field) => field.label !== "")
    .map(matchDefaultToOption);
}

/**
 * A field whose answer is a web address: typed `url`, or labelled with "url",
 * or "website" — but not "website name", which is a name.
 */
export function isUrlField(field: SemiField): boolean {
  const label = field.label.toLowerCase();
  if (field.type === "url") return true;
  if (field.type === "dropdown" || field.type === "date") return false;
  return label.includes("url") || (label.includes("website") && !label.includes("name"));
}

/** The bands an age question offers — the same as Meta's setup form. */
export const SEMI_AGE_BANDS = AGE_RANGES;

/**
 * An age question, shown as Meta's age ticks (2026-10-08).
 *
 * LinkedIn's details form arrived with its age question as plain text, so the
 * customer typed "20 to 45" or "adults" where Meta's setup offers ticks for
 * fixed bands — and the agent then had to make sense of free text. It is now
 * the same ticks (`AgeRangeChips`), WHATEVER the agent attached: "Targeting
 * Age" came with an options list on a text field, and a first version that
 * left anything with options alone kept it a typed box. Matched as a whole
 * word, so "Page", "Image", "Stage" and "Language" are not ages.
 */
export function isAgeField(field: SemiField): boolean {
  return /\bages?\b/i.test(field.label);
}

/**
 * A field whose answer is a phone number: typed `tel` / `phone`, or labelled
 * phone, mobile or WhatsApp. "Mobile app …" is an app, not a number, and a
 * dropdown is a choice, not something typed.
 */
export function isPhoneField(field: SemiField): boolean {
  if (field.type === "tel") return true;
  if (field.type === "dropdown" || field.type === "date") return false;
  return /phone|whatsapp|mobile(?!\s*app)/i.test(field.label);
}

/**
 * A bare host as a full address. The ad platforms refuse a landing page with
 * no scheme, and customers type `example.com` far more often than not.
 */
export function withScheme(value: string): string {
  if (value === "" || /^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  return `https://${value.replace(/^\/+/, "")}`;
}

/**
 * A dropdown's default in the option's own spelling. The schema can say
 * "all" for an option written "All"; React then selects nothing and the
 * browser shows the FIRST option, which is not what the agent chose. The
 * legacy renderer matched exactly, then ignoring case (`DynamicFormRenderer`).
 */
function matchDefaultToOption(field: SemiField): SemiField {
  if (field.type !== "dropdown" || field.defaultValue === "" || field.options.includes(field.defaultValue)) {
    return field;
  }
  const want = field.defaultValue.toLowerCase();
  const match = field.options.find((option) => option.toLowerCase() === want);
  return match ? { ...field, defaultValue: match } : field;
}

/** Meta's "Targeting OS" question (2026-10-01): "All" is not offered. */
const TARGETING_OS = /targeting\s*os/i;

function isRefusedOption(agentId: string, field: SemiField, option: string): boolean {
  return agentId === "meta-ads" && field.type === "dropdown" && TARGETING_OS.test(field.label) && option.trim().toLowerCase() === "all";
}

/**
 * The agent's schema, with the options we do not offer taken out.
 *
 * Meta's "Targeting OS" arrives with "All" — and preselected — and the
 * product owner wants the customer to choose an OS (2026-10-01). Removing the
 * option also clears a default of "All", so the select opens blank and stays
 * required rather than quietly submitting the option that was removed.
 */
export function adjustSemiFields(agentId: string, fields: SemiField[]): SemiField[] {
  return fields.map((field) => {
    if (!field.options.some((option) => isRefusedOption(agentId, field, option))) return field;
    return {
      ...field,
      options: field.options.filter((option) => !isRefusedOption(agentId, field, option)),
      defaultValue: isRefusedOption(agentId, field, field.defaultValue) ? "" : field.defaultValue,
    };
  });
}

/**
 * Answers to dropdowns, held to their options: a value the form never offered
 * (a removed "All", or anything a hand-made request sends) reads as
 * unanswered, so the required check names it. Matched ignoring case and
 * returned in the option's spelling. The location field is exempt — its
 * answer is the levels used, not one option.
 */
export function holdDropdownsToOptions(
  fields: SemiField[],
  answers: Record<string, string>,
): Record<string, string> {
  const out = { ...answers };
  for (const field of fields) {
    // An age question is answered with our bands (`isAgeField`), not the
    // agent's options — `readSemiAnswers` holds it to those instead.
    if (field.type !== "dropdown" || field.options.length === 0 || isLocationField(field) || isAgeField(field)) {
      continue;
    }
    const answer = out[field.label];
    if (!answer) continue;
    const match = field.options.find((option) => option.toLowerCase() === answer.toLowerCase());
    out[field.label] = match ?? "";
  }
  return out;
}

/**
 * Collects the answers, keyed by the labels the agent used.
 *
 * The form posts each field under `field:<label>` so a label containing a
 * bracket or a slash cannot collide with our own inputs (`automationMode`, the
 * creative files). The prefix is stripped here.
 */
export const SEMI_FIELD_PREFIX = "field:";

/** How several answers at one level (postcodes) travel as one string. */
export const ZIP_SEPARATOR = ", ";

export function readSemiAnswers(fields: SemiField[], form: FormData): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const field of fields) {
    // Ticks post one value each: kept only if they are bands, read as one
    // line, and "All" stands for itself rather than listing every band.
    if (isAgeField(field)) {
      const bands = form
        .getAll(`${SEMI_FIELD_PREFIX}${field.label}`)
        .map((value) => str(value))
        .filter((value) => (SEMI_AGE_BANDS as readonly string[]).includes(value));
      answers[field.label] = bands.includes("All") ? "All" : bands.join(", ");
      continue;
    }
    const answer = str(form.get(`${SEMI_FIELD_PREFIX}${field.label}`));

    // A phone number goes out WITH its country code, `+919876543210`: the
    // country is picked beside the box, and a bare number could belong to any
    // of a dozen countries. Without a pick it stays bare and is refused below.
    if (isPhoneField(field)) {
      answers[field.label] = internationalNumber(str(form.get(`${SEMI_FIELD_PREFIX}${field.label}${DIAL_SUFFIX}`)), answer);
      continue;
    }

    // `example.com` typed into a website field goes out as `https://example.com`.
    answers[field.label] = isUrlField(field) ? withScheme(answer) : answer;

    // The location picker (2026-10-01) posts every place as one JSON list
    // under `<label>_picks`. The field's own answer becomes the levels used
    // ("State, City, Zip Code"); `expandLocationAnswers` builds the rest.
    const picksName = `${SEMI_FIELD_PREFIX}${field.label}${PICKS_SUFFIX}`;
    if (isLocationField(field) && form.has(picksName)) {
      const picks = decodePicks(form.get(picksName));
      answers[`${field.label}${PICKS_SUFFIX}`] = encodePicks(picks);
      answers[field.label] = levelsUsed(picks);
      continue;
    }

    // Some controls post COMPANION inputs beside the schema field: the
    // location cascade answers "State" under the label, then the country,
    // state, city and postcode under `<label>_country` and friends. Reading
    // only the schema labels dropped every one of them, so the campaign
    // carried a kind of place and no place — the bug this loop exists to fix.
    for (const suffix of COMPANION_SUFFIXES) {
      // EVERY value, not the first: the postcode level posts one input per
      // postcode (2026-09-30 — a campaign can target several), and
      // `form.get` kept only the first. Joined into the one answer string the
      // rest of the flow already carries; duplicates and blanks dropped.
      const values = [
        ...new Set(
          form
            .getAll(`${SEMI_FIELD_PREFIX}${field.label}_${suffix}`)
            .map((value) => str(value))
            .filter((value) => value !== ""),
        ),
      ];
      if (values.length > 0) answers[`${field.label}_${suffix}`] = values.join(ZIP_SEPARATOR);
    }
  }
  return answers;
}

/** Required fields the customer left empty, by label. */
export function missingSemiAnswers(
  fields: SemiField[],
  answers: Record<string, string>,
): string[] {
  return fields
    .filter((f) => f.required && (answers[f.label] ?? "") === "")
    // A picked location's own problems ("Add at least one location.") are
    // `semiFormProblems`'; naming the bare "Location Type" as well says it twice.
    .filter((f) => !(`${f.label}${PICKS_SUFFIX}` in answers))
    .map((f) => f.label);
}

/**
 * The location question, as the agent asks it when it asks at all.
 *
 * Copied verbatim from a live `google-ads-semi` schema (2026-09-04) — the same
 * label, type and four options — so the answer goes back under the name that
 * workflow already reads.
 *
 * `meta-ads-semi` answers `{ received: true }` and no schema whatsoever, so
 * Meta campaigns had no location field on the details form at all: the only
 * place they were asked was the free-text "City or area" on the agent's setup
 * page. `withLocationField` adds this one so every ad platform asks the
 * question the same way.
 */
export const LOCATION_FIELD: SemiField = {
  label: "Location Type",
  type: "dropdown",
  placeholder: "Select location type",
  defaultValue: "",
  required: true,
  options: ["Country", "State", "City", "Zip Code"],
};

/** True for the field the location cascade renders. */
export function isLocationField(field: SemiField): boolean {
  return field.type === "dropdown" && field.label.toLowerCase().includes("location type");
}

/**
 * The agent's fields, guaranteed to include a location question.
 *
 * A campaign has to run somewhere, so this is not a field we are inventing for
 * the sake of it — it is the one question no ad platform can launch without.
 * When the agent already asks it, its own wording wins.
 */
export function withLocationField(fields: SemiField[]): SemiField[] {
  return fields.some(isLocationField) ? fields : [...fields, LOCATION_FIELD];
}

/** The kinds of place the agent offers, lower-cased for the payload keys. */
const LOCATION_KEYS: Record<string, string> = {
  Country: "country",
  State: "state",
  City: "city",
  "Zip Code": "zip",
};

/** Extra inputs a control may post beside its schema field, by suffix. */
const COMPANION_SUFFIXES = Object.values(LOCATION_KEYS);

/**
 * Turns the location cascade's answers into the shape the executor reads.
 *
 * A live `adsreceiver` body carries the place several ways: a display string,
 * a `_locations` array, and `_country` / `_state` / `_city` singles. The
 * cascade fills every level the customer walked down, so all of them are real
 * answers rather than the one value the earlier single-field version had.
 *
 * Two things this function decides:
 *
 * - **The display string is the whole address, narrowest first** — "Newark,
 *   New Jersey, United States", the way a person would say it. The flow shows
 *   that back to the customer, and "Newark" alone is ambiguous across the
 *   twenty-odd Newarks.
 * - **The `type` stays the KIND the customer chose**, not the deepest level
 *   answered. Picking City and filling the postcode anyway still means "target
 *   the city"; the granularity is a decision, not a side effect of typing.
 *
 * Sending nothing at all was the alternative, and it is worse: the campaign
 * then targets a KIND of place with no place, which is not a campaign.
 */
/**
 * The ad type the customer chose, from the details form's own answers.
 *
 * The agent asks for it — `Ad Type`, a dropdown of Image / Video / Carousel —
 * so nothing else should. A setup-form field for it was tried and removed the
 * same day: it asked before the agent had planned anything, and then the agent
 * asked again.
 *
 * Matched on the LABEL rather than a fixed key because `fieldLabel` is the key
 * (see the note at the top of this file) and the pipeline spells this one
 * several ways. The value is passed through lower-cased rather than mapped
 * onto `image | video`: `Carousel` is a real option in the agent's own
 * dropdown, and collapsing it to "image" would ask the creative writer for the
 * wrong thing while looking like it worked.
 *
 * Falls back to `image` — what `generate-prompts` was hardcoded to before any
 * of this, and the safer default of the two.
 */
export function adTypeFromAnswers(answers: Record<string, string>): string {
  for (const [label, value] of Object.entries(answers)) {
    const name = label.toLowerCase();
    if (!/ad\s*type|ad\s*format|creative\s*type|media\s*type/.test(name)) continue;
    const chosen = value.trim().toLowerCase();
    if (chosen !== "") return chosen;
  }
  return "image";
}

export function expandLocationAnswers(
  answers: Record<string, string>,
): Record<string, unknown> {
  const extra: Record<string, unknown> = {};

  // Picked locations (2026-10-01): EVERY place, at any mix of levels, under
  // the same keys the single-place path below fills — so a workflow branch
  // that reads `_city` still finds cities, now comma-joined, and `_locations`
  // holds one entry per place. Unconfirmed with the n8n owner which of those
  // each workflow reads; see CLAUDE.md.
  const picked = new Set<string>();
  for (const [key, raw] of Object.entries(answers)) {
    if (!key.endsWith(PICKS_SUFFIX)) continue;
    const label = key.slice(0, -PICKS_SUFFIX.length);
    picked.add(label);
    // Internal: the list is re-expressed below, so the JSON itself is not
    // sent on. `undefined` drops the key when this is spread over the answers.
    extra[key] = undefined;
    const picks = decodePicks(raw);
    if (picks.length === 0) continue;
    const summary = summarisePicks(picks);
    extra[label] = summary.location;
    for (const level of ["country", "state", "city", "zip"] as const) {
      if (summary[level]) extra[`${label}_${level}`] = summary[level];
    }
    extra[`${label}_locations`] = picks.map((pick) => ({
      type: pick.type,
      display: pickAddress(pick).join(", "),
      country: pick.country,
      ...(pick.state ? { state: pick.state } : {}),
      ...(pick.city ? { city: pick.city } : {}),
      ...(pick.zip ? { zip: pick.zip } : {}),
    }));
  }

  for (const [label, kind] of Object.entries(answers)) {
    const key = LOCATION_KEYS[kind];
    // Only the field holding the kind itself; its own companions are skipped.
    if (!key || label.includes("_") || picked.has(label)) continue;

    const parts: Record<string, string> = {};
    for (const [name, suffix] of Object.entries(LOCATION_KEYS)) {
      const answer = answers[`${label}_${suffix}`];
      if (answer) {
        parts[suffix] = answer;
        extra[`${label}_${suffix}`] = answer;
      }
      // Stop at the level the customer targeted: a postcode typed and then
      // narrowed back to City is not part of the address any more.
      if (name === kind) break;
    }

    // Two separators, deliberately, because the captured `adsreceiver` body
    // uses two (2026-09-03):
    //
    //   "Location Type":          "Newark > New Jersey > United States"
    //   "…_locations[0].display": "Newark, New Jersey, United States"
    //
    // The top-level string is the one a workflow branch splits on, so its
    // separator is not cosmetic. Ours sent ", " for both.
    const ordered = Object.values(parts).reverse();
    const display = ordered.join(", ");
    const headline = ordered.join(" > ");
    if (display === "") continue;

    extra[label] = headline;
    // NOTE: the captured body also carries `countryCode: "US"` and
    // `stateCode: "NJ"`. The location cascade never collects them — it posts
    // names only — so they are absent rather than guessed. Sending a wrong
    // code would target the wrong country, which is worse than sending none.
    //
    // Several postcodes are several PLACES, so each gets its own entry in
    // `_locations` — the array exists to hold more than one. The `_zip`
    // single keeps the joined list. (Unconfirmed with the n8n owner which one
    // the executor reads; both are sent, the same rule as the other names.)
    const zips = key === "zip" && parts.zip ? parts.zip.split(ZIP_SEPARATOR).filter(Boolean) : [];
    extra[`${label}_locations`] =
      zips.length > 1
        ? zips.map((zip) => {
            const one = { ...parts, zip };
            return { type: key, display: Object.values(one).reverse().join(", "), ...one };
          })
        : [{ type: key, display, ...parts }];
  }

  return extra;
}

/* ---------- checks the browser also makes, repeated where they count ---------- */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The schema's start and end dates, found by label — the agent names them. */
export function dateRangeFields(fields: SemiField[]): { start: SemiField | null; end: SemiField | null } {
  const dated = fields.filter((field) => field.type === "date");
  return {
    start: dated.find((field) => /start/i.test(field.label)) ?? null,
    end: dated.find((field) => /end/i.test(field.label)) ?? null,
  };
}

/**
 * What stops these answers becoming a campaign, beyond empty required fields.
 *
 * Both checks are made in the browser too, but a form can be posted without
 * that browser, and the ad platforms refuse a campaign that ends before it
 * starts — after we have told the customer it is being created.
 *
 * - The end date must be AFTER the start date (the legacy flow's rule).
 * - Targeting by postcode needs the country and at least one postcode; the
 *   state and city are optional there (2026-09-30) — they only narrow the
 *   postcode list. Targeting by State or City needs every level above it.
 * - A phone number needs its country code, and enough digits to be a real
 *   number in international form (`isPlausibleInternational`). It replaced a
 *   flat "ten digits" rule (legacy spec), which refused most of the world
 *   once the country code was asked for. An empty answer is left to the
 *   required check, which names the field.
 */
export const PHONE_PROBLEM = "Enter a valid phone number";

export function phoneCodeProblem(label: string): string {
  return `Choose the country code for ${label}.`;
}

export function semiFormProblems(fields: SemiField[], answers: Record<string, string>): string[] {
  const problems: string[] = [];

  let badPhone = false;
  for (const field of fields.filter(isPhoneField)) {
    const answer = (answers[field.label] ?? "").trim();
    if (answer === "") continue;
    // No `+` means no country was picked (`readSemiAnswers` adds it).
    if (!answer.startsWith("+")) problems.push(phoneCodeProblem(field.label));
    else if (!isPlausibleInternational(answer)) badPhone = true;
  }
  if (badPhone) problems.push(PHONE_PROBLEM);

  const { start, end } = dateRangeFields(fields);
  const from = start ? (answers[start.label] ?? "") : "";
  const to = end ? (answers[end.label] ?? "") : "";
  if (DAY.test(from) && DAY.test(to) && to <= from) {
    problems.push(`${end?.label ?? "End date"} must be after ${start?.label ?? "the start date"}.`);
  }

  for (const field of fields.filter(isLocationField)) {
    const picks = answers[`${field.label}${PICKS_SUFFIX}`];
    if (picks !== undefined) {
      problems.push(...pickProblems(decodePicks(picks)));
      continue;
    }
    const kind = answers[field.label] ?? "";
    const part = (suffix: string) => (answers[`${field.label}_${suffix}`] ?? "") !== "";
    if (kind === "Zip Code") {
      if (!part("country")) problems.push("Choose the country for the postcodes.");
      if (!part("zip")) problems.push("Add at least one postcode.");
    } else if (kind === "City") {
      if (!part("country") || !part("state") || !part("city")) {
        problems.push("Choose the country, state and city to target.");
      }
    } else if (kind === "State") {
      if (!part("country") || !part("state")) problems.push("Choose the country and state to target.");
    } else if (kind === "Country") {
      if (!part("country")) problems.push("Choose the country to target.");
    }
  }

  return problems;
}
