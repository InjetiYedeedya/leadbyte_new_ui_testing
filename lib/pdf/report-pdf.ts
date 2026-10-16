/**
 * "Download PDF" as a real download (2026-10-13): the report becomes an A4 PDF
 * file in the browser and saves straight away — no print dialog.
 *
 * Browser-only, and loaded only when the button is pressed
 * (`DownloadPdfButton` imports this dynamically), so its two libraries cost
 * the page nothing until then. No server, no endpoint: the report is the page
 * already on screen.
 *
 * ## How
 *
 * 1. The report (`PdfReportFrame`'s contents) is copied off screen at a fixed
 *    width and made to read as it does on paper: print-only lines shown,
 *    buttons and navigation dropped, every table row present.
 * 2. That copy is drawn to one tall image (`html-to-image`).
 * 3. The image is cut into A4 pages — and each cut lands in a GAP: never
 *    through a row, a tile, a line of text or a heading, and between cards
 *    where one is near. That is what leaves no white space: a page holds as
 *    much as fits, rather than a whole card jumping on and leaving a hole.
 * 4. Every page gets the template's LeadByte header and footer, drawn as real
 *    PDF text and shapes (`jspdf`), and "LeadByte | <report> | Page N".
 *
 * The report itself is an image in the PDF: what the customer sees is exactly
 * the screen, at the cost of the text not being selectable — the trade chosen
 * for a direct download (2026-10-13).
 */

import { OFFERS, STRATEGY_CALL_URL, TOPICS, type PdfReportName } from "@/components/ui/pdf-report-frame";
import { PDF_CAPTURE_END, PDF_CAPTURE_START } from "@/lib/use-printing";

/* ── The page, in millimetres ─────────────────────────────────────────── */
const PAGE_W = 210;
const PAGE_H = 297;
const SIDE = 14;
const HEAD_H = 42;
const FOOT_H = 40;
const PAGE_LINE_H = 8;
// Room between the report and the bands above and below it. 4mm left the
// last row reading as squeezed against the footer banner (LBS-1247).
const GAP = 6;
const CONTENT_W = PAGE_W - SIDE * 2;
const CONTENT_TOP = HEAD_H + GAP;
const CONTENT_BOTTOM = PAGE_H - FOOT_H - PAGE_LINE_H - GAP;
const CONTENT_H = CONTENT_BOTTOM - CONTENT_TOP;

/** The width the report is laid out at before it is scaled onto the page. */
const LAYOUT_W = 1000;

/** The template's print colours (as `.pdf-frame` in `globals.css`). */
const NAVY: [number, number, number] = [38, 32, 99];
const ORANGE: [number, number, number] = [251, 176, 59];
const MUTED: [number, number, number] = [107, 114, 128];
const GREY: [number, number, number] = [243, 244, 246];
const SOFT: [number, number, number] = [199, 201, 224];

/* ── 1. The report, copied off screen and made to read as on paper ───── */

function printCopy(frame: HTMLElement): HTMLElement {
  const body = frame.querySelector<HTMLElement>(".pdf-frame-body");
  if (!body) throw new Error("No report body to export");

  const sheet = document.createElement("div");
  sheet.setAttribute("aria-hidden", "true");
  Object.assign(sheet.style, {
    position: "fixed",
    left: "-20000px",
    top: "0",
    width: `${LAYOUT_W}px`,
    background: "#ffffff",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "4px",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);

  for (const child of Array.from(body.children)) {
    // The page's own title block: the PDF's header says what it is.
    if (child.tagName === "HEADER") continue;
    sheet.appendChild(child.cloneNode(true));
  }

  // What print hides, the PDF drops; what only print shows, the PDF shows.
  sheet.querySelectorAll('[class*="print:hidden"]').forEach((el) => el.remove());
  const shown: [string, string][] = [
    ["print:block", "block"],
    ["print:table-row", "table-row"],
    ["print:flex", "flex"],
    ["print:grid", "grid"],
    ["print:inline", "inline"],
  ];
  for (const [token, display] of shown) {
    sheet.querySelectorAll<HTMLElement>(`[class*="${token}"]`).forEach((el) => {
      el.style.display = display;
    });
  }
  // On paper a box that scrolled shows all of itself. Only SCROLLING boxes:
  // `overflow-hidden` is what clips a progress bar's fill and a rounded
  // card's corners, and lifting it spilled those out of their shapes.
  sheet.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const cls = typeof el.className === "string" ? el.className : "";
    if (/(^|\s)(overflow-(x-|y-)?(auto|scroll)|max-h-\S+)/.test(cls)) {
      el.style.overflow = "visible";
      el.style.maxHeight = "none";
    }
  });

  document.body.appendChild(sheet);
  return sheet;
}

