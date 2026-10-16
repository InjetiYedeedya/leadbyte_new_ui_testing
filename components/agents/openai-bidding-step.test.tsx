import { render, screen } from "@testing-library/react";
import { OpenAiBiddingStep } from "@/components/agents/openai-bidding-step";

const goalOptions = () =>
  Array.from((screen.getByLabelText("Goal") as HTMLSelectElement).options).map((o) => o.textContent);

describe("OpenAiBiddingStep goals", () => {
  it("offers Leads and App installs when the account has conversion events", () => {
    render(<OpenAiBiddingStep conversionGoals />);
    expect(goalOptions()).toEqual(["Awareness", "Traffic", "Leads", "Sales", "App installs"]);
  });

  it("greys them out without any, and starts on a goal that can be chosen", () => {
    render(<OpenAiBiddingStep conversionGoals={false} />);
    const options = Array.from((screen.getByLabelText("Goal") as HTMLSelectElement).options);
    expect(options.filter((o) => o.disabled).map((o) => o.value)).toEqual(["leads", "app"]);
    expect(options.find((o) => o.value === "leads")?.textContent).toBe("Leads (needs a conversion event)");
    expect((screen.getByLabelText("Goal") as HTMLSelectElement).value).toBe("awareness");
  });
});
