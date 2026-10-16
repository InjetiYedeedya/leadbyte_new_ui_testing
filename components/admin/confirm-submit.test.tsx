import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmSubmit } from "./confirm-submit";

// jsdom has no <dialog> behaviour; give it just enough to open and close.
beforeAll(() => {
  // The scroll lock restores the reader's place with scrollTo, which jsdom lacks.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

function setup(onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())) {
  render(
    <form onSubmit={onSubmit}>
      <ConfirmSubmit title="Revoke access?" body="They lose access." confirmLabel="Revoke" pendingLabel="Revoking…">
        Revoke
      </ConfirmSubmit>
    </form>,
  );
  return onSubmit;
}

describe("ConfirmSubmit", () => {
  it("asks before submitting, and submits on confirm", async () => {
    const user = userEvent.setup();
    const onSubmit = setup();

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("They lose access.")).toBeInTheDocument();

    const buttons = screen.getAllByRole("button", { name: "Revoke", hidden: true });
    await user.click(buttons[buttons.length - 1]!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does nothing when cancelled", async () => {
    const user = userEvent.setup();
    const onSubmit = setup();

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    await user.click(screen.getByRole("button", { name: "Cancel", hidden: true }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
