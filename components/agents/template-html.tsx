"use client";

/**
 * "Format as HTML" — the preview beside the outreach template box.
 *
 * ## Why it earns `"use client"`
 *
 * Same reason as `TemplateWriter`: it acts on a textarea inside a form the
 * customer is still filling in, and shows the result in place. A
 * `<form action>` would submit and lose the leads file already chosen.
 *
 * ## Why the HTML is what gets sent, but only while it matches
 *
 * When the customer formats the plain text, the HTML — not the text — is the
 * email leads receive, so it is reported up via `onHtml`. But the moment they
 * edit the text again the HTML is stale, so the parent drops it and reverts to
 * sending plain text until they re-format. That handoff lives in the parent;
 * this component only produces the HTML and previews it.
 *
 * The preview is a fully sandboxed `<iframe srcDoc>` — the email HTML runs no
 * scripts and can reach nothing of ours.
 */

import { useState, useTransition } from "react";
import { Spinner } from "@/components/ui/spinner";

export function TemplateHtml({
  template,
  html,
  disabled = false,
  onFormat,
  onHtml,
}: {
  /** The current plain-text template — what gets formatted. */
  template: string;
  /** The HTML produced so far, or null. Owned by the parent. */
  html: string | null;
  disabled?: boolean;
  /** The Server Action. Returns the HTML, or a message saying why not. */
  onFormat: (template: string) => Promise<{ html: string | null; message?: string }>;
  /** Reports the HTML up so the parent sends it instead of the plain text. */
  onHtml: (html: string | null) => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [pending, start] = useTransition();

  function format() {
    setNote(null);
    start(async () => {
      const result = await onFormat(template);
      if (result.html) {
        onHtml(result.html);
      } else {
        onHtml(null);
        setNote(result.message ?? "We couldn't format that as HTML just now.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink">
          {html ? "Formatted as HTML — this is what leads receive." : "Send as an HTML email"}
        </span>
        <button
          type="button"
          disabled={disabled || pending || template.trim() === ""}
          // Said, not just greyed out: an empty template is why it is disabled.
          title={template.trim() === "" ? "Write or generate a template first" : undefined}
          onClick={format}
          suppressHydrationWarning
          className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-surface transition disabled:opacity-60 hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
        >
          {pending && <Spinner />}
          {pending ? "Formatting…" : html ? "Re-format" : "Format as HTML"}
        </button>
      </div>

      {html && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center justify-end">
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {(["desktop", "mobile"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  suppressHydrationWarning
                  className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition ${
                    device === d ? "bg-accent text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-center overflow-hidden rounded-lg border border-border bg-surface">
            {/* Fully sandboxed: no scripts, no access to our origin. `srcDoc`
                is the generated HTML verbatim. */}
            <iframe
              title="HTML email preview"
              sandbox=""
              srcDoc={html}
              // No transition. This was `transition-all` on an iframe whose
              // width jumps between 375px and 100%; `all` is unbounded and an
              // iframe reflowing its document mid-animation janks whatever it
              // is rendering. A device toggle should snap.
              className="h-72"
              style={{ width: device === "mobile" ? "375px" : "100%" }}
            />
          </div>
        </div>
      )}

      {note && (
        <p role="status" className="mt-2 px-2 text-xs text-ink-soft">
          {note}
        </p>
      )}
    </div>
  );
}
