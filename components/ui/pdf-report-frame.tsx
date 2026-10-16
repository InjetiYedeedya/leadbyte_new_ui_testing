/**
 * The branded frame a downloaded report prints inside
 * (`LeadByte_SEO_Audit_Template_v2.pdf`, given 2026-10-02): the LeadByte band
 * and pill bar at the top of EVERY page, the "Improve your website
 * visibility" panel at the bottom of every page, and "LeadByte | <report> |
 * Page N" beneath it.
 *
 * ## How it repeats on every page
 *
 * `DownloadPdfButton` prints the page (`window.print()`), so this is CSS, not a
 * PDF library — see the `.pdf-frame*` rules in `globals.css`:
 *
 * - The header and footer are `position: fixed` in print, which the browser
 *   draws on every page.
 * - The report sits in a one-cell table whose `<thead>` and `<tfoot>` are
 *   empty spacers the same height as the header and footer. Browsers repeat a
 *   table's head and foot on every printed page, so the content always starts
 *   below the header and stops above the footer — the fixed bands never sit
 *   on top of text.
 * - The page line is an `@page` margin box with the page counter, chosen per
 *   report by a named page (`seo-report` / `geo-report`).
 *
 * On screen the frame is invisible: the bands are not displayed and the table
 * parts are `display: contents`, so the report lays out exactly as before.
 *
 * The navy and orange are the template's brand print colours, defined once in
 * the print block — not app tokens, the same exception as a third party's
 * brand colour.
 */

export type PdfReportName = "SEO Audit" | "GEO Analysis";

const PAGE_NAMES: Record<PdfReportName, string> = {
  "SEO Audit": "pdf-frame-seo",
  "GEO Analysis": "pdf-frame-geo",
};

/** Shared with the downloaded PDF (`lib/pdf/report-pdf.ts`), so the two say the same. */
export const TOPICS = ["Technical SEO", "On-page & content", "Speed & mobile", "AI search (GEO) readiness"];

export const OFFERS: ReadonlyArray<readonly [title: string, line: string]> = [
  ["AI SEO & GEO", "Rank on Google and in AI answers"],
  ["Lead-gen funnels", "Landing pages, forms, follow-ups"],
  ["AI marketing agents", "Content, outreach and reporting"],
];

/** Where "Book a free strategy call" goes (product owner, 2026-10-02). */
export const STRATEGY_CALL_URL = "https://leadbyte.ai";

export function PdfReportFrame({
  reportName,
  children,
}: {
  reportName: PdfReportName;
  children: React.ReactNode;
}) {
  return (
    <div className={`pdf-frame ${PAGE_NAMES[reportName]}`} data-report={reportName}>
      <div className="pdf-frame-header" aria-hidden="true">
        <div className="pdf-frame-topband">
          <strong>Rank higher on Google.</strong>{" "}
          <strong className="pdf-frame-orange">Get cited by ChatGPT, Perplexity &amp; Gemini.</strong>
        </div>
        <div className="pdf-frame-brand">
          {/* A plain <img>: next/image's lazy loading can leave it unloaded
              when the print snapshot is taken. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/leadbyte-logo.png" alt="LeadByte" className="pdf-frame-logo" />
          <div className="pdf-frame-tagline">
            <span className="pdf-frame-pill">FREE SEO AUDIT</span>
            <span className="pdf-frame-tag-strong">Your website, scored in minutes</span>
            <span className="pdf-frame-tag-soft">AI-powered insights. Clear next steps.</span>
          </div>
        </div>
        <div className="pdf-frame-topics">
          {TOPICS.map((topic) => (
            <span key={topic}>
              <i aria-hidden="true" className="pdf-frame-dot" />
              {topic}
            </span>
          ))}
        </div>
      </div>

      <div className="pdf-frame-footer">
        <div className="pdf-frame-panel">
          <div className="pdf-frame-panel-head">
            <div>
              <p className="pdf-frame-panel-title">Improve your website visibility with LeadByte</p>
              <p className="pdf-frame-panel-sub">AI-powered marketing automation that turns visitors into leads.</p>
            </div>
            <a href={STRATEGY_CALL_URL} className="pdf-frame-cta">
              Book a free strategy call
            </a>
          </div>
          <div className="pdf-frame-offers">
            {OFFERS.map(([title, line]) => (
              <div key={title}>
                <p className="pdf-frame-offer-title">
                  <i aria-hidden="true" className="pdf-frame-dot" />
                  {title}
                </p>
                <p className="pdf-frame-offer-line">{line}</p>
              </div>
            ))}
          </div>
          <div className="pdf-frame-contact">
            <span>
              <a href="https://leadbyte.ai" className="pdf-frame-orange">
                leadbyte.ai
              </a>{" "}
              | apps@ntimes.ai | +1 914 473 1849
            </span>
            <em>Free audit. No obligation.</em>
          </div>
        </div>
      </div>

      <table className="pdf-frame-table" role="presentation">
        <thead>
          <tr>
            <td>
              <div className="pdf-frame-head-space" />
            </td>
          </tr>
        </thead>
        <tfoot>
          <tr>
            <td>
              <div className="pdf-frame-foot-space" />
            </td>
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td className="pdf-frame-body">{children}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