/* ── 3. Where a page may end ──────────────────────────────────────────── */

/**
 * Every y (CSS px, from the top of the copy) where a cut lands in a gap, and
 * which of those are BETWEEN cards rather than inside one. A cut is allowed
 * where no small, whole thing — a line, a row, a tile, a heading — spans it.
 */
function breakPoints(sheet: HTMLElement) {
  const top = sheet.getBoundingClientRect().top;
  const boxes: { top: number; bottom: number; card: boolean }[] = [];
  const candidates = new Set<number>();
  for (const el of Array.from(sheet.querySelectorAll<HTMLElement>("*"))) {
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0 || rect.width <= 0) continue;
    const box = { top: rect.top - top, bottom: rect.bottom - top };
    candidates.add(Math.ceil(box.bottom) + 2);
    // Whole things: anything short, and the rows, lines and tiles of a card.
    const whole =
      rect.height < 140 || /^(TR|LI|H1|H2|H3|P|DT|DD|IMG|svg)$/.test(el.tagName) || el.closest("svg") !== null;
    const card = el.matches(".rounded-lg, .rounded-xl") && !el.parentElement?.closest(".rounded-lg, .rounded-xl");
    if (whole || card) boxes.push({ ...box, card: card && !whole });
  }
  const wholes = boxes.filter((b) => !b.card);
  const cards = boxes.filter((b) => b.card);
  const fits = (y: number) => !wholes.some((b) => b.top < y - 1 && b.bottom > y + 1);
  const betweenCards = (y: number) => !cards.some((b) => b.top < y - 1 && b.bottom > y + 1);
  // Last resort for a single row taller than a page: between two LINES of it,
  // rather than straight through the text at the page's edge.
  const lines = wholes.filter((b) => b.bottom - b.top < 40);
  const betweenLines = (y: number) => !lines.some((b) => b.top < y - 1 && b.bottom > y + 1);
  return { candidates: [...candidates].sort((a, b) => a - b), fits, betweenCards, betweenLines };
}

function planPages(sheet: HTMLElement, pageHeightPx: number): number[] {
  const total = sheet.scrollHeight;
  const { candidates, fits, betweenCards, betweenLines } = breakPoints(sheet);
  const cuts: number[] = [];
  let start = 0;
  while (total - start > pageHeightPx) {
    const limit = start + pageHeightPx;
    const options = candidates.filter((y) => y > start + pageHeightPx * 0.3 && y <= limit && fits(y));
    // Between two cards if that still fills most of the page; otherwise
    // between two rows of one card; and only failing both, at the limit.
    const between = options.filter((y) => y >= start + pageHeightPx * 0.72 && betweenCards(y));
    const lineCut = candidates.filter((y) => y > start + pageHeightPx * 0.3 && y <= limit && betweenLines(y)).at(-1);
    const cut = between.at(-1) ?? options.at(-1) ?? lineCut ?? limit;
    cuts.push(cut);
    start = cut;
  }
  return cuts;
}

/* ── 4. The template's header and footer ─────────────────────────────── */

type Pdf = import("jspdf").jsPDF;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function centredRun(pdf: Pdf, parts: { text: string; color: [number, number, number] }[], y: number) {
  const width = parts.reduce((sum, part) => sum + pdf.getTextWidth(part.text), 0);
  let x = (PAGE_W - width) / 2;
  for (const part of parts) {
    pdf.setTextColor(...part.color);
    pdf.text(part.text, x, y);
    x += pdf.getTextWidth(part.text);
  }
}

