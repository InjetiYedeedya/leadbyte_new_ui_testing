"use client";

/**
 * A choice from the customer's own ad account: saved audiences, a lead form,
 * store locations (`lib/data/ads-lists.ts`).
 *
 * ## Why this earns `"use client"`
 *
 * The list exists only once the customer has made the choice that needs it —
 * picked Retargeting, or the Leads → Forms goal — and it is read LIVE from
 * their ad account, which can take several seconds. Loading it with every
 * setup form would make everyone wait for a list most people never open. It
 * asks our Route Handler (`/api/ads/lists`), never the backend.
 *
 * Every picked option posts as a small JSON pick (`encodePick`) under `name`,
 * so the server knows the id AND the name without a second lookup, and
 * re-validates it (`decodePicks`).
 *
 * States, each its own words (legacy guide §3): loading, "Unable to load …
 * Please try again." with a retry, empty, and the list.
 *
 * Two extras a caller can ask for: `extraOption`, a choice that does not come
 * from the account and is offered after its list whatever the list holds
 * (Meta's "+ Create custom form"), and `count`, a "Select all" control and an
 * "N selected" line for a several-pick list long enough to want them.
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Spinner } from "@/components/ui/spinner";
import {
  encodePick,
  type AdsListKind,
  type AdsListOption,
  type AdsListPlatform,
} from "@/lib/data/ads-lists";

type Load = { phase: "loading" } | { phase: "failed" } | { phase: "ready"; options: AdsListOption[] };

/** A choice offered after the account's own list, e.g. "create one for me". */
export interface ExtraListOption {
  /** What the row says: "+ Create custom form". */
  label: string;
  /** Its second line. */
  detail: string;
  /** What it posts, exactly like a listed option. */
  pick: AdsListOption;
}

