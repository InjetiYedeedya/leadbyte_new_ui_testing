import { act, fireEvent, render, screen } from "@testing-library/react";
import { FlashNotice } from "./flash-notice";

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, "", "/intelligence/connections?connected=linkedin-ads&state=pending&tab=ads");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FlashNotice", () => {
  it("wipes its own values from the address, so a refresh does not replay it", () => {
    render(<FlashNotice clear={["connected", "state"]}>LinkedIn Ads connected.</FlashNotice>);
    // Only the values it was made from; anything else in the address stays.
    expect(window.location.search).toBe("?tab=ads");
  });

  it("leaves on its own after six seconds", () => {
    render(<FlashNotice>Saved.</FlashNotice>);
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    // Then the fade, which starts once the time is up.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("gives a problem longer to be read", () => {
    render(<FlashNotice role="alert">We couldn&apos;t save that.</FlashNotice>);
    act(() => {
      vi.advanceTimersByTime(7_000);
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("waits while the reader is pointing at it", () => {
    render(<FlashNotice>Saved.</FlashNotice>);
    fireEvent.mouseEnter(screen.getByRole("status").parentElement!.parentElement!);
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has no close button — it only leaves on its own", () => {
    render(<FlashNotice>Saved.</FlashNotice>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