/** The header pill: which report this is. It said "FREE SEO AUDIT" on the GEO report too. */
const REPORT_PILL: Record<PdfReportName, string> = {
  "SEO Audit": "FREE SEO AUDIT",
  "GEO Analysis": "GEO ANALYSIS",
};

function drawHeader(pdf: Pdf, logo: HTMLImageElement | null, reportName: PdfReportName) {
  // The navy band, edge to edge.
  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, PAGE_W, 9, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  centredRun(
    pdf,
    [
      { text: "Rank higher on Google. ", color: [255, 255, 255] },
      { text: "Get cited by ChatGPT, Perplexity & Gemini.", color: ORANGE },
    ],
    5.9,
  );

  // Logo left; pill and tagline right.
  if (logo) {
    const h = 10;
    pdf.addImage(logo, "PNG", SIDE, 14, (logo.naturalWidth / logo.naturalHeight) * h, h);
  }
  const right = PAGE_W - SIDE;
  pdf.setFillColor(...ORANGE);
  pdf.roundedRect(right - 40, 12, 40, 7, 3.5, 3.5, "F");
  pdf.setTextColor(...NAVY);
  pdf.setFontSize(8.5);
  pdf.text(REPORT_PILL[reportName] ?? "FREE SEO AUDIT", right - 20, 16.6, { align: "center" });
  pdf.setFontSize(8.5);
  pdf.text("Your website, scored in minutes", right, 23.5, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...MUTED);
  pdf.text("AI-powered insights. Clear next steps.", right, 27.5, { align: "right" });

  pdf.setDrawColor(...ORANGE);
  pdf.setLineWidth(0.6);
  pdf.line(SIDE, 30.5, PAGE_W - SIDE, 30.5);

  // The topics bar.
  pdf.setFillColor(...GREY);
  pdf.roundedRect(SIDE, 32.5, CONTENT_W, 7, 3.5, 3.5, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  const slot = CONTENT_W / TOPICS.length;
  TOPICS.forEach((topic, i) => {
    const centre = SIDE + slot * i + slot / 2;
    const w = pdf.getTextWidth(topic);
    pdf.setFillColor(...ORANGE);
    pdf.circle(centre - w / 2 - 2.2, 35.9, 0.9, "F");
    pdf.setTextColor(...NAVY);
    pdf.text(topic, centre - w / 2, 36.9);
  });
}

function drawFooter(pdf: Pdf, reportName: PdfReportName, page: number) {
  const top = PAGE_H - PAGE_LINE_H - FOOT_H;
  pdf.setFillColor(...NAVY);
  pdf.rect(SIDE, top, CONTENT_W, FOOT_H, "F");
  pdf.setFillColor(...ORANGE);
  pdf.rect(SIDE, top, CONTENT_W, 1, "F");

  const left = SIDE + 6;
  const right = PAGE_W - SIDE - 6;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(255, 255, 255);
  pdf.text("Improve your website visibility with LeadByte", left, top + 9);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...SOFT);
  pdf.text("AI-powered marketing automation that turns visitors into leads.", left, top + 13.5);

  // The call to action, a working link.
  pdf.setFillColor(...ORANGE);
  pdf.roundedRect(right - 46, top + 5, 46, 8, 4, 4, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...NAVY);
  pdf.text("Book a free strategy call", right - 23, top + 10, { align: "center" });
  pdf.link(right - 46, top + 5, 46, 8, { url: STRATEGY_CALL_URL });

  // The three offers.
  const col = (right - left) / OFFERS.length;
  OFFERS.forEach(([title, line], i) => {
    const x = left + col * i;
    pdf.setFillColor(...ORANGE);
    pdf.circle(x + 1, top + 20.2, 0.9, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(255, 255, 255);
    pdf.text(title, x + 3.2, top + 21);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.8);
    pdf.setTextColor(...SOFT);
    pdf.text(line, x + 3.2, top + 25);
  });

  pdf.setDrawColor(255, 255, 255);
  pdf.setLineWidth(0.15);
  pdf.line(left, top + 29, right, top + 29);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...ORANGE);
  pdf.text("leadbyte.ai", left, top + 34.5);
  pdf.link(left, top + 31.5, pdf.getTextWidth("leadbyte.ai"), 4, { url: "https://leadbyte.ai" });
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(255, 255, 255);
  pdf.text(" | apps@ntimes.ai | +1 914 473 1849", left + pdf.getTextWidth("leadbyte.ai"), top + 34.5);
  pdf.setFont("helvetica", "italic");
  pdf.setTextColor(...SOFT);
  pdf.text("Free audit. No obligation.", right, top + 34.5, { align: "right" });

  // The page line.
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(...MUTED);
  pdf.text(`LeadByte | ${reportName} | Page ${page}`, PAGE_W / 2, PAGE_H - 3.5, { align: "center" });
}

