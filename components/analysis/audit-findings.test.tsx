import { fireEvent, render, screen } from "@testing-library/react";
import { AuditFindings } from "./audit-findings";
import type { WebsiteAuditFinding } from "@/lib/data/types";

const findings: WebsiteAuditFinding[] = [
  { id: "1", severity: "critical", title: "Missing meta descriptions", category: "Meta", affectedPages: 0 },
  { id: "2", severity: "high", title: "Missing canonical tags", category: "Meta", affectedPages: 3 },
  { id: "3", severity: "opportunity", title: "Images missing alt text", category: "Images", affectedPages: 0 },
];

describe("AuditFindings", () => {
  it("counts each tab from the rows it will show", () => {
    render(<AuditFindings findings={findings} pagesCrawled={17} />);
    expect(screen.getByRole("button", { name: "All (3)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Critical (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Medium (0)" })).toBeInTheDocument();
  });

  it("filters to one severity and says so when there are none", () => {
    render(<AuditFindings findings={findings} pagesCrawled={17} />);
    fireEvent.click(screen.getByRole("button", { name: "High (1)" }));
    expect(screen.getByText("Missing canonical tags")).toBeInTheDocument();
    expect(screen.queryByText("Missing meta descriptions")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Low (0)" }));
    expect(screen.getByText("No low findings.")).toBeInTheDocument();
  });

  it("says where each finding applies, never '0 pages'", () => {
    render(<AuditFindings findings={findings} pagesCrawled={17} />);
    expect(screen.getAllByText("Site-wide")).toHaveLength(2);
    expect(screen.getByText("3 pages")).toBeInTheDocument();
  });

  it("offers the arrow only when there is a page table to go to", () => {
    const { rerender } = render(<AuditFindings findings={findings} pagesCrawled={17} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    rerender(<AuditFindings findings={findings} pagesCrawled={17} pagesAnchor="page-recommendations" />);
    expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", "#page-recommendations");
  });
});
