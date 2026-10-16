import { render, screen } from "@testing-library/react";
import { SemiForm } from "./semi-form";
import { readSemiAnswers, type SemiField } from "@/lib/data/semi-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/agents/linkedin-ads/semi",
  useSearchParams: () => new URLSearchParams(),
}));

const AGE: SemiField = { label: "Age Range", type: "text", placeholder: "", defaultValue: "", required: true, options: [] };

function renderForm(fields: SemiField[]) {
  const { container } = render(
    <SemiForm
      backHref="/agents/linkedin-ads/suggestion"
      action={async () => {}}
      askSelectionMode={false}
      fields={fields}
      creatives={[]}
      countries={[]}
    />,
  );
  return container.querySelector("form") as HTMLFormElement;
}

describe("SemiForm — an age question (2026-10-08)", () => {
  it("offers the age bands as ticks instead of a typed box", () => {
    renderForm([AGE]);
    expect(screen.queryByRole("textbox")).toBeNull();
    for (const band of ["All", "18-24", "25-34", "65+"]) {
      expect(screen.getByRole("checkbox", { name: band })).toBeInTheDocument();
    }
  });

  it("starts on All, which reads back as All", () => {
    const form = renderForm([AGE]);
    expect(readSemiAnswers([AGE], new FormData(form))["Age Range"]).toBe("All");
  });

  it("starts from an earlier answer when there is one", () => {
    const form = renderForm([{ ...AGE, defaultValue: "25-34, 35-44" }]);
    expect(readSemiAnswers([AGE], new FormData(form))["Age Range"]).toBe("25-34, 35-44");
  });
});

describe("SemiForm — an age question that arrived with a typed answer", () => {
  it("starts on All when its earlier value is not one of the bands", () => {
    const field = { ...AGE, label: "Targeting Age", defaultValue: "20 to 45", options: ["20 to 45"] };
    const form = renderForm([field]);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(readSemiAnswers([field], new FormData(form))["Targeting Age"]).toBe("All");
  });
});
