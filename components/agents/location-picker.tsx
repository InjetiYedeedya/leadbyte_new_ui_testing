"use client";

/**
 * Where the ads run — as many places as the campaign needs, at any mix of
 * levels: whole countries, states, cities and postcodes, side by side
 * (2026-10-01). It replaced `LocationTarget`, which held one country, one
 * state and one city, so "Texas and California" could not be said at all.
 *
 * ## Why this is a client island
 *
 * The lists depend on a choice made a moment ago (a country's states, a
 * state's cities), and a postcode is checked as it is added. It still never
 * talks to a third party: it asks `/api/locations`, which owns the upstreams.
 * Countries arrive as a prop, fetched on the server.
 *
 * ## The rules it keeps
 *
 * - **One list of picks, above the tabs.** A tab only chooses what you are
 *   adding, so switching from State to City never removes a state.
 * - **No duplicates.** A place already picked shows as ticked; ticking it
 *   again does nothing (`addPicks`, the same rule the server applies).
 * - **Nothing vanishes silently.** A postcode that fails its check is not
 *   added and is NAMED in an error, and it stays in the box to be fixed; every
 *   other pick stays where it was. Clearing everything asks first.
 * - **Every list degrades to typing.** When a list cannot load, a place can
 *   be typed and added; its chip says it was not checked. Someone else's API
 *   being down must never block a campaign.
 *
 * The form receives one hidden input of JSON (`encodePicks`), read on the
 * server with `decodePicks`. An invisible required box carries the "Add at
 * least one location." message, because a hidden input cannot be `required`.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { SETTLE_MS, loadOptions } from "@/components/agents/location-target";
import {
  MAX_PICKS,
  PICK_LEVELS,
  addPicks,
  decodePicks,
  encodePicks,
  hasPick,
  pickDisplay,
  pickKey,
  removePick,
  type LocationPick,
  type PickLevel,
} from "@/lib/data/location-picks";

const TAB_LABEL: Record<PickLevel, string> = {
  country: "Country",
  state: "State",
  city: "City",
  zip: "ZIP Code",
};

const GROUP_LABEL: Record<PickLevel, string> = {
  country: "Countries",
  state: "States",
  city: "Cities",
  zip: "ZIP codes",
};

/** A long list is narrowed by typing, not by scrolling through thousands. */
const SHOW_AT_MOST = 200;

const CONTROL =
  "w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-ink disabled:bg-surface-raised disabled:text-ink-soft";
const BUTTON =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-raised disabled:opacity-60";

type PostcodeAnswer =
  | { status: "valid"; state?: string; city?: string }
  | { status: "invalid" }
  | { status: "unknown" };

async function checkPostcode(country: string, code: string): Promise<PostcodeAnswer> {
  try {
    const response = await fetch(`/api/locations?${new URLSearchParams({ kind: "postcode", country, code })}`);
    if (!response.ok) return { status: "unknown" };
    const body = (await response.json()) as PostcodeAnswer;
    return body?.status === "valid" || body?.status === "invalid" ? body : { status: "unknown" };
  } catch {
    // A dropped connection is "could not check", never "no such code".
    return { status: "unknown" };
  }
}

/**
 * Postcodes typed or pasted into the box. Commas, semicolons and new lines
 * separate them; a space separates only all-digit codes ("10001 90210"), so a
 * UK "SW1A 1AA" stays one code — the legacy picker split it in two.
 */
export function splitPostcodes(text: string): string[] {
  const out: string[] = [];
  for (const chunk of text.split(/[,;\n]+/)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length > 1 && parts.every((part) => /^\d+$/.test(part))) out.push(...parts);
    else out.push(trimmed.replace(/\s+/g, " ").toUpperCase());
  }
  return [...new Set(out)];
}

