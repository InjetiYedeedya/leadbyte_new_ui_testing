"use client";

/**
 * A setup form's unsent answers, kept in THIS browser so a refresh does not
 * lose them — and a "Clear data" that starts over, after asking.
 *
 * ## Why this earns `"use client"`
 *
 * Saving on every keystroke and restoring on load are browser events and
 * browser storage. The legacy app kept drafts in a backend table as well; here
 * they are a per-viewer convenience only (`localStorage`, inside try/catch —
 * private windows throw), which is all a draft is: the campaign itself is
 * never read from it.
 *
 * ## What it does NOT keep
 *
 * Files, anything whose name looks like a password or key, and the live-list
 * picks (audiences, lead forms, stores) — those load from the ad account
 * after the page does, so a restored pick could name an option no longer
 * offered. They are simply asked again.
 *
 * Restoring sets each field the way a person would (`click()` for a box,
 * a real input event for text), so the form's interactive parts — the goal
 * and its detail, who to reach — follow along exactly as if typed.
 *
 * The key carries a hash of the account, so a second person on the same
 * browser never sees the first one's campaign.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";

type Saved = { savedAt: number; entries: [string, string][]; v?: number };

/**
 * The draft format. Version 2 (2026-10-02): the budget type stopped being
 * pre-picked ("Select type"), so every earlier draft holds "daily" whether or
 * not anyone chose it — restoring it put the old default back. Older drafts
 * keep every other answer and drop the ones listed in `STALE_BEFORE_V2`.
 */
const DRAFT_VERSION = 2;
const STALE_BEFORE_V2 = new Set(["budgetType"]);

const SKIP = /pass|token|secret|apikey|api_key|^retargetingAudience$|^leadForm$|^storeLocation$/i;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const SAVE_DELAY_MS = 500;

function readSaved(key: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Saved;
    if (!Array.isArray(parsed.entries) || Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function forget(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to forget, or storage refused.
  }
}

/** Sets one element to its saved answer, through the events React listens to. */
function apply(element: Element, values: string[]): void {
  if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
    const want = values.includes(element.value);
    if (element.checked !== want && !(element.type === "radio" && !want)) element.click();
    return;
  }
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    // A hidden input is restored only when it asks to be: the location
    // picker keeps its whole list in one (`data-draft="keep"`) and listens for
    // the input event below to reload it. Other hidden inputs are written by
    // the page and must not be overwritten with an old value.
    if (element.type === "file") return;
    if (element.type === "hidden" && element.getAttribute("data-draft") !== "keep") return;
    const value = values[0] ?? "";
    if (element.value === value) return;
    const proto = Object.getPrototypeOf(element) as object;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/**
 * Fields that ask never to be remembered (`data-draft="skip"`) — a question
 * the customer must answer afresh every time, such as Meta's goal, which
 * starts empty on purpose (2026-10-06). Restoring it brought back the very
 * default that was removed.
 */
function skippedNames(form: HTMLFormElement): Set<string> {
  const names = new Set<string>();
  for (const element of Array.from(form.elements)) {
    const name = element.getAttribute("name");
    if (name && element.getAttribute("data-draft") === "skip") names.add(name);
  }
  return names;
}

function restoreInto(form: HTMLFormElement, saved: Saved): void {
  const skipped = skippedNames(form);
  const byName = new Map<string, string[]>();
  const stale = (saved.v ?? 1) < DRAFT_VERSION;
  for (const [name, value] of saved.entries) {
    if (stale && STALE_BEFORE_V2.has(name)) continue;
    byName.set(name, [...(byName.get(name) ?? []), value]);
  }
  for (const element of Array.from(form.elements)) {
    const name = element.getAttribute("name");
    if (!name || SKIP.test(name) || skipped.has(name) || !byName.has(name)) continue;
    apply(element, byName.get(name) ?? []);
  }
}

function timeOf(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function FormDraft({ draftKey }: { draftKey: string }) {
  const anchor = useRef<HTMLDivElement>(null);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // The reload below can take seconds to paint on a slow page; until it does,
  // the button says it is working rather than inviting a second press.
  const [clearing, setClearing] = useState(false);

  const formOf = useCallback(() => anchor.current?.closest("form") ?? null, []);

  // Restore once, after hydration. A second pass picks up fields that only
  // appear once the first pass changed something (a goal's detail question).
  useEffect(() => {
    const form = formOf();
    const saved = readSaved(draftKey);
    if (!form || !saved) return;
    restoreInto(form, saved);
    const again = window.setTimeout(() => restoreInto(form, saved), 300);
    setRestoredAt(saved.savedAt);
    setHasDraft(true);
    return () => window.clearTimeout(again);
  }, [draftKey, formOf]);

  // Save as the customer types, a beat after they stop.
  useEffect(() => {
    const form = formOf();
    if (!form) return;
    let timer: number | undefined;
    const save = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const entries: [string, string][] = [];
        const skipped = skippedNames(form);
        for (const [name, value] of new FormData(form).entries()) {
          if (typeof value === "string" && !SKIP.test(name) && !skipped.has(name)) entries.push([name, value]);
        }
        try {
          window.localStorage.setItem(draftKey, JSON.stringify({ savedAt: Date.now(), entries, v: DRAFT_VERSION } satisfies Saved));
          setHasDraft(true);
        } catch {
          // Storage refused: the form still works, it just won't be remembered.
        }
      }, SAVE_DELAY_MS);
    };
    form.addEventListener("input", save);
    form.addEventListener("change", save);
    return () => {
      window.clearTimeout(timer);
      form.removeEventListener("input", save);
      form.removeEventListener("change", save);
    };
  }, [draftKey, formOf]);

  return (
    <div ref={anchor} className="mb-4 min-h-0">
      {(hasDraft || restoredAt !== null) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-raised px-3 py-2 text-sm">
          <p className="text-ink-soft" aria-live="polite">
            {restoredAt !== null
              ? `We kept your unsent answers from ${timeOf(restoredAt)}.`
              : "Your answers are saved in this browser as you type."}
          </p>
          {confirming ? (
            <span className="flex items-center gap-2">
              <span className="text-ink">Clear every answer?</span>
              <button
                type="button"
                onClick={() => {
                  setClearing(true);
                  forget(draftKey);
                  // A clean page is the only reliable start-over: the form's
                  // interactive parts hold state a reset cannot reach.
                  window.location.reload();
                }}
                disabled={clearing}
                aria-busy={clearing}
                className="inline-flex min-h-9 items-center gap-2 rounded-md bg-crit px-3 text-sm font-medium text-surface transition hover:opacity-90 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crit disabled:opacity-70 motion-reduce:transform-none"
              >
                {clearing && <Spinner />}
                {clearing ? "Clearing…" : "Yes, clear"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={clearing}
                className="min-h-9 rounded-md border border-border bg-surface px-3 text-sm text-ink disabled:opacity-50"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="min-h-9 rounded-md border border-border bg-surface px-3 text-sm font-medium text-ink hover:bg-surface"
            >
              Clear data
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Dropped once the campaign has launched: the draft has done its job. */
export function ForgetFormDraft({ draftKey }: { draftKey: string }) {
  useEffect(() => forget(draftKey), [draftKey]);
  return null;
}
