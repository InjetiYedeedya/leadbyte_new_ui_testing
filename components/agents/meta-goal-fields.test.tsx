import { fireEvent, render, screen } from "@testing-library/react";
import { MetaGoalFields } from "./meta-goal-fields";
import { META_GOALS } from "@/lib/data/meta-ads-setup";

function renderFields() {
  return render(
    <MetaGoalFields
      goals={META_GOALS}
      defaultGoal="leads"
      advertising={<p>Advertising section</p>}
      offer={<p>Offer section</p>}
    />,
  );
}

describe("MetaGoalFields", () => {
  it("asks the goal first, before what is being advertised", () => {
    renderFields();
    const goal = screen.getByLabelText("What should the campaign do?");
    const advertising = screen.getByText("Advertising section");
    expect(goal.compareDocumentPosition(advertising) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the offer for Leads and removes it for Awareness", () => {
    renderFields();
    expect(screen.getByText("Offer section")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("What should the campaign do?"), {
      target: { value: "awareness" },
    });
    expect(screen.queryByText("Offer section")).toBeNull();
    expect(screen.getByText("Advertising section")).toBeInTheDocument();
  });

  it("asks for the post to promote only on Engagement (LBS-1253)", () => {
    renderFields();
    expect(screen.queryByLabelText(/Which post should we promote/)).toBeNull();
    fireEvent.change(screen.getByLabelText("What should the campaign do?"), {
      target: { value: "engagement" },
    });
    expect(screen.getByLabelText(/Which post should we promote/)).toBeRequired();
  });
});
