import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectionModeGate } from "./selection-mode-gate";

/**
 * The gate stands between a filled-in campaign brief and the agent, so the two
 * things worth proving are that it cannot be skipped and that it posts the
 * answer the customer actually gave.
 */

/** The form the gate lives in, with a spy for what gets submitted. */
function setup() {
  const submitted: Record<string, string> = {};
  const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    for (const [key, value] of new FormData(event.currentTarget).entries()) {
      submitted[key] = String(value);
    }
  });
  render(
    <form onSubmit={onSubmit}>
      <input type="hidden" name="businessName" defaultValue="Chefgaa" />
      <SelectionModeGate />
    </form>,
  );
  return { submitted, onSubmit };
}

beforeAll(() => {
  // jsdom implements neither, and the component drives a real <dialog>.
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

describe("SelectionModeGate", () => {
  it("asks before the form can be sent", async () => {
    const { onSubmit } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Create campaign" }));

    expect(screen.getByText("Suggestion delivery mode")).toBeInTheDocument();
    // The brief has not gone anywhere yet.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("will not continue until a mode is chosen", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Create campaign" }));

    const confirm = screen.getAllByRole("button", { name: "Create campaign" })[1]!;
    expect(confirm).toBeDisabled();

    await userEvent.click(screen.getByRole("radio", { name: /Ask before acting/ }));
    expect(confirm).toBeEnabled();
  });

  it("posts the chosen mode with the rest of the brief", async () => {
    const { submitted, onSubmit } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Create campaign" }));
    await userEvent.click(screen.getByRole("radio", { name: /Act without asking/ }));
    await userEvent.click(screen.getAllByRole("button", { name: "Create campaign" })[1]!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(submitted.selectionMode).toBe("auto");
    // …and it is the same submit, so the campaign brief travels with it.
    expect(submitted.businessName).toBe("Chefgaa");
  });

  it("sends ask as ask", async () => {
    const { submitted, onSubmit } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Create campaign" }));
    await userEvent.click(screen.getByRole("radio", { name: /Ask before acting/ }));
    await userEvent.click(screen.getAllByRole("button", { name: "Create campaign" })[1]!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(submitted.selectionMode).toBe("ask");
  });

  it("posts nothing if the customer backs out", async () => {
    const { onSubmit } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Create campaign" }));
    await userEvent.click(screen.getByRole("radio", { name: /Act without asking/ }));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByText("Suggestion delivery mode")).not.toBeVisible();
  });
});
