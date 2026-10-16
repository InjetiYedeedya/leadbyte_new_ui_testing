import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdsLeadsSelector } from "./ads-leads-selector";

vi.mock("next/link", () => ({
  default: ({ children, href }: never) => <a href={href}>{children}</a>,
  // `PendingLink` (Cancel) reads its own pending state.
  useLinkStatus: () => ({ pending: false }),
}));

const LEADS = Array.from({ length: 5 }, (_, i) => ({
  id: `lead-${i}`,
  name: `Lead ${i}`,
  email: `lead${i}@acme.com`,
}));

describe("AdsLeadsSelector", () => {
  it("checks every lead named in initiallySelected", () => {
    render(
      <AdsLeadsSelector
        leads={LEADS}
        initiallySelected={LEADS.map((l) => l.id)}
        from="/agents"
        action={vi.fn()}
      />,
    );
    expect(screen.getByText("5 of 5 selected")).toBeTruthy();
    for (const lead of LEADS) {
      expect(
        screen.getByRole("checkbox", { name: `${lead.name} · ${lead.email}` }),
      ).toHaveProperty("checked", true);
    }
  });

  it("starts with only the saved subset checked", () => {
    render(
      <AdsLeadsSelector leads={LEADS} initiallySelected={["lead-0", "lead-2"]} from="/agents" action={vi.fn()} />,
    );
    expect(screen.getByText("2 of 5 selected")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Lead 1 · lead1@acme.com" })).toHaveProperty(
      "checked",
      false,
    );
  });

  it("unchecking a lead updates the count", async () => {
    const user = userEvent.setup();
    render(
      <AdsLeadsSelector
        leads={LEADS}
        initiallySelected={LEADS.map((l) => l.id)}
        from="/agents"
        action={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Lead 0 · lead0@acme.com" }));
    expect(screen.getByText("4 of 5 selected")).toBeTruthy();
  });

  it("Clear deselects everyone and warns; Select all restores everyone", async () => {
    const user = userEvent.setup();
    render(
      <AdsLeadsSelector
        leads={LEADS}
        initiallySelected={LEADS.map((l) => l.id)}
        from="/agents"
        action={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("0 of 5 selected")).toBeTruthy();
    expect(screen.getByText(/Nothing is selected/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText("5 of 5 selected")).toBeTruthy();
  });

  it("submits only the checked leads' ids, plus from", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <AdsLeadsSelector
        leads={LEADS}
        initiallySelected={LEADS.map((l) => l.id)}
        from="/agents/lead-qualification"
        action={action}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Lead 1 · lead1@acme.com" }));
    await user.click(screen.getByRole("button", { name: "Use these leads" }));

    expect(action).toHaveBeenCalledTimes(1);
    const formData = action.mock.calls[0]![0] as FormData;
    expect(formData.getAll("leadIds")).toEqual(["lead-0", "lead-2", "lead-3", "lead-4"]);
    expect(formData.get("from")).toBe("/agents/lead-qualification");
  });

  it("shows the honest empty state and a way back when there are no leads", () => {
    render(<AdsLeadsSelector leads={[]} initiallySelected={[]} from="/agents" action={vi.fn()} />);
    expect(screen.getByText(/No leads found from your ad campaigns yet/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go back" }).getAttribute("href")).toBe("/agents");
    expect(screen.queryByRole("button", { name: "Use these leads" })).toBeNull();
  });
});
