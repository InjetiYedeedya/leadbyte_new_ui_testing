import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CheckboxField, FormError, SelectField, TextField } from "./form";

describe("TextField", () => {
  it("associates its label with the input", () => {
    render(<TextField name="ein" label="EIN" />);
    // getByLabelText only passes if the label is properly wired.
    expect(screen.getByLabelText("EIN")).toBeInTheDocument();
  });

  it("ties the error to the input so it is announced, not just coloured", () => {
    render(<TextField name="ein" label="EIN" error="Must be XX-XXXXXXX" />);
    const input = screen.getByLabelText("EIN");
    const error = screen.getByRole("alert");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
    expect(error).toHaveTextContent("Must be XX-XXXXXXX");
  });

  it("describes itself with the hint when there is no error", () => {
    render(<TextField name="ein" label="EIN" hint="Format: 12-3456789" />);
    const input = screen.getByLabelText("EIN");
    expect(input.getAttribute("aria-describedby")).toContain("hint");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("prefers the error over the hint when both are present", () => {
    render(<TextField name="ein" label="EIN" hint="Format: 12-3456789" error="Required" />);
    expect(screen.queryByText("Format: 12-3456789")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });

  it("marks required fields for both sighted and assistive users", () => {
    render(<TextField name="company" label="Company" required />);
    expect(screen.getByLabelText(/Company/)).toBeRequired();
  });

  it("gives each field a unique id so labels never cross-wire", () => {
    render(
      <>
        <TextField name="first" label="First name" />
        <TextField name="last" label="Last name" />
      </>,
    );
    expect(screen.getByLabelText("First name").id).not.toBe(
      screen.getByLabelText("Last name").id,
    );
  });
});

describe("SelectField", () => {
  it("renders its options", () => {
    render(
      <SelectField
        name="period"
        label="Billing period"
        options={[
          { value: "monthly", label: "Monthly" },
          { value: "yearly", label: "Yearly — save 15%" },
        ]}
      />,
    );
    expect(screen.getByLabelText("Billing period")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Yearly — save 15%" })).toBeInTheDocument();
  });

  it("renders a disabled placeholder so it cannot be submitted as a value", () => {
    render(
      <SelectField
        name="period"
        label="Billing period"
        placeholder="Choose one"
        options={[{ value: "monthly", label: "Monthly" }]}
      />,
    );
    expect(screen.getByRole("option", { name: "Choose one" })).toBeDisabled();
  });
});

describe("CheckboxField", () => {
  it("is labelled and checkable", () => {
    render(<CheckboxField name="terms" label="I accept the terms" />);
    expect(screen.getByRole("checkbox", { name: /I accept the terms/ })).toBeInTheDocument();
  });
});

describe("FormError", () => {
  it("renders nothing when there is no message", () => {
    const { container } = render(<FormError message={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("announces the message when there is one", () => {
    render(<FormError message="Check the highlighted fields." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Check the highlighted fields.");
  });
});
