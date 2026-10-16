import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildLeadsTable } from "@/lib/data/dashboard/ads-leads-table";
import { LEAD_PICKER_HREF, LeadQualificationCard } from "./lead-qualification-card";
import { LeadsPanel } from "./leads-panel";

vi.mock("@/components/ui/pending-link", () => ({
  PendingLink: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

/**
 * The hand-off is decided on the server; these check the two faces it can
 * render. The table check is that data-built columns reach the screen with a
 * "-" for a blank cell, and that the export is offered.
 */

describe("LeadQualificationCard", () => {
  it("links a buyer to the existing lead picker, returning to the Configure popup", () => {
    render(<LeadQualificationCard count={12} purchased />);

    expect(screen.getByText(/Send your 12 leads directly/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Choose leads to send" });
    expect(link).toHaveAttribute("href", LEAD_PICKER_HREF);
    expect(LEAD_PICKER_HREF).toBe(
      "/agents/lead-qualification/leads?from=%2Fagents%3Fconfigure%3Dlead-qualification",
    );
    expect(screen.queryByText("Purchase required")).toBeNull();
  });

  it("sends a non-buyer to pricing instead", () => {
    render(<LeadQualificationCard count={1} purchased={false} />);

    expect(screen.getByText(/Send your 1 lead directly/)).toBeInTheDocument();
    expect(screen.getByText("Purchase required")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View pricing" })).toHaveAttribute("href", "/pricing");
    expect(screen.queryByRole("link", { name: "Choose leads to send" })).toBeNull();
  });
});

describe("LeadsPanel", () => {
  const table = buildLeadsTable([
    { email: "owner@shop.com", fullName: "Asha", client_email: "asha@x.com", preferredTime: "Morning" },
    { email: "owner@shop.com", fullName: "Ravi", client_email: "ravi@x.com" },
  ]);

  it("titles the panel with the count and draws the data's own columns", () => {
    render(<LeadsPanel table={table} />);

    expect(screen.getByText("Leads (2)")).toBeInTheDocument();
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["Lead Email", "Full Name", "Preferred Time"]);
    // The account's own address is never shown as a lead.
    expect(screen.queryByText("owner@shop.com")).toBeNull();
  });

  it("prints '-' for a lead with no value in a column", () => {
    render(<LeadsPanel table={table} />);

    const ravi = screen.getByText("Ravi").closest("tr")!;
    expect(within(ravi).getByText("-")).toBeInTheDocument();
  });

  it("exports the table as a CSV file", async () => {
    const createObjectURL = vi.fn(() => "blob:leads");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<LeadsPanel table={table} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Export CSV" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });
});
