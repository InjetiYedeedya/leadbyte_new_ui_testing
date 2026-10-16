"use client";

/**
 * "Download PDF" for a report page.
 *
 * ## A direct download (2026-10-13)
 *
 * Pressing it saves a PDF file straight away: the report on screen
 * (`PdfReportFrame`'s contents) is turned into A4 pages in the browser, with
 * the LeadByte header and footer on each, and cut so no page is left half
 * empty — see `lib/pdf/report-pdf.ts`. It used to open the print dialog and
 * leave the customer to find "Save as PDF".
 *
 * Still no API: the PDF is made from the page already rendered, in the
 * browser. Its libraries load only when the button is pressed, so the page
 * pays nothing for them until then.
 *
 * If the PDF cannot be made — a page without the report frame, an old
 * browser — it falls back to printing, which the print stylesheet in
 * `globals.css` still turns into the report, so the button never does nothing.
 */

import { useState } from "react";

export function DownloadPdfButton({ label = "Download PDF" }: { label?: string }) {
  const [busy, setBusy] = useState(false);

  async function download(button: HTMLButtonElement) {
    // The report this button belongs to: the frame on its own page.
    const frame =
      button.closest<HTMLElement>("main")?.querySelector<HTMLElement>(".pdf-frame") ??
      document.querySelector<HTMLElement>(".pdf-frame");
    if (!frame) {
      window.print();
      return;
    }
    setBusy(true);
    try {
      const { downloadReportPdf } = await import("@/lib/pdf/report-pdf");
      await downloadReportPdf(frame);
    } catch (caught) {
      console.warn("[pdf] direct download failed, printing instead:", caught);
      window.print();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={(event) => void download(event.currentTarget)}
      disabled={busy}
      aria-busy={busy}
      // Itself hidden on paper: a "Download PDF" button inside a PDF is a
      // dead control.
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-raised disabled:cursor-wait disabled:opacity-70 print:hidden"
      suppressHydrationWarning
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-4 w-4 ${busy ? "animate-pulse" : ""}`}
      >
        <path d="M12 3v12" />
        <path d="M7 11l5 5 5-5" />
        <path d="M4 19h16" />
      </svg>
      {busy ? "Preparing PDF…" : label}
    </button>
  );
}
