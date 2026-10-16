import { fireEvent, render } from "@testing-library/react";
import { DatePickerOnClick } from "@/components/ui/date-picker-on-click";

function field(type: string, extra: Partial<HTMLInputElement> = {}) {
  const input = document.createElement("input");
  input.type = type;
  Object.assign(input, extra);
  const showPicker = vi.fn();
  input.showPicker = showPicker;
  document.body.appendChild(input);
  return { input, showPicker };
}

describe("DatePickerOnClick", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens the calendar when a date field is clicked anywhere", () => {
    render(<DatePickerOnClick />);
    const { input, showPicker } = field("date");
    fireEvent.click(input);
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it("leaves other fields, and disabled or read-only date fields, alone", () => {
    render(<DatePickerOnClick />);
    const text = field("text");
    const disabled = field("date", { disabled: true });
    const readOnly = field("date", { readOnly: true });
    fireEvent.click(text.input);
    fireEvent.click(disabled.input);
    fireEvent.click(readOnly.input);
    expect(text.showPicker).not.toHaveBeenCalled();
    expect(disabled.showPicker).not.toHaveBeenCalled();
    expect(readOnly.showPicker).not.toHaveBeenCalled();
  });

  it("does not break when the browser refuses to open the picker", () => {
    render(<DatePickerOnClick />);
    const { input, showPicker } = field("date");
    showPicker.mockImplementation(() => {
      throw new DOMException("NotAllowedError");
    });
    expect(() => fireEvent.click(input)).not.toThrow();
  });
});
