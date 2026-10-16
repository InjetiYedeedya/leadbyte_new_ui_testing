import { fireEvent, render, screen } from "@testing-library/react";
import { MetaScheduleFields, endHours, localDay, startHours } from "./meta-schedule-fields";

function renderFields() {
  return render(
    <form aria-label="setup">
      <MetaScheduleFields budgetAmount={<input name="budgetAmount" aria-label="Budget" />} />
    </form>,
  );
}

const startDate = () => screen.getByLabelText(/Start date/) as HTMLInputElement;
const endDate = () => screen.getByLabelText(/End date/) as HTMLInputElement;
const budgetType = () => screen.getByLabelText(/Budget type/) as HTMLSelectElement;
const timing = () => screen.getByLabelText("Custom timing schedule") as HTMLInputElement;

describe("MetaScheduleFields — dates", () => {
  it("keeps the end disabled until a start is chosen, then after it", () => {
    renderFields();
    expect(endDate().disabled).toBe(true);
    fireEvent.change(startDate(), { target: { value: "2099-10-02" } });
    expect(endDate().disabled).toBe(false);
    expect(endDate().min).toBe("2099-10-03");
  });

  it("clears the end when the start moves onto or past it", () => {
    renderFields();
    fireEvent.change(startDate(), { target: { value: "2099-10-02" } });
    fireEvent.change(endDate(), { target: { value: "2099-10-10" } });
    fireEvent.change(startDate(), { target: { value: "2099-10-10" } });
    expect(endDate().value).toBe("");
  });

  it("starts no earlier than the browser's today", () => {
    renderFields();
    expect(startDate().min).toBe(localDay(new Date()));
  });
});

describe("MetaScheduleFields — custom timing", () => {
  it("runs all day until custom timing is turned on", () => {
    renderFields();
    expect(screen.getByText("Run ads all day.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Start time/)).toBeNull();
  });

  it("switches the budget to lifetime and disables daily, and does not switch back", () => {
    renderFields();
    // Nothing is pre-picked: the customer chooses.
    expect(budgetType().value).toBe("");
    expect(budgetType().options[0]?.textContent).toBe("Select type");
    expect(budgetType().required).toBe(true);
    fireEvent.click(timing());
    expect(budgetType().value).toBe("lifetime");
    const daily = Array.from(budgetType().options).find((o) => o.value === "daily");
    expect(daily?.disabled).toBe(true);
    expect(screen.getByText(/Meta requires a lifetime budget for scheduled ad delivery/)).toBeInTheDocument();

    fireEvent.click(timing());
    expect(budgetType().value).toBe("lifetime");
    expect(Array.from(budgetType().options).find((o) => o.value === "daily")?.disabled).toBe(false);
  });

  it("lists end times only after the start, and keeps the end listed", () => {
    renderFields();
    fireEvent.click(timing());
    const start = screen.getByLabelText(/Start time/) as HTMLSelectElement;
    const end = screen.getByLabelText(/End time/) as HTMLSelectElement;
    expect([start.value, end.value]).toEqual(["9:00 AM", "9:00 PM"]);

    fireEvent.change(start, { target: { value: "10:00 PM" } });
    expect(Array.from(end.options).map((o) => o.value)).toEqual(["11:00 PM"]);
    expect(end.value).toBe("11:00 PM");
  });
});

describe("hour lists", () => {
  it("starts today only from the next full hour, and never on the last hour", () => {
    expect(startHours("2026-10-02", "2026-10-02", 14)[0]).toBe("3:00 PM");
    expect(startHours("2026-10-03", "2026-10-02", 14)[0]).toBe("6:00 AM");
    expect(startHours("2026-10-03", "2026-10-02", 14)).not.toContain("11:00 PM");
    expect(startHours("2026-10-02", "2026-10-02", 22)).toEqual([]);
  });

  it("ends only after the start", () => {
    expect(endHours("9:00 PM")).toEqual(["10:00 PM", "11:00 PM"]);
    expect(endHours("")).toEqual([]);
  });
});

describe("the Google variant", () => {
  function renderGoogle() {
    return render(
      <form aria-label="setup">
        <MetaScheduleFields variant="google" budgetAmount={<input name="budgetAmount" aria-label="Budget" />} />
      </form>,
    );
  }
  const options = (select: HTMLSelectElement) => Array.from(select.options).map((o) => o.textContent);

  it("has no custom-timing toggle, and optional hours that start on Any time", () => {
    renderGoogle();
    expect(screen.queryByLabelText("Custom timing schedule")).toBeNull();
    const start = screen.getByLabelText(/Start time/) as HTMLSelectElement;
    const end = screen.getByLabelText(/End time/) as HTMLSelectElement;
    expect([start.value, end.value]).toEqual(["", ""]);
    expect([start.required, end.required]).toEqual([false, false]);
    expect(options(start)[0]).toBe("Any time");
    expect(options(start)[1]).toBe("12:00 AM");
    expect(options(start)).toHaveLength(25);
  });

  it("lists end times only after the start", () => {
    renderGoogle();
    const start = screen.getByLabelText(/Start time/) as HTMLSelectElement;
    fireEvent.change(start, { target: { value: "10:00 PM" } });
    expect(options(screen.getByLabelText(/End time/) as HTMLSelectElement)).toEqual(["Any time", "11:00 PM"]);
  });

  it("keeps daily budgets, with Select type required and nothing pre-picked", () => {
    renderGoogle();
    expect(budgetType().value).toBe("");
    expect(budgetType().required).toBe(true);
    expect(Array.from(budgetType().options).find((o) => o.value === "daily")?.disabled).toBe(false);
  });

  it("carries both no-hours explanations, for the CSS to show", () => {
    renderGoogle();
    expect(screen.getByText("Ad scheduling isn't available for local store and visit campaigns")).toBeInTheDocument();
    expect(screen.getByText(/App campaigns are optimized and delivered automatically by Google Ads/)).toBeInTheDocument();
  });

  it("offers only hours still to come when the campaign starts today", () => {
    expect(startHours("2026-10-02", "2026-10-02", 14, "google")[0]).toBe("3:00 PM");
    expect(startHours("2026-10-02", "2026-10-02", 14, "google")).toContain("11:00 PM");
    expect(startHours("2026-10-03", "2026-10-02", 14, "google")[0]).toBe("12:00 AM");
    expect(endHours("", "google", 14)[0]).toBe("3:00 PM");
    expect(endHours("", "google")).toHaveLength(24);
    expect(endHours("11:00 PM", "google")).toEqual([]);
  });
});
