import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoalPicker } from "./goal-picker";
import { GOALS } from "@/lib/data/google-ads-setup";

describe("GoalPicker", () => {
  it("starts valid: Leads with its first detail already chosen", () => {
    render(<GoalPicker goals={GOALS} defaultGoal="leads" />);
    expect(screen.getByRole("combobox", { name: "What should the campaign do?" })).toHaveValue("leads");
    expect(screen.getByRole("combobox", { name: "And specifically?" })).toHaveValue("Calls");
  });

  it("offers only the chosen goal's details", async () => {
    const user = userEvent.setup();
    render(<GoalPicker goals={GOALS} defaultGoal="leads" />);
    await user.selectOptions(screen.getByRole("combobox", { name: "What should the campaign do?" }), "conversions");
    const detail = screen.getByRole("combobox", { name: "And specifically?" });
    expect([...detail.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Calls", "Website"]);
    expect(screen.queryByText("Not applicable")).toBeNull();
  });

  it("hides the detail question for a goal that has none", async () => {
    const user = userEvent.setup();
    render(<GoalPicker goals={GOALS} defaultGoal="leads" />);
    await user.selectOptions(screen.getByRole("combobox", { name: "What should the campaign do?" }), "traffic");
    expect(screen.queryByRole("combobox", { name: "And specifically?" })).toBeNull();
  });
});
