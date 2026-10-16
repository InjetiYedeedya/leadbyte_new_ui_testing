import { fireEvent, render, screen } from "@testing-library/react";
import { AgeRangeChips } from "@/components/agents/age-range-chips";

const AGES = ["All", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];

function box(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

const checked = () => AGES.filter((age) => box(age).checked);

describe("AgeRangeChips", () => {
  it("starts with every box ticked when the default is All", () => {
    render(<AgeRangeChips ages={AGES} defaultChecked={["All"]} />);
    expect(checked()).toEqual(AGES);
  });

  it("ticks every band when All is ticked, and clears them when it is unticked", () => {
    render(<AgeRangeChips ages={AGES} defaultChecked={["25-34", "35-44"]} />);
    fireEvent.click(box("All"));
    expect(checked()).toEqual(AGES);
    fireEvent.click(box("All"));
    expect(checked()).toEqual([]);
  });

  it("unticks All when one band is taken away", () => {
    render(<AgeRangeChips ages={AGES} defaultChecked={["All"]} />);
    fireEvent.click(box("65+"));
    expect(box("All").checked).toBe(false);
    expect(checked()).toEqual(["18-24", "25-34", "35-44", "45-54", "55-64"]);
  });

  it("ticks All once the last band is ticked", () => {
    render(<AgeRangeChips ages={AGES} defaultChecked={["18-24", "25-34", "35-44", "45-54", "55-64"]} />);
    expect(box("All").checked).toBe(false);
    fireEvent.click(box("65+"));
    expect(box("All").checked).toBe(true);
  });
});
