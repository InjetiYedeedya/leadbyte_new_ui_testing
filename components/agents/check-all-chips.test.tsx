import { fireEvent, render, screen } from "@testing-library/react";
import { CheckAllChips } from "@/components/agents/check-all-chips";

const OPTIONS = [
  { value: "web", label: "Web" },
  { value: "android", label: "Android app" },
  { value: "ios", label: "iOS app" },
];

const box = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;

describe("CheckAllChips", () => {
  it("starts with All ticked when every option is", () => {
    render(<CheckAllChips name="platforms" label="Eligible platforms" options={OPTIONS} defaultChecked={["web", "android", "ios"]} />);
    expect(box("All").checked).toBe(true);
  });

  it("All ticks and unticks every option", () => {
    render(<CheckAllChips name="platforms" label="Eligible platforms" options={OPTIONS} defaultChecked={["web"]} />);
    fireEvent.click(box("All"));
    expect([box("Web"), box("Android app"), box("iOS app")].every((b) => b.checked)).toBe(true);
    fireEvent.click(box("All"));
    expect([box("Web"), box("Android app"), box("iOS app")].some((b) => b.checked)).toBe(false);
  });

  it("follows the options: one unticked clears All, the last ticked sets it", () => {
    render(<CheckAllChips name="platforms" label="Eligible platforms" options={OPTIONS} defaultChecked={["web", "android", "ios"]} />);
    fireEvent.click(box("iOS app"));
    expect(box("All").checked).toBe(false);
    fireEvent.click(box("iOS app"));
    expect(box("All").checked).toBe(true);
  });

  it("never posts All itself", () => {
    render(<CheckAllChips name="platforms" label="Eligible platforms" options={OPTIONS} defaultChecked={["web"]} />);
    expect(box("All").name).toBe("");
  });
});