export function AdsListPicker({
  platform,
  kind,
  name,
  label,
  multiple,
  what,
  empty,
  requireProfile = false,
  extraOption,
  count,
  emptyAction,
}: {
  platform: AdsListPlatform;
  kind: AdsListKind;
  name: string;
  label: string;
  /** Several picks (audiences, stores) or exactly one (a lead form). */
  multiple: boolean;
  /** "saved audiences" — for "Unable to load saved audiences." */
  what: string;
  /** Said when the account genuinely has none. */
  empty: string;
  /**
   * Store locations only: a location with no Google Business Profile id
   * cannot be used by a local campaign, so it is shown but cannot be picked.
   */
  requireProfile?: boolean;
  /** Offered after the list, and on its own when the list is empty or failed to load. */
  extraOption?: ExtraListOption;
  /** Several picks only: words for "N audience(s) selected", which also turns on Select all. */
  count?: { one: string; many: string };
  /** A way out of the empty state, e.g. "Switch to new audience". */
  emptyAction?: { label: string; onClick: () => void };
}) {
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  // Several-pick lists with a count only: which ids are ticked. Controlled, so
  // Select all ticks the real inputs and the count cannot drift from them.
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [attempt, setAttempt] = useState(0);
  // From the field name, not `useId()`: on the agent page the server and the
  // browser numbered `useId` differently (a hydration mismatch, 2026-10-02),
  // and the field name is already unique within its form.
  const legendId = `${name}-legend`;

  const fetchList = useCallback(async (signal: AbortSignal) => {
    setLoad({ phase: "loading" });
    try {
      const response = await fetch(`/api/ads/lists?${new URLSearchParams({ platform, kind })}`, { signal });
      const body = (await response.json()) as { ok?: boolean; options?: AdsListOption[] };
      if (!response.ok || body.ok !== true) {
        setLoad({ phase: "failed" });
        return;
      }
      setLoad({ phase: "ready", options: Array.isArray(body.options) ? body.options : [] });
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") return;
      setLoad({ phase: "failed" });
    }
  }, [platform, kind]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchList(controller.signal);
    return () => controller.abort();
  }, [fetchList, attempt]);

  const usable = load.phase === "ready" ? load.options.filter((o) => !requireProfile || o.profileId !== "") : [];
  const showCount = multiple && count !== undefined && usable.length >= 2;
  const ticked = usable.filter((o) => checked.has(o.id)).length;
  const allTicked = usable.length > 0 && ticked === usable.length;
  const extraRow = extraOption && (load.phase === "ready" || load.phase === "failed") && (
    <ExtraRow option={extraOption} name={name} multiple={multiple} />
  );

  const toggle = (id: string) => (event: ChangeEvent<HTMLInputElement>) => {
    const on = event.target.checked;
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <fieldset aria-labelledby={legendId} aria-busy={load.phase === "loading"} className="mt-3 border-0 p-0">
      <legend id={legendId} className="mb-1.5 block p-0 text-sm text-ink">
        {label}
        <span className="text-crit" aria-hidden="true">
          {" *"}
        </span>
      </legend>

      {load.phase === "loading" && (
        <p className="flex items-center gap-2 text-sm text-ink-soft" role="status">
          <Spinner /> Loading {what} from your ad account…
        </p>
      )}

      {load.phase === "failed" && (
        <div role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-sm text-ink">
          Unable to load {what}. Please try again.{" "}
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="font-medium text-ink underline underline-offset-2 hover:text-accent-ink"
          >
            Try again
          </button>
        </div>
      )}

      {load.phase === "ready" && load.options.length === 0 && (
        <div className="rounded-md bg-surface-raised px-3 py-2 text-sm text-ink-soft">
          <p>{empty}</p>
          {emptyAction && (
            <button
              type="button"
              onClick={emptyAction.onClick}
              className="mt-2 min-h-11 rounded-md border border-border bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-raised"
            >
              {emptyAction.label}
            </button>
          )}
        </div>
      )}

      {/* Nothing listed: the extra choice stands on its own. */}
      {extraRow && (load.phase === "failed" || load.options.length === 0) && (
        <ul className="mt-2 rounded-md border border-border bg-surface">{extraRow}</ul>
      )}

      {load.phase === "ready" && load.options.length > 0 && (
        <>
          {requireProfile && usable.length === 0 && (
            <div role="status" className="mb-2 rounded-md bg-warn-soft px-3 py-2 text-sm text-ink">
              <p className="font-medium">Connect your Google Business Profile (GMB)</p>
              <p className="mt-0.5">
                We couldn&apos;t find a location ID for your business. A local store campaign can only run once
                your business is connected to Google Business Profile. Please connect it, then refresh.
              </p>
              <a
                href="https://business.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block font-medium underline underline-offset-2"
              >
                Open Google Business Profile
              </a>
            </div>
          )}
          {showCount && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="text-ink-soft" aria-live="polite">
                {ticked} {ticked === 1 ? count.one : count.many} selected
              </p>
              <button
                type="button"
                onClick={() => setChecked(allTicked ? new Set() : new Set(usable.map((o) => o.id)))}
                className="min-h-9 rounded-md border border-border bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-raised"
              >
                {allTicked ? "Deselect all" : "Select all"}
              </button>
            </div>
          )}
          <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border bg-surface">
            {load.options.map((option, index) => {
              const disabled = requireProfile && option.profileId === "";
              return (
                <li key={option.id}>
                  <label
                    className={`flex min-h-11 items-start gap-3 px-3 py-2 text-sm ${
                      disabled ? "cursor-not-allowed text-ink-soft" : "cursor-pointer text-ink hover:bg-surface-raised"
                    }`}
                  >
                    <input
                      type={multiple ? "checkbox" : "radio"}
                      name={name}
                      value={encodePick(option)}
                      disabled={disabled}
                      // A single choice is required natively; the first radio carries it.
                      required={!multiple && index === 0}
                      {...(showCount ? { checked: checked.has(option.id), onChange: toggle(option.id) } : {})}
                      className="mt-0.5 accent-accent"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{option.name}</span>
                      {(option.detail || disabled) && (
                        <span className="block truncate text-xs text-ink-soft">
                          {disabled ? "No Business Profile ID — can't be used for a local campaign" : option.detail}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
            {extraRow}
          </ul>
        </>
      )}
    </fieldset>
  );
}

function ExtraRow({ option, name, multiple }: { option: ExtraListOption; name: string; multiple: boolean }) {
  return (
    <li>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2 text-sm text-ink hover:bg-surface-raised">
        <input
          type={multiple ? "checkbox" : "radio"}
          name={name}
          value={encodePick(option.pick)}
          // Required too: when it is the only row, it is what makes the choice required.
          required={!multiple}
          className="mt-0.5 accent-accent"
        />
        <span className="min-w-0">
          <span className="block font-medium">{option.label}</span>
          <span className="block text-xs text-ink-soft">{option.detail}</span>
        </span>
      </label>
    </li>
  );
}

/** New audience, or retargeting people from saved audiences (legacy step 5). */
export function AudienceChoice({ platform }: { platform: AdsListPlatform }) {
  const [type, setType] = useState<"new" | "retargeting">("new");
  // Where focus goes after "Switch to new audience": the button that had it
  // unmounts with the list, and focus left on <body> loses the reader's place.
  const newRadio = useRef<HTMLInputElement>(null);
  return (
    <div className="mb-4">
      <fieldset className="border-0 p-0">
        <legend className="mb-1.5 block p-0 text-sm text-ink">Who to reach</legend>
        <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-surface-raised p-1">
          {(
            [
              ["new", "A new audience"],
              ["retargeting", "People who already know you"],
            ] as const
          ).map(([value, text]) => (
            <label
              key={value}
              className={`inline-flex min-h-11 cursor-pointer items-center rounded-md px-4 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                type === value ? "bg-accent font-medium text-surface" : "text-ink-soft hover:bg-surface hover:text-ink"
              }`}
            >
              <input
                type="radio"
                name="audienceType"
                value={value}
                checked={type === value}
                onChange={() => setType(value)}
                ref={value === "new" ? newRadio : undefined}
                className="sr-only"
              />
              {text}
            </label>
          ))}
        </div>
      </fieldset>
      {type === "retargeting" && (
        <AdsListPicker
          platform={platform}
          kind="audiences"
          name="retargetingAudience"
          label="Saved audiences to retarget"
          multiple
          what="saved audiences"
          empty="This ad account has no saved audiences yet. Target a new audience instead, or create one in your ad account first."
          count={{ one: "audience", many: "audiences" }}
          emptyAction={{
            label: "Switch to new audience",
            onClick: () => {
              setType("new");
              newRadio.current?.focus();
            },
          }}
        />
      )}
    </div>
  );
}
