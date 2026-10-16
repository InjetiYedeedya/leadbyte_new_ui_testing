import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SocialAccountDialog } from "./social-account-dialog";

/**
 * The picker decides where a business publishes, so the things worth proving
 * are that it submits the account the customer actually chose, and that every
 * way out of it — button, Escape, backdrop — goes through the confirmation
 * rather than around it.
 *
 * The accounts below are the real Facebook payload (2026-09-11), kept for the
 * duplicate name: two distinct pages both called "Ntimes AI" is why the id is
 * rendered under each one.
 */

const ACCOUNTS = [
  { name: "Ntimes AI", id: "1077389505465009" },
  { name: "Healzy", id: "1064631706727201" },
  { name: "LeadByte AI", id: "1002719136257600" },
  { name: "Ntimes AI", id: "879394841918563" },
];

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

function setup() {
  const submitted: Record<string, string> = {};
  const action = vi.fn((formData: FormData) => {
    for (const [key, value] of formData.entries()) submitted[key] = String(value);
  });
  const abandoned: Record<string, string> = {};
  const abandonAction = vi.fn((formData: FormData) => {
    for (const [key, value] of formData.entries()) abandoned[key] = String(value);
  });
  render(
    <SocialAccountDialog
      platform="facebook"
      label="Facebook"
      accounts={ACCOUNTS}
      action={action}
      abandonAction={abandonAction}
    />,
  );
  return { submitted, action, abandoned, abandonAction };
}

describe("SocialAccountDialog", () => {
  it("opens on mount, because the page only renders it when the question is live", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Choose a Facebook account" })).toBeInTheDocument();
  });

  it("offers every account the connection returned", () => {
    setup();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
  });

  it("shows the id, because two pages share a name", () => {
    setup();
    // Both are called "Ntimes AI". Without the id the choice is a coin toss.
    expect(screen.getAllByText("Ntimes AI")).toHaveLength(2);
    expect(screen.getByText("1077389505465009")).toBeInTheDocument();
    expect(screen.getByText("879394841918563")).toBeInTheDocument();
  });

  it("submits the account chosen, with the platform alongside it", async () => {
    const { submitted, action } = setup();

    await userEvent.click(screen.getByRole("radio", { name: /Healzy/ }));
    await userEvent.click(screen.getByRole("button", { name: "Use this account" }));

    expect(action).toHaveBeenCalledOnce();
    expect(submitted).toEqual({ platform: "facebook", accountId: "1064631706727201" });
  });

  it("pre-selects the first, so the common case is one click", async () => {
    const { submitted } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Use this account" }));
    expect(submitted.accountId).toBe("1077389505465009");
  });

  /**
   * Leaving is a decision, not a postponement — consent without a chosen page
   * connects nothing the agent can use. So "Later" asks, and only the second
   * button records it.
   */
  it("asks before letting anyone leave, and saves nothing either way yet", async () => {
    const { action, abandonAction } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Later" }));

    expect(
      screen.getByRole("heading", { name: "Leave without connecting?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No account will be connected.")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
    expect(abandonAction).not.toHaveBeenCalled();
  });

  it("goes back to the list, with the accounts still there", async () => {
    const { abandonAction } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Later" }));
    await userEvent.click(screen.getByRole("button", { name: "Choose an account" }));

    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(abandonAction).not.toHaveBeenCalled();
  });

  /**
   * The warning says no account will be connected, and this is the call that
   * makes that true — the server marks the platform declined, so the row and
   * the agent's gate both stop counting it.
   */
  it("records the refusal when it is confirmed", async () => {
    const { abandoned, abandonAction, action } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Later" }));
    await userEvent.click(screen.getByRole("button", { name: "Leave without connecting" }));

    expect(abandonAction).toHaveBeenCalledOnce();
    expect(abandoned).toEqual({ platform: "facebook" });
    // Emphatically not saved as a choice.
    expect(action).not.toHaveBeenCalled();
  });

  /**
   * Escape is the fastest way out of a modal, so it is the one most likely to
   * be pressed by accident. It asks rather than leaving, and from the question
   * it returns to the list rather than confirming.
   *
   * The `cancel` event is dispatched rather than the key pressed: jsdom does
   * not implement `<dialog>`'s Escape handling at all, so `{Escape}` reaches
   * nothing. `cancel` is what a real browser fires, and it is what the
   * component listens for.
   */
  it("cannot be escaped past", async () => {
    const { abandonAction } = setup();
    const escape = () =>
      screen.getByRole("dialog").dispatchEvent(new Event("cancel", { cancelable: true }));

    await act(async () => void escape());
    expect(screen.getByRole("heading", { name: "Leave without connecting?" })).toBeInTheDocument();

    await act(async () => void escape());
    expect(screen.getByRole("heading", { name: "Choose a Facebook account" })).toBeInTheDocument();
    expect(abandonAction).not.toHaveBeenCalled();
  });
});
