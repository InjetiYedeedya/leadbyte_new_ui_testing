import { act, fireEvent, render, screen } from "@testing-library/react";
import { ConnectGithub } from "./connect-github";
import { repoSummary } from "./github-row";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const INSTALL = "https://github.com/apps/leadbyte/installations/new";

describe("ConnectGithub", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockClear();
    vi.spyOn(window, "open").mockReturnValue(null);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("opens GitHub in a new tab and refreshes the page once the connection lands", async () => {
    const check = vi
      .fn()
      .mockResolvedValueOnce({ connected: false })
      .mockResolvedValueOnce({ connected: true });
    render(<ConnectGithub installUrl={INSTALL} connected={false} check={check} />);

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(window.open).toHaveBeenCalledWith(INSTALL, "_blank", "noopener,noreferrer");
    expect(screen.getByRole("button", { name: /Waiting for GitHub/ })).toBeDisabled();

    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(refresh).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Connect" })).toBeEnabled();
  });

  it("says so when GitHub never answers, instead of quietly resetting", async () => {
    const check = vi.fn().mockResolvedValue({ connected: false });
    render(<ConnectGithub installUrl={INSTALL} connected={false} check={check} />);

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await act(() => vi.advanceTimersByTimeAsync(5 * 60_000 + 2000));
    expect(screen.getByText(/didn't hear back/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not wait when changing repositories on an existing connection", () => {
    const check = vi.fn();
    render(<ConnectGithub installUrl={INSTALL} connected check={check} />);

    fireEvent.click(screen.getByRole("button", { name: "Change repositories" }));
    expect(window.open).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Change repositories" })).toBeEnabled();
  });

  it("offers no button when there is no install page", () => {
    render(<ConnectGithub installUrl="" connected={false} check={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Not available right now")).toBeInTheDocument();
  });
});

describe("repoSummary", () => {
  it("names one or two repositories and counts the rest", () => {
    expect(repoSummary([])).toBe("");
    expect(repoSummary(["acme/site"])).toBe("acme/site");
    expect(repoSummary(["acme/site", "acme/blog"])).toBe("acme/site and acme/blog");
    expect(repoSummary(["acme/site", "acme/blog", "acme/docs"])).toBe("acme/site and 2 more");
  });
});
