import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeadSourcePicker } from "./lead-source-picker";

let pathname = "/agents";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/link", () => ({
  default: ({ children, href }: never) => <a href={href}>{children}</a>,
}));

describe("LeadSourcePicker", () => {
  it("shows the file input by default", () => {
    render(<LeadSourcePicker adsSummary={{ total: 0, selected: 0 }} />);
    expect(screen.getByLabelText(/Lead database/)).toBeTruthy();
  });

  it("removes the file input once 'Use my ads leads' is chosen", async () => {
    const user = userEvent.setup();
    render(<LeadSourcePicker adsSummary={{ total: 12, selected: 12 }} />);

    await user.click(screen.getByRole("radio", { name: "Use my ads leads" }));
    expect(screen.queryByLabelText(/Lead database/)).toBeNull();
  });

  it("shows the honest empty state when there are no ads leads, with no link", async () => {
    const user = userEvent.setup();
    render(<LeadSourcePicker adsSummary={{ total: 0, selected: 0 }} />);

    await user.click(screen.getByRole("radio", { name: "Use my ads leads" }));
    expect(screen.getByText(/No leads found from your ad campaigns yet/)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows the current selection and links to the picker page, carrying the current path", async () => {
    const user = userEvent.setup();
    render(<LeadSourcePicker adsSummary={{ total: 209, selected: 205 }} />);

    await user.click(screen.getByRole("radio", { name: "Use my ads leads" }));
    expect(screen.getByText("205 of 209 leads selected")).toBeTruthy();

    const link = screen.getByRole("link", { name: "Choose leads →" });
    expect(link.getAttribute("href")).toBe(
      `/agents/lead-qualification/leads?from=${encodeURIComponent("/agents?configure=lead-qualification")}`,
    );
  });

  it("warns when zero leads are selected", async () => {
    const user = userEvent.setup();
    render(<LeadSourcePicker adsSummary={{ total: 9, selected: 0 }} />);

    await user.click(screen.getByRole("radio", { name: "Use my ads leads" }));
    expect(screen.getByText("0 of 9 leads selected")).toBeTruthy();
    expect(screen.getByText("— pick at least one")).toBeTruthy();
  });

  it("carries the setup page's own path when rendered there", async () => {
    pathname = "/agents/lead-qualification";
    const user = userEvent.setup();
    render(<LeadSourcePicker adsSummary={{ total: 5, selected: 5 }} />);

    await user.click(screen.getByRole("radio", { name: "Use my ads leads" }));
    const link = screen.getByRole("link", { name: "Choose leads →" });
    expect(link.getAttribute("href")).toBe(
      `/agents/lead-qualification/leads?from=${encodeURIComponent("/agents/lead-qualification")}`,
    );
    pathname = "/agents";
  });
});
