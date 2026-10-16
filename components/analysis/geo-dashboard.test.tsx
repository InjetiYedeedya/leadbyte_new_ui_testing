import { render, screen } from "@testing-library/react";
import { GeoDashboard, QuickWinsCard } from "./geo-dashboard";
import type { GeoAnalysis, WebsiteAudit } from "@/lib/data/types";

const page = (shortUrl: string, extractabilityScore: number | null) => ({
  url: `https://acme.com${shortUrl}`,
  shortUrl,
  extractabilityScore,
  geoIssueCount: 0,
  geoIssues: [],
  status: "",
});

const GEO: GeoAnalysis = {
  businessId: "acme",
  score: 62,
  engineCoverage: [],
  subScores: [
    { label: "Crawlability", score: 100 },
    { label: "Trust", score: 32 },
  ],
  signals: [
    { label: "Author named", pages: 0, total: 3, group: "Trust & authorship" },
    { label: "Questions as headings", pages: 2, total: 3, group: "Structure" },
  ],
  totalIssues: 98,
  aiBots: [
    { bot: "GPTBot", access: "allowed" },
    { bot: "ClaudeBot", access: "blocked" },
  ],
  strengths: [],
  weaknesses: [],
  opportunities: [],
  risks: [],
  pages: [page("/", 60), page("/about", 80), page("/blog", 20)],
};

const AUDIT = {
  criticalCount: 2,
  highCount: 1,
  mediumCount: 0,
  lowCount: 0,
} as WebsiteAudit;

describe("GeoDashboard", () => {
  it("renders the score, the verdicts and the derived counts from real fields", () => {
    render(<GeoDashboard name="Acme" geo={GEO} audit={AUDIT} />);
    expect(screen.getByRole("heading", { level: 1, name: "How visible is Acme in AI search?" })).toBeInTheDocument();
    expect(screen.getByText("Needs improvement")).toBeInTheDocument();
    expect(screen.getByText("Excellent")).toBeInTheDocument();
    expect(screen.getByText("Poor")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 allowed")).toBeInTheDocument();
    expect(screen.getByText("1 page is hard to read")).toBeInTheDocument();
    // Every page, in the analysis's own order, each linking to the page.
    const pages = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"))
      .filter((href) => href?.startsWith("https://acme.com"));
    expect(pages).toEqual(["https://acme.com/", "https://acme.com/about", "https://acme.com/blog"]);
    expect(screen.getByRole("region", { name: "Website audit findings by severity" })).toBeInTheDocument();
    // Severity tiles open the audit already filtered.
    expect(screen.getByRole("link", { name: /Critical issues/ })).toHaveAttribute(
      "href",
      "/overview/website-audit?severity=critical#findings",
    );
  });

  it("leaves out what was not measured", () => {
    render(
      <GeoDashboard
        name="Acme"
        geo={{ ...GEO, score: null, aiBots: [], pages: [], signals: [], subScores: [] }}
        audit={null}
      />,
    );
    expect(screen.getByText("Not scored yet.")).toBeInTheDocument();
    expect(screen.queryByText("AI crawler access")).not.toBeInTheDocument();
    expect(screen.queryByText("Page-level analysis")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Website audit findings by severity" })).not.toBeInTheDocument();
  });

  it("ranks quick wins by the pages each fix reaches", () => {
    render(<QuickWinsCard signals={GEO.signals!} />);
    expect(screen.getByText("Add an author byline to 3 pages")).toBeInTheDocument();
    expect(screen.getByText("Improves E-E-A-T signals")).toBeInTheDocument();
  });
});
