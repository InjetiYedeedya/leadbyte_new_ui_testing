import { fireEvent, render, screen, within } from "@testing-library/react";
import { LinkedInGoalFields } from "./linkedin-goal-fields";
import { GOAL_FORMATS, LINKEDIN_GOALS } from "@/lib/data/linkedin-ads-setup";

function renderFields() {
  return render(<LinkedInGoalFields goals={LINKEDIN_GOALS} goalFormats={GOAL_FORMATS} />);
}

const goalSelect = () => screen.getByLabelText("What should the campaign do?") as HTMLSelectElement;
const formatSelect = () => screen.getByLabelText("Ad format") as HTMLSelectElement;

describe("LinkedInGoalFields", () => {
  it("starts with no goal chosen and the format waiting on it", () => {
    renderFields();
    expect(goalSelect().value).toBe("");
    expect(formatSelect()).toBeDisabled();
    expect(within(formatSelect()).getAllByRole("option")).toHaveLength(1);
  });

  it("lists only the chosen goal's formats", () => {
    renderFields();
    fireEvent.change(goalSelect(), { target: { value: "jobs" } });
    const options = within(formatSelect())
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value)
      .filter(Boolean);
    expect(options).toEqual(GOAL_FORMATS.jobs);
    expect(formatSelect()).toBeEnabled();
  });

  it("clears the format when the goal changes", () => {
    renderFields();
    fireEvent.change(goalSelect(), { target: { value: "leads" } });
    fireEvent.change(formatSelect(), { target: { value: "Lead gen form" } });
    expect(formatSelect().value).toBe("Lead gen form");
    fireEvent.change(goalSelect(), { target: { value: "video" } });
    expect(formatSelect().value).toBe("");
  });
});
