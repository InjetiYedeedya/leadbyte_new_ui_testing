import { render, screen } from "@testing-library/react";
import { PdfReportFrame, STRATEGY_CALL_URL } from "@/components/ui/pdf-report-frame";

describe("PdfReportFrame", () => {
  it("carries every piece of the template around the report", () => {
    const { container } = render(
      <PdfReportFrame reportName="SEO Audit">
        <p>The report itself</p>
      </PdfReportFrame>,
    );
    const text = container.textContent ?? "";
    for (const line of [
      "Rank higher on Google.",
      "Get cited by ChatGPT, Perplexity & Gemini.",
      "FREE SEO AUDIT",
      "Your website, scored in minutes",
      "AI-powered insights. Clear next steps.",
      "Technical SEO",
      "On-page & content",
      "Speed & mobile",
      "AI search (GEO) readiness",
      "Improve your website visibility with LeadByte",
      "AI-powered marketing automation that turns visitors into leads.",
      "AI SEO & GEO",
      "Lead-gen funnels",
      "AI marketing agents",
      "apps@ntimes.ai | +1 914 473 1849",
      "Free audit. No obligation.",
    ]) {
      expect(text).toContain(line);
    }
    expect(screen.getByText("The report itself")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book a free strategy call" })).toHaveAttribute("href", STRATEGY_CALL_URL);
    expect(STRATEGY_CALL_URL).toBe("https://leadbyte.ai");
  });

  it("picks the named page that sets the page line for each report", () => {
    const { container, rerender } = render(<PdfReportFrame reportName="SEO Audit">x</PdfReportFrame>);
    expect(container.firstElementChild).toHaveClass("pdf-frame-seo");
    rerender(<PdfReportFrame reportName="GEO Analysis">x</PdfReportFrame>);
    expect(container.firstElementChild).toHaveClass("pdf-frame-geo");
  });
});
