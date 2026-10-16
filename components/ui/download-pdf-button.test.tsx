import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const downloadReportPdf = vi.fn();
vi.mock("@/lib/pdf/report-pdf", () => ({ downloadReportPdf: (...a: unknown[]) => downloadReportPdf(...a) }));

const { DownloadPdfButton } = await import("./download-pdf-button");
const { reportFileName } = await vi.importActual<typeof import("@/lib/pdf/report-pdf")>("@/lib/pdf/report-pdf");

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("DownloadPdfButton", () => {
  it("downloads the report on its page directly, without the print dialog", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    downloadReportPdf.mockResolvedValue(undefined);
    render(
      <main>
        <div className="pdf-frame" data-report="SEO Audit">
          <div className="pdf-frame-body">report</div>
        </div>
        <DownloadPdfButton />
      </main>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(downloadReportPdf).toHaveBeenCalledWith(document.querySelector(".pdf-frame"));
    expect(print).not.toHaveBeenCalled();
  });

  it("prints instead when the PDF cannot be made, so the button never does nothing", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    downloadReportPdf.mockRejectedValue(new Error("no canvas"));
    render(
      <main>
        <div className="pdf-frame" />
        <DownloadPdfButton />
      </main>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(print).toHaveBeenCalled();
  });

  it("prints on a page with no report frame", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<DownloadPdfButton />);
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(print).toHaveBeenCalled();
    expect(downloadReportPdf).not.toHaveBeenCalled();
  });
});

describe("reportFileName", () => {
  it("names the file for the report and the day", () => {
    expect(reportFileName("SEO Audit", new Date("2026-10-13T09:00:00Z"))).toBe("LeadByte-SEO-Audit-2026-10-13.pdf");
    expect(reportFileName("GEO Analysis", new Date("2026-10-13T09:00:00Z"))).toBe("LeadByte-GEO-Analysis-2026-10-13.pdf");
  });
});