/* ── Together ─────────────────────────────────────────────────────────── */

export function reportFileName(reportName: PdfReportName, date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  return `LeadByte-${reportName.replace(/\s+/g, "-")}-${day}.pdf`;
}

export async function downloadReportPdf(frame: HTMLElement): Promise<void> {
  const reportName = (frame.dataset.report as PdfReportName | undefined) ?? "SEO Audit";
  const [{ jsPDF }, { toCanvas }] = await Promise.all([import("jspdf"), import("html-to-image")]);

  // Tell the report to render as it does on paper — every table row, every
  // section open — before it is copied (`usePrinting`). The components update
  // synchronously; two frames let their layout effects and any reveal settle.
  window.dispatchEvent(new Event(PDF_CAPTURE_START));
  let sheet: HTMLElement | null = null;
  try {
    await nextFrames(2);
    sheet = printCopy(frame);
    // Fonts and images in the copy have to be ready before it is drawn. An
    // image that fails or never answers must not leave the button stuck on
    // "Preparing PDF…": each waits for load OR error, and at most 5 seconds.
    await document.fonts?.ready;
    await Promise.all(
      Array.from(sheet.querySelectorAll("img")).map((img) =>
        img.complete
          ? null
          : new Promise((done) => {
              img.addEventListener("load", done, { once: true });
              img.addEventListener("error", done, { once: true });
              setTimeout(done, 5000);
            }),
      ),
    );

    const height = sheet.scrollHeight;
    // Sharp, but within what a browser canvas allows (~16k px tall).
    const ratio = Math.min(2, 15000 / height);
    const canvas = await toCanvas(sheet, {
      pixelRatio: ratio,
      backgroundColor: "#ffffff",
      // The copy is `LAYOUT_W` wide padding included (border-box); drawing it
      // 8px wider left a blank strip down the right of every page.
      width: LAYOUT_W,
      height,
      style: { position: "static", left: "0" },
    });

    const mmPerPx = CONTENT_W / LAYOUT_W;
    const pageHeightPx = CONTENT_H / mmPerPx;
    const cuts = planPages(sheet, pageHeightPx);
    const bounds = [0, ...cuts, height];

    const logo = await loadImage("/leadbyte-logo.png").catch(() => null);
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });

    for (let i = 0; i < bounds.length - 1; i++) {
      if (i > 0) pdf.addPage();
      const from = bounds[i]!;
      const to = bounds[i + 1]!;
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = Math.max(1, Math.round((to - from) * ratio));
      const ctx = slice.getContext("2d");
      if (!ctx) throw new Error("No canvas");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, Math.round(from * ratio), canvas.width, slice.height, 0, 0, slice.width, slice.height);
      pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", SIDE, CONTENT_TOP, CONTENT_W, (to - from) * mmPerPx);
      drawHeader(pdf, logo, reportName);
      drawFooter(pdf, reportName, i + 1);
    }

    pdf.save(reportFileName(reportName));
  } finally {
    sheet?.remove();
    window.dispatchEvent(new Event(PDF_CAPTURE_END));
  }
}

/** Waits `count` animation frames, or a short timeout where frames are paused (a hidden tab). */
function nextFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let left = count;
    const timer = setTimeout(resolve, 250);
    const tick = () => {
      left -= 1;
      if (left <= 0) {
        clearTimeout(timer);
        resolve();
      } else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
