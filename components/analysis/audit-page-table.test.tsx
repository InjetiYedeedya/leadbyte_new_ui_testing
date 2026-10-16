import { fireEvent, render, screen, within } from "@testing-library/react";
import { AuditPageTable, type AuditPageRow } from "./audit-page-table";

const row = (index: number, over: Partial<AuditPageRow> = {}): AuditPageRow => ({
  key: `page-${index}`,
  path: `/page-${index}`,
  issues: 4,
  score: 50 + index,
  needsAttention: true,
  severities: ["medium"],
  detail: <p>Report for page {index}</p>,
  ...over,
});

const rows = [
  row(0, { path: "/", severities: ["critical"], score: 32 }),
  ...Array.from({ length: 9 }, (_, i) => row(i + 1)),
  row(10, { path: "/contact", score: null, needsAttention: false }),
];

const bodyRows = () => within(screen.getAllByRole("rowgroup")[1]!).getAllByRole("row");

describe("AuditPageTable", () => {
  it("shows eight pages at a time and pages through the rest", () => {
    render(<AuditPageTable rows={rows} />);
    expect(bodyRows()).toHaveLength(8);
    expect(screen.getByText("Showing 1-8 of 11 pages")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(bodyRows()).toHaveLength(3);
    expect(screen.getByText("Showing 9-11 of 11 pages")).toBeInTheDocument();
  });

  it("filters by text and by severity", () => {
    render(<AuditPageTable rows={rows} />);
    fireEvent.change(screen.getByLabelText("Filter pages"), { target: { value: "contact" } });
    expect(bodyRows()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Filter pages"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /^Critical / }));
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("/")).toBeInTheDocument();
  });

  it("labels an unscored page as unscored rather than zero", () => {
    render(<AuditPageTable rows={[row(10, { path: "/contact", score: null, needsAttention: false })]} />);
    expect(screen.getByText("Not scored")).toBeInTheDocument();
  });

  it("shows each page's most severe problem, and Good only with no issues", () => {
    render(
      <AuditPageTable
        rows={[
          row(1, { path: "/a", severities: ["high", "critical"] }),
          row(2, { path: "/b", severities: ["medium"] }),
          row(3, { path: "/c", issues: 0, severities: [], needsAttention: false }),
        ]}
      />,
    );
    expect(screen.getByText("Critical", { selector: "td span" })).toBeInTheDocument();
    expect(screen.getByText("Medium", { selector: "td span" })).toBeInTheDocument();
    expect(screen.getByText("Good", { selector: "td span" })).toBeInTheDocument();
    expect(screen.queryByText("Needs attention")).toBeNull();
  });

  it("opens a page's report in place and closes it again", () => {
    render(<AuditPageTable rows={rows} />);
    const view = screen.getByRole("button", { name: "View the report for /" });
    fireEvent.click(view);
    expect(screen.getByText("Report for page 0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide the report for /" }));
    expect(screen.queryByText("Report for page 0")).not.toBeInTheDocument();
  });

  it("sorts by score with unscored pages last", () => {
    render(<AuditPageTable rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: /SEO score/ }));
    expect(within(bodyRows()[0]!).getByText("/page-9")).toBeInTheDocument();
  });
});
