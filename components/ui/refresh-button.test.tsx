import { fireEvent, render, screen } from "@testing-library/react";
import { RefreshButton } from "./refresh-button";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// A mocked refresh settles at once under jsdom, so the pending state is pinned
// here rather than raced.
const transition = vi.hoisted(() => ({ pending: false }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useTransition: () => {
      const [pending, start] = actual.useTransition();
      return [transition.pending || pending, start] as const;
    },
  };
});

afterEach(() => {
  refresh.mockReset();
  transition.pending = false;
});

describe("RefreshButton", () => {
  it("asks the server for the page again", () => {
    render(<RefreshButton>Try again</RefreshButton>);
    const button = screen.getByRole("button", { name: "Try again" });
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "false");
    fireEvent.click(button);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("disables itself and says what it is doing while the read is pending", () => {
    transition.pending = true;
    render(<RefreshButton pendingLabel="Checking again…">Check again</RefreshButton>);
    const button = screen.getByRole("button", { name: "Checking again…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector(".animate-spin")).not.toBeNull();
  });

  it("is an inline row by default and stands aside for a caller's own display", () => {
    const { rerender } = render(<RefreshButton className="flex-1">Try again</RefreshButton>);
    expect(screen.getByRole("button").className).toContain("inline-flex");
    rerender(<RefreshButton className="flex w-full">Try again</RefreshButton>);
    expect(screen.getByRole("button").className).not.toContain("inline-flex");
  });
});
