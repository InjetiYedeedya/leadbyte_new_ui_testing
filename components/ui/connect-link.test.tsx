import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectLink } from "./connect-link";

/**
 * The OAuth starts are the deadest controls in the app — a full-page
 * navigation into someone else's consent screen, with nothing on screen until
 * it arrives. What matters is that adding the feedback did not break the
 * navigation, and that the ring can always stop.
 */

describe("ConnectLink", () => {
  it("stays a real link, because consent is a redirect chain the browser walks", () => {
    render(<ConnectLink href="/api/oauth/facebook">Connect</ConnectLink>);
    const link = screen.getByRole("link", { name: "Connect" });
    expect(link).toHaveAttribute("href", "/api/oauth/facebook");
  });

  it("reports itself as working once clicked", async () => {
    render(
      <ConnectLink href="/api/oauth/facebook" pendingLabel="Opening…">
        Connect
      </ConnectLink>,
    );
    const link = screen.getByRole("link");

    await userEvent.click(link);

    expect(link).toHaveAttribute("aria-busy", "true");
    expect(link).toHaveTextContent("Opening…");
    // A second consent started while the first is loading is a wasted trip
    // through someone else's approval screen.
    expect(link.className).toContain("pointer-events-none");
  });

  /**
   * A card with an icon, a title and a blurb loses more by being replaced with
   * one word than the word adds, so those callers pass no label.
   */
  it("keeps rich content when given no pending label", async () => {
    render(
      <ConnectLink href="/api/email/gmail">
        <span>Gmail</span>
        <span>Connect using your Google account</span>
      </ConnectLink>,
    );

    await userEvent.click(screen.getByRole("link"));

    expect(screen.getByText("Gmail")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("aria-busy", "true");
  });

  /**
   * A ctrl/cmd-click opens a new tab and leaves THIS page exactly where it is,
   * so a spinner here would never stop — and the control it is on would be
   * left unclickable for the rest of the session.
   */
  it("does not report working when the click opens a new tab", async () => {
    render(
      <ConnectLink href="/api/oauth/facebook" pendingLabel="Opening…">
        Connect
      </ConnectLink>,
    );
    const link = screen.getByRole("link");

    fireEvent.click(link, { ctrlKey: true });

    expect(link).toHaveAttribute("aria-busy", "false");
    expect(link).toHaveTextContent("Connect");
  });

  /**
   * The back button restores the page from the bfcache with React state intact.
   * Without the `pageshow` reset, someone who approves nothing and comes back
   * finds a control that has been "opening" ever since — and, because of the
   * pointer-events guard, one they cannot click again.
   */
  it("stops when the page is restored by the back button", async () => {
    render(
      <ConnectLink href="/api/oauth/facebook" pendingLabel="Opening…">
        Connect
      </ConnectLink>,
    );
    const link = screen.getByRole("link");
    await userEvent.click(link);
    expect(link).toHaveAttribute("aria-busy", "true");

    fireEvent(window, new Event("pageshow"));

    expect(link).toHaveAttribute("aria-busy", "false");
    expect(link).toHaveTextContent("Connect");
    expect(link.className).not.toContain("pointer-events-none");
  });
});
