import { act, fireEvent, render, screen } from "@testing-library/react";
import { NavPendingBody, NavTabLink, NavTransitionProvider } from "./nav-transition";

/**
 * The body swaps to the loader when a navigation runs long, and — just as
 * importantly — does NOT when it is quick. A loader that appears and vanishes
 * inside a tenth of a second reads as a glitch, and the cached navigations this
 * app is full of are exactly that fast.
 */

let pathname = "/overview";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/link", () => ({
  default: ({ children, onClick, href }: never) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

/** The loader's own mark — the turning ring, and nothing else animates. */
const LOADER = ".animate-page-loading";

function Tabs() {
  return (
    <NavTransitionProvider>
      <NavTabLink href="/analytics">Dashboard</NavTabLink>
      <NavTabLink href="/agents">Agents</NavTabLink>
      <NavPendingBody>
        <p>the current page</p>
      </NavPendingBody>
    </NavTransitionProvider>
  );
}

beforeEach(() => {
  pathname = "/overview";
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

/**
 * `fireEvent`, not `userEvent`: userEvent drives its own clock and deadlocks
 * against the fake timers these tests need, hanging every case for 5s.
 */
function press(label: string) {
  act(() => void fireEvent.click(screen.getByText(label)));
}

describe("NavPendingBody", () => {
  it("shows the page, not a loader, when nothing is navigating", () => {
    const { container } = render(<Tabs />);
    expect(screen.getByText("the current page")).toBeInTheDocument();
    expect(container.querySelector(LOADER)).toBeNull();
  });

  it("holds the current page through a short navigation", async () => {
    const { container } = render(<Tabs />);
    press("Dashboard");
    await act(async () => void vi.advanceTimersByTime(200));

    expect(screen.getByText("the current page")).toBeInTheDocument();
    expect(container.querySelector(LOADER)).toBeNull();
  });

  /**
   * The measured failure this exists for: a tab click left the previous screen
   * complete and unchanged for 2.7s while the server worked.
   */
  it("shows the loader once a navigation runs long", async () => {
    const { container } = render(<Tabs />);
    press("Dashboard");
    await act(async () => void vi.advanceTimersByTime(400));

    expect(container.querySelector(LOADER)).not.toBeNull();
    expect(screen.queryByText("the current page")).not.toBeInTheDocument();
  });

  /**
   * Arriving is what clears it, and arriving means the PATH changed — not that
   * the link reported anything. The tab strip is inside `PageShell`'s Suspense
   * and used to unmount mid-navigation, taking any link-held state with it.
   */
  it("clears when the new path arrives", async () => {
    const view = render(<Tabs />);
    press("Dashboard");
    await act(async () => void vi.advanceTimersByTime(400));
    expect(view.container.querySelector(LOADER)).not.toBeNull();

    pathname = "/analytics";
    await act(async () => void view.rerender(<Tabs />));
    await act(async () => void vi.advanceTimersByTime(400));

    expect(screen.getByText("the current page")).toBeInTheDocument();
  });

  /**
   * A navigation that never commits — a redirect that is refused, a route that
   * throws before rendering — would otherwise leave the loader up for good,
   * which is a worse failure than the dead screen this fixes.
   */
  it("gives up rather than loading forever", async () => {
    const { container } = render(<Tabs />);
    press("Dashboard");
    await act(async () => void vi.advanceTimersByTime(400));
    expect(container.querySelector(LOADER)).not.toBeNull();

    // Two advances: the first fires the give-up timer, whose state change only
    // reaches the loader's own effect once React has flushed it.
    await act(async () => void vi.advanceTimersByTime(16000));
    await act(async () => void vi.advanceTimersByTime(400));
    expect(screen.getByText("the current page")).toBeInTheDocument();
  });
});

describe("NavTabLink", () => {
  /**
   * The tab strip animates NOTHING. It used to spin a ring beside the pressed
   * tab's label, so a navigation ran two animations at once — that ring, and
   * `PageLoading` in the body arriving beneath it. One wait, one animation,
   * and it belongs where the content will appear, not in the nav.
   */
  it("never animates, however long the navigation takes", async () => {
    const { container } = render(<Tabs />);
    press("Dashboard");

    await act(async () => void vi.advanceTimersByTime(200));
    expect(container.querySelector(".animate-spin")).toBeNull();

    await act(async () => void vi.advanceTimersByTime(4000));
    expect(container.querySelector(".animate-spin")).toBeNull();
  });
});
