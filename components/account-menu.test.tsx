import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountMenu } from "./account-menu";

/**
 * `logout` is a Server Action. It cannot run under jsdom — importing it pulls
 * in `next/headers` — and what matters here is that Sign out is present and
 * submits, not what the action does. The action has its own coverage.
 */
vi.mock("@/app/logout/actions", () => ({ logout: vi.fn() }));

const EMAIL = "charan.pullepu@ntimes.ai";

function setup() {
  return {
    user: userEvent.setup(),
    ...render(<AccountMenu initials="CP" email={EMAIL} />),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("AccountMenu", () => {
  it("starts closed, showing only the avatar", () => {
    setup();

    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("names the account it belongs to, for screen readers and on open", async () => {
    const { user } = setup();

    // The initials alone are ambiguous once someone has two addresses.
    expect(screen.getByRole("button")).toHaveAccessibleName(`Account menu for ${EMAIL}`);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("menu")).toHaveTextContent(EMAIL);
  });

  it("opens on click and offers Settings and Sign out", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { expanded: false }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
  });

  it("closes again on a second click", async () => {
    const { user } = setup();
    const trigger = screen.getByRole("button");

    await user.click(trigger);
    await user.click(trigger);

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Escape and hands focus back to the avatar", async () => {
    const { user } = setup();
    const trigger = screen.getByRole("button");

    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    // Without this a keyboard user has to tab the whole page to get back.
    expect(trigger).toHaveFocus();
  });

  it("closes when something else is pressed", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button"));
    await user.click(document.body);

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("keeps the avatar a 44px target however small the circle is drawn", () => {
    setup();

    expect(screen.getByRole("button").className).toContain("min-h-11");
    expect(screen.getByRole("button").className).toContain("min-w-11");
  });
});
