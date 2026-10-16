import { fireEvent, render, screen } from "@testing-library/react";
import { SemiDateRange, dayAfter } from "./semi-date-range";
import type { SemiField } from "@/lib/data/semi-form";

describe("SemiDateRange", () => {
  const field = (label: string): SemiField => ({ label, type: "date", placeholder: "", defaultValue: "", required: true, options: [] });

  it("never lets the end date sit on or before the start", () => {
    render(<SemiDateRange start={field("Start Date")} end={field("End Date")} startName="s" endName="e" />);
    const start = screen.getByLabelText(/Start Date/) as HTMLInputElement;
    const end = screen.getByLabelText(/End Date/) as HTMLInputElement;
    fireEvent.change(start, { target: { value: "2099-10-02" } });
    expect(end.min).toBe("2099-10-03");
    fireEvent.change(end, { target: { value: "2099-10-10" } });
    // Moving the start past the end clears the end.
    fireEvent.change(start, { target: { value: "2099-10-12" } });
    expect(end.value).toBe("");
  });

  it("works out the next day across a month end", () => {
    expect(dayAfter("2026-09-30")).toBe("2026-10-01");
    expect(dayAfter("")).toBe("");
  });
});