/** A list we fetch when its parent is chosen. `null` means "not asked yet". */
function useList(query: Record<string, string> | null): { options: string[] | null; loading: boolean } {
  const key = query ? new URLSearchParams(query).toString() : "";
  const [state, setState] = useState<{ key: string; options: string[] | null }>({ key: "", options: null });

  useEffect(() => {
    if (!key) return;
    let live = true;
    const timer = window.setTimeout(async () => {
      const options = await loadOptions(Object.fromEntries(new URLSearchParams(key)));
      if (live) setState({ key, options });
    }, SETTLE_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [key]);

  if (!key) return { options: null, loading: false };
  return state.key === key ? { options: state.options, loading: false } : { options: null, loading: true };
}

/** A searchable list of checkboxes — the "searchable dropdown", left open. */
function CheckList({
  label,
  options,
  isChecked,
  onToggle,
}: {
  label: string;
  options: string[];
  isChecked: (option: string) => boolean;
  onToggle: (option: string, checked: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const id = useId();
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? options.filter((option) => option.toLowerCase().includes(needle)) : options;
  }, [options, query]);
  const shown = matches.slice(0, SHOW_AT_MOST);

  return (
    <div>
      <label htmlFor={`${id}-search`} className="mb-1 block text-sm text-ink">
        Search {label.toLowerCase()}
      </label>
      <input
        id={`${id}-search`}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          // Enter in a search box must not submit the campaign.
          if (event.key === "Enter") event.preventDefault();
        }}
        aria-controls={`${id}-list`}
        placeholder={`Type to find a ${label.toLowerCase().replace(/s$/, "").replace(/ie$/, "y")}`}
        autoComplete="off"
        className={CONTROL}
      />
      <p className="mt-1 text-xs text-ink-soft" aria-live="polite">
        {matches.length === 0
          ? "Nothing matches that."
          : matches.length > shown.length
            ? `Showing ${shown.length} of ${matches.length.toLocaleString("en")}. Type to narrow it down.`
            : `${matches.length.toLocaleString("en")} ${matches.length === 1 ? "match" : "matches"}.`}
      </p>
      {shown.length > 0 && (
        <ul
          id={`${id}-list`}
          aria-label={label}
          className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border bg-surface"
        >
          {shown.map((option) => {
            const checked = isChecked(option);
            return (
              <li key={option} className="border-b border-border last:border-b-0">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm text-ink hover:bg-surface-raised">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => onToggle(option, event.target.checked)}
                    className="size-4 shrink-0 accent-accent"
                  />
                  <span className="min-w-0 truncate">{option}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A box to type a place into and add it, for when no list could load. */
function TypeIn({
  label,
  placeholder,
  onAdd,
}: {
  label: string;
  placeholder: string;
  onAdd: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const id = useId();
  const add = () => {
    if (!value.trim()) return;
    onAdd(value.trim());
    setValue("");
  };
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-ink">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={id}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className={`${CONTROL} min-w-0 flex-1`}
        />
        <button type="button" onClick={add} disabled={!value.trim()} className={BUTTON}>
          Add
        </button>
      </div>
      <p className="mt-1 text-xs text-ink-soft">We couldn&rsquo;t load a list here, so type it in.</p>
    </div>
  );
}

/** One parent choice: a dropdown of the list, or a text box without one. */
function ParentField({
  label,
  value,
  options,
  loading,
  onChange,
}: {
  label: string;
  value: string;
  options: string[] | null;
  loading?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-sm text-ink">
        {label}
      </label>
      {options && options.length > 0 ? (
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={CONTROL}>
          <option value="">Choose a {label.toLowerCase()}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-busy={loading}
          disabled={loading}
          placeholder={loading ? "Loading…" : `Type a ${label.toLowerCase()}`}
          className={CONTROL}
        />
      )}
    </div>
  );
}

export function LocationPicker({
  name,
  countries,
  levels = [...PICK_LEVELS],
  initialPicks = [],
  required = true,
  title = "Where should the ads run?",
}: {
  /** The hidden input's name; it posts `encodePicks(picks)`. */
  name: string;
  countries: string[];
  /** The tabs offered, in level order. The details form passes the agent's own options. */
  levels?: PickLevel[];
  initialPicks?: LocationPick[];
  required?: boolean;
  title?: string;
}) {
  const offered = PICK_LEVELS.filter((level) => levels.includes(level));
  const [picks, setPicks] = useState<LocationPick[]>(() => addPicks([], initialPicks));
  const [tab, setTab] = useState<PickLevel>(offered[0] ?? "country");
  // The parents are shared by the tabs: choose the United States once.
  const [country, setCountry] = useState(initialPicks.find((p) => p.country)?.country ?? "");
  const [state, setState] = useState("");
  const [zipDraft, setZipDraft] = useState("");
  const [zipError, setZipError] = useState("");
  const [checking, setChecking] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const id = useId();
  const hiddenRef = useRef<HTMLInputElement>(null);
  const startedWith = useRef(encodePicks(addPicks([], initialPicks)));
  const validityRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Partial<Record<PickLevel, HTMLButtonElement | null>>>({});

  const states = useList(country && (tab === "state" || tab === "city") ? { kind: "states", country } : null);
  const cities = useList(country && state && tab === "city" ? { kind: "cities", country, state } : null);

  // A draft restored by `FormDraft` writes the hidden input and fires `input`.
  useEffect(() => {
    const hidden = hiddenRef.current;
    if (!hidden) return;
    const restore = () => setPicks(addPicks([], decodePicks(hidden.value)));
    // The draft may have been written before this listener existed — its
    // effect runs first when it sits earlier in the form — so check once.
    // (A hidden input's `defaultValue` moves with its value, so compare with
    // the list this picker started from.)
    if (hidden.value !== startedWith.current) restore();
    hidden.addEventListener("input", restore);
    return () => hidden.removeEventListener("input", restore);
  }, []);

  useEffect(() => {
    validityRef.current?.setCustomValidity(required && picks.length === 0 ? "Add at least one location." : "");
  }, [required, picks.length]);

  // Removing a chip or clearing all fires no form event of its own, so the
  // draft autosave (`FormDraft`, which listens for change) would miss it. A
  // bubbling change on the hidden input tells it. Not `input`: that is the
  // restore signal above.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    hiddenRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [picks]);

  const add = (pick: LocationPick) => setPicks((list) => addPicks(list, [pick]));
  const remove = (pick: LocationPick) => setPicks((list) => removePick(list, pick));
  const toggle = (pick: LocationPick, on: boolean) => (on ? add(pick) : remove(pick));

  function changeCountry(next: string) {
    setCountry(next);
    // A state belongs to one country; the picks already made are untouched.
    setState("");
    setZipError("");
  }

  async function addPostcodes() {
    const codes = splitPostcodes(zipDraft).filter((zip) => !hasPick(picks, { type: "zip", country, zip }));
    if (!country || codes.length === 0) {
      setZipDraft("");
      return;
    }
    setChecking(true);
    setZipError("");
    const answers = await Promise.all(codes.map((zip) => checkPostcode(country, zip)));
    const added: LocationPick[] = [];
    const invalid: string[] = [];
    answers.forEach((answer, index) => {
      const zip = codes[index]!;
      if (answer.status === "invalid") invalid.push(zip);
      else if (answer.status === "valid")
        added.push({ type: "zip", country, zip, ...(answer.state ? { state: answer.state } : {}), ...(answer.city ? { city: answer.city } : {}) });
      else added.push({ type: "zip", country, zip, unchecked: true });
    });
    setPicks((list) => addPicks(list, added));
    // The ones that failed stay in the box, to be corrected rather than retyped.
    setZipDraft(invalid.join(", "));
    if (invalid.length === 1) setZipError(`${invalid[0]} isn't a postcode in ${country}. Check it and add it again.`);
    else if (invalid.length > 1) setZipError(`These aren't postcodes in ${country}: ${invalid.join(", ")}. Check them and add them again.`);
    setChecking(false);
  }

  function onTabKey(event: React.KeyboardEvent, level: PickLevel) {
    const index = offered.indexOf(level);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = offered[(index + step + offered.length) % offered.length]!;
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  const countryField = (
    <ParentField label="Country" value={country} options={countries} onChange={changeCountry} />
  );

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 id={`${id}-title`} className="text-sm font-semibold text-ink">
        {title}
        {required && (
          <span className="text-crit" aria-hidden="true">
            {" *"}
          </span>
        )}
      </h3>
      <p className="mt-0.5 text-sm text-ink-soft">
        Add as many places as you need, at any level. Switching tabs keeps what you have added.
      </p>

      <input ref={hiddenRef} type="hidden" name={name} value={encodePicks(picks)} data-draft="keep" />
      {/* Carries the browser's "required" message; never posted (no name). */}
      <input
        ref={validityRef}
        tabIndex={-1}
        aria-hidden="true"
        required={required}
        value={picks.length > 0 ? String(picks.length) : ""}
        onChange={() => {}}
        className="sr-only"
      />

      {offered.length > 1 && (
        <div role="tablist" aria-labelledby={`${id}-title`} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {offered.map((level) => (
            <button
              key={level}
              ref={(element) => {
                tabRefs.current[level] = element;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${level}`}
              aria-selected={tab === level}
              aria-controls={`${id}-panel`}
              tabIndex={tab === level ? 0 : -1}
              onClick={() => setTab(level)}
              onKeyDown={(event) => onTabKey(event, level)}
              className={`min-h-11 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                tab === level
                  ? "border-accent bg-accent/10 text-accent-ink"
                  : "border-border bg-surface text-ink hover:bg-surface-raised"
              }`}
            >
              {TAB_LABEL[level]}
            </button>
          ))}
        </div>
      )}

      <div
        id={`${id}-panel`}
        role={offered.length > 1 ? "tabpanel" : undefined}
        aria-labelledby={offered.length > 1 ? `${id}-tab-${tab}` : undefined}
        className="mt-3 space-y-3"
      >
        {tab === "country" &&
          (countries.length > 0 ? (
            <CheckList
              label="Countries"
              options={countries}
              isChecked={(option) => hasPick(picks, { type: "country", country: option })}
              onToggle={(option, on) => toggle({ type: "country", country: option }, on)}
            />
          ) : (
            <TypeIn label="Country" placeholder="United States" onAdd={(value) => add({ type: "country", country: value, unchecked: true })} />
          ))}

        {tab === "state" && (
          <>
            {countryField}
            {country &&
              (states.loading ? (
                <p className="text-sm text-ink-soft" aria-live="polite">
                  Loading states…
                </p>
              ) : states.options && states.options.length > 0 ? (
                <CheckList
                  label="States"
                  options={states.options}
                  isChecked={(option) => hasPick(picks, { type: "state", country, state: option })}
                  onToggle={(option, on) => toggle({ type: "state", country, state: option }, on)}
                />
              ) : (
                <TypeIn label="State or region" placeholder="New York" onAdd={(value) => add({ type: "state", country, state: value, unchecked: true })} />
              ))}
          </>
        )}

        {tab === "city" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {countryField}
              {country && (
                <ParentField
                  label="State"
                  value={state}
                  options={states.options}
                  loading={states.loading}
                  onChange={setState}
                />
              )}
            </div>
            {country &&
              state &&
              (cities.loading ? (
                <p className="text-sm text-ink-soft" aria-live="polite">
                  Loading cities…
                </p>
              ) : cities.options && cities.options.length > 0 ? (
                <CheckList
                  label="Cities"
                  options={cities.options}
                  isChecked={(option) => hasPick(picks, { type: "city", country, state, city: option })}
                  onToggle={(option, on) => toggle({ type: "city", country, state, city: option }, on)}
                />
              ) : (
                <TypeIn label="City" placeholder="Los Angeles" onAdd={(value) => add({ type: "city", country, state, city: value, unchecked: true })} />
              ))}
          </>
        )}

        {tab === "zip" && (
          <>
            {countryField}
            {country && (
              <div>
                <label htmlFor={`${id}-zip`} className="mb-1 block text-sm text-ink">
                  ZIP or postcodes
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    id={`${id}-zip`}
                    value={zipDraft}
                    onChange={(event) => {
                      setZipDraft(event.target.value);
                      setZipError("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void addPostcodes();
                      }
                    }}
                    disabled={checking}
                    aria-invalid={zipError !== ""}
                    aria-describedby={`${id}-zip-hint`}
                    placeholder="10001, 90210, 75201"
                    autoComplete="off"
                    className={`${CONTROL} min-w-0 flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => void addPostcodes()}
                    disabled={checking || !zipDraft.trim()}
                    aria-busy={checking}
                    className={BUTTON}
                  >
                    {checking ? "Checking…" : "Add"}
                  </button>
                </div>
                <p id={`${id}-zip-hint`} className="mt-1 text-xs text-ink-soft" aria-live="polite">
                  {zipError ? (
                    <span role="alert" className="text-crit">
                      {zipError}
                    </span>
                  ) : (
                    "Type one, or paste several separated by commas. Each is checked as it is added."
                  )}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-ink" aria-live="polite">
            Selected locations: {picks.length}
          </p>
          {picks.length > 0 &&
            (confirmClear ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-ink">
                  Remove all {picks.length} {picks.length === 1 ? "location" : "locations"}?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPicks([]);
                    setConfirmClear(false);
                  }}
                  className="min-h-11 rounded-md bg-crit px-3 font-medium text-surface hover:opacity-90"
                >
                  Remove all
                </button>
                <button type="button" onClick={() => setConfirmClear(false)} className={BUTTON}>
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="min-h-11 rounded-md px-2 text-sm font-medium text-crit underline underline-offset-2 hover:opacity-80"
              >
                Clear all
              </button>
            ))}
        </div>

        {picks.length >= MAX_PICKS && (
          <p className="mt-1 text-sm text-warn" role="status">
            That&rsquo;s the most one campaign can hold ({MAX_PICKS}). Remove one to add another.
          </p>
        )}

        {picks.length === 0 ? (
          <p className="mt-1 text-sm text-ink-soft">Nothing added yet.</p>
        ) : (
          <div className="mt-2 space-y-3">
            {PICK_LEVELS.map((level) => {
              const group = picks.filter((pick) => pick.type === level);
              if (group.length === 0) return null;
              return (
                <div key={level}>
                  <h4 className="text-xs font-medium text-ink-soft">
                    {GROUP_LABEL[level]} ({group.length})
                  </h4>
                  <ul aria-label={GROUP_LABEL[level]} className="mt-1 flex flex-wrap gap-2">
                    {group.map((pick) => {
                      const text = pickDisplay(pick);
                      return (
                        <li
                          key={pickKey(pick)}
                          className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-surface-raised pl-3 text-sm text-ink"
                        >
                          <span className="min-w-0 truncate">
                            {text}
                            {pick.unchecked && <span className="text-ink-soft"> · not checked</span>}
                          </span>
                          <button
                            type="button"
                            onClick={() => remove(pick)}
                            aria-label={`Remove ${text}`}
                            className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink-soft hover:bg-surface hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                          >
                            <span aria-hidden="true">×</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
