import { fireEvent, render, screen } from "@testing-library/react";
import { GoogleGoalFields } from "./google-goal-fields";

afterEach(() => vi.unstubAllGlobals());

describe("GoogleGoalFields", () => {
  it("offers a custom lead form after the account's own, posting id custom", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, options: [] }) })),
    );
    render(<GoogleGoalFields defaultGoal="leads" />);
    fireEvent.change(screen.getByLabelText("And specifically?"), { target: { value: "Forms" } });
    expect(await screen.findByText("+ Create custom form")).toBeInTheDocument();
    expect(screen.getByText("We'll create a custom lead form for your campaign")).toBeInTheDocument();
    expect(JSON.parse((screen.getByRole("radio") as HTMLInputElement).value)).toEqual({ id: "custom", name: "Custom Form" });
  });

  it("has no Remarketing goal, and calls the local goal local_store", () => {
    render(<GoogleGoalFields defaultGoal="brand" />);
    const values = Array.from((screen.getByLabelText("What should the campaign do?") as HTMLSelectElement).options).map(
      (o) => o.value,
    );
    expect(values).not.toContain("remarketing");
    expect(values).toContain("local_store");
  });
});
