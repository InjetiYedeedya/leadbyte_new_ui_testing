import { fireEvent, render, screen } from "@testing-library/react";
import { OpenAiBudgetFields } from "@/components/agents/openai-budget-fields";

const MINIMUMS = {
  daily: { amount: 25, label: "$25" },
  lifetime: { amount: 100, label: "$100" },
};

function setup() {
  render(<OpenAiBudgetFields currency="USD" minimums={MINIMUMS} />);
  const amount = screen.getByRole("spinbutton") as HTMLInputElement;
  const type = screen.getByRole("combobox") as HTMLSelectElement;
  return { amount, type };
}

describe("OpenAiBudgetFields", () => {
  it("starts on Select type, with the minimums as a note", () => {
    const { type } = setup();
    expect(type.value).toBe("");
    expect(screen.getByText(/Minimum \$25 daily, \$100 lifetime/)).toBeInTheDocument();
  });

  it("says in red when a daily budget is under $25, and blocks the step", () => {
    const { amount, type } = setup();
    fireEvent.change(type, { target: { value: "daily" } });
    fireEvent.change(amount, { target: { value: "20" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Daily budget must be at least $25.");
    expect(amount.validity.customError).toBe(true);
    fireEvent.change(amount, { target: { value: "25" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(amount.validity.customError).toBe(false);
  });

  it("holds a lifetime budget to $100", () => {
    const { amount, type } = setup();
    fireEvent.change(amount, { target: { value: "68" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.change(type, { target: { value: "lifetime" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Lifetime budget must be at least $100.");
  });
});
