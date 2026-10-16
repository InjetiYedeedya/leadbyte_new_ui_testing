import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubmitButton } from "./submit-button";

/**
 * The button's whole job is to answer "did my click land?" while a Server
 * Action runs. Twenty submit buttons now depend on it, so the pending state is
 * what these tests are about — not the styling.
 *
 * The forms are given an action that never resolves on purpose: that is the
 * state the customer sits in, and it is the state that used to look identical
 * to a dead button.
 */

/** A Server Action that is still running — the case that matters. */
function neverResolves(): Promise<void> {
  return new Promise<void>(() => {});
}

describe("SubmitButton", () => {
  it("shows its own label and is pressable before anything is submitted", () => {
    render(
      <form action={neverResolves}>
        <SubmitButton pendingLabel="Asking the agent…">Launch this agent</SubmitButton>
      </form>,
    );

    const button = screen.getByRole("button", { name: "Launch this agent" });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-busy", "true");
  });

  it("says what is happening and refuses a second press while the action runs", async () => {
    render(
      <form action={neverResolves}>
        <SubmitButton pendingLabel="Asking the agent…">Launch this agent</SubmitButton>
      </form>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Launch this agent" }));

    // The label is the acknowledgement: the press is reported in words, not
    // only by a spinner someone has to notice.
    const button = await screen.findByRole("button", { name: /Asking the agent…/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("button", { name: "Launch this agent" })).not.toBeInTheDocument();
  });

  it("shows exactly one spinner while pending, and none before", async () => {
    const { container } = render(
      <form action={neverResolves}>
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </form>,
    );

    expect(container.querySelectorAll(".animate-spin")).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByRole("button", { name: /Saving…/ });
    const spinners = container.querySelectorAll(".animate-spin");
    expect(spinners).toHaveLength(1);
    // Decoration, not content — a screen reader reads the label, not this.
    expect(spinners[0]).toHaveAttribute("aria-hidden", "true");
    // The one animation still has to stop for anyone who asked it to.
    expect(spinners[0]?.className).toContain("motion-reduce:animate-none");
  });

  it("dims itself when disabled, so a dead button never looks live", () => {
    render(
      <form action={neverResolves}>
        <SubmitButton pendingLabel="Saving…" disabled>
          Save
        </SubmitButton>
      </form>,
    );

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button.className).toContain("disabled:opacity-70");
  });

  it("keeps a caller's own classes alongside its own", () => {
    render(
      <form action={neverResolves}>
        <SubmitButton pendingLabel="Saving…" className="bg-accent text-ground">
          Save
        </SubmitButton>
      </form>,
    );

    const button = screen.getByRole("button", { name: "Save" });
    expect(button.className).toContain("bg-accent");
    expect(button.className).toContain("transition");
    expect(button.className).toContain("inline-flex");
  });

  it("does not impose a display on a caller that lays itself out", () => {
    // Two display utilities in one class string resolve by stylesheet order,
    // not by which was written last — so the card-shaped submit in
    // `connect-google` would lay out differently depending on Tailwind's emit
    // order. Only one display utility may end up on the element.
    render(
      <form action={neverResolves}>
        <SubmitButton pendingLabel="Moving…" className="flex w-full justify-between">
          Move to strategy
        </SubmitButton>
      </form>,
    );

    const button = screen.getByRole("button", { name: "Move to strategy" });
    expect(button.className).toContain("flex");
    expect(button.className).not.toContain("inline-flex");
    // The spinner still needs its row and its gap.
    expect(button.className).toContain("items-center");
    expect(button.className).toContain("gap-2");
  });

  it("can be a menu item — the account menu's Sign out is both", () => {
    render(
      <form action={neverResolves}>
        <SubmitButton pendingLabel="Signing out…" role="menuitem">
          Sign out
        </SubmitButton>
      </form>,
    );

    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
  });
});
