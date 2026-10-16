import { describe, expect, it, vi, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AgentDashboardSplit,
  AgentRowLink,
  PanelControls,
  type DashboardLoader,
} from "./agent-dashboard-split";

/** A loader whose replies the test hands out, in any order. */
function deferredLoader() {
  const pending: { tab: string; resolve: (node: React.ReactNode) => void; reject: (e: unknown) => void }[] = [];
  const load = vi.fn<DashboardLoader>(
    (tab) =>
      new Promise((resolve, reject) => {
        pending.push({ tab, resolve, reject });
      }),
  );
  return { load, pending };
}

function renderSplit(load: DashboardLoader, initial: { tab?: "lead-qualification"; content?: React.ReactNode } = {}) {
  return render(
    <AgentDashboardSplit
      list={
        <div>
          <p>List</p>
          <div className="relative">
            <AgentRowLink agentId="lead-qualification" />
          </div>
          <div className="relative">
            <AgentRowLink agentId="social-media" />
          </div>
        </div>
      }
      initialTab={initial.tab ?? null}
      initialContent={initial.content ?? null}
      locked={["meta-ads"]}
      load={load}
    />,
  );
}

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe("AgentDashboardSplit", () => {
  it("starts on the list alone when no agent is picked", () => {
    renderSplit(deferredLoader().load);
    expect(screen.getByText("List")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close the dashboard" })).toBeNull();
  });

  it("opens the panel at once with ONE loader in the card, then the figures", async () => {
    const user = userEvent.setup();
    const { load, pending } = deferredLoader();
    renderSplit(load);

    await user.click(screen.getAllByRole("link", { name: /View dashboard/ })[0]!);

    // The panel is there before anything has been read…
    expect(screen.getByRole("button", { name: "Close the dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading dashboard");
    expect(load).toHaveBeenCalledWith("lead-qualification");
    // …the URL follows it, in place…
    expect(window.location.search).toBe("?agent=lead-qualification");
    // …and the list stays where it was.
    expect(screen.getByText("List")).toBeInTheDocument();

    await act(async () => pending[0]!.resolve(<p>Lead figures</p>));
    expect(screen.getByText("Lead figures")).toBeInTheDocument();
    expect(screen.queryByText("Loading dashboard…")).toBeNull();
    expect(screen.getByRole("link", { name: /Showing dashboard/ })).toHaveAttribute("data-selected", "true");
  });

  it("refreshes only the panel, keeping the figures on screen until the new ones land", async () => {
    const user = userEvent.setup();
    const { load, pending } = deferredLoader();
    renderSplit(load, { tab: "lead-qualification", content: <p>Old figures</p> });

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(load).toHaveBeenCalledWith("lead-qualification");
    expect(screen.getByRole("button", { name: /Refreshing/ })).toBeDisabled();
    expect(screen.getByText("Old figures")).toBeInTheDocument();

    await act(async () => pending[0]!.resolve(<p>New figures</p>));
    expect(screen.getByText("New figures")).toBeInTheDocument();
    expect(screen.queryByText("Old figures")).toBeNull();
  });

  it("ignores a slow reply for a tab already left behind", async () => {
    const user = userEvent.setup();
    const { load, pending } = deferredLoader();
    renderSplit(load);

    const [lead, social] = screen.getAllByRole("link", { name: /View dashboard/ });
    await user.click(lead!);
    await user.click(social!);

    await act(async () => pending[1]!.resolve(<p>Social figures</p>));
    await act(async () => pending[0]!.resolve(<p>Lead figures</p>));
    expect(screen.getByText("Social figures")).toBeInTheDocument();
    expect(screen.queryByText("Lead figures")).toBeNull();
  });

  it("says so, with a way to try again, when a dashboard cannot be read", async () => {
    const user = userEvent.setup();
    const { load, pending } = deferredLoader();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderSplit(load);

    await user.click(screen.getAllByRole("link", { name: /View dashboard/ })[0]!);
    await act(async () => pending[0]!.reject(new Error("timeout")));

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load this dashboard");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("closes without asking the server, and keeps the panel until it has slid away", async () => {
    const { load } = deferredLoader();
    renderSplit(load, { tab: "lead-qualification", content: <p>Figures</p> });
    vi.useFakeTimers();

    act(() => screen.getByRole("button", { name: "Close the dashboard" }).click());
    expect(load).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
    // Still there while it animates out…
    expect(screen.getByText("Figures")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    // …still there part way through the close, which runs longer than the open…
    expect(screen.getByText("Figures")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(700);
    });
    // …and gone once it has.
    expect(screen.queryByText("Figures")).toBeNull();
  });

  it("returns to the list on Back after opening a dashboard from it", async () => {
    const user = userEvent.setup();
    renderSplit(deferredLoader().load);
    const before = window.history.length;

    await user.click(screen.getAllByRole("link", { name: /View dashboard/ })[0]!);
    expect(window.location.search).toBe("?agent=lead-qualification");
    // Its own history entry, so Back has somewhere to go that is still here.
    expect(window.history.length).toBe(before + 1);

    act(() => window.history.back());
    await waitFor(() => expect(window.location.search).toBe(""));
    await waitFor(
      () => expect(screen.queryByRole("button", { name: "Close the dashboard" })).toBeNull(),
      { timeout: 2000 },
    );
    expect(screen.getByText("List")).toBeInTheDocument();
  });

  it("switches agents without adding to history, so Back is one step to the list", async () => {
    const user = userEvent.setup();
    renderSplit(deferredLoader().load);
    const [first, second] = screen.getAllByRole("link", { name: /View dashboard/ });

    await user.click(first!);
    await user.click(second!);
    expect(window.location.search).toBe("?agent=social-media");

    // ONE Back: straight to the list, not to the first agent looked at.
    act(() => window.history.back());
    await waitFor(() => expect(window.location.search).toBe(""));
    await waitFor(
      () => expect(screen.queryByRole("button", { name: "Close the dashboard" })).toBeNull(),
      { timeout: 2000 },
    );
  });

  it("steps back through its own entry when closed, rather than leaving it behind", async () => {
    const user = userEvent.setup();
    renderSplit(deferredLoader().load);
    await user.click(screen.getAllByRole("link", { name: /View dashboard/ })[0]!);

    await user.click(screen.getByRole("button", { name: "Close the dashboard" }));
    await waitFor(() => expect(window.location.search).toBe(""));
    await waitFor(
      () => expect(screen.queryByRole("button", { name: "Close the dashboard" })).toBeNull(),
      { timeout: 2000 },
    );
  });

  it("moves its controls into the tab's own title row, and draws one close button either way", () => {
    const { unmount } = renderSplit(deferredLoader().load, {
      tab: "lead-qualification",
      content: (
        <header>
          <h3>Lead Qualification Agent</h3>
          <PanelControls />
        </header>
      ),
    });
    const [close, ...extra] = screen.getAllByRole("button", { name: "Close the dashboard" });
    expect(extra).toHaveLength(0);
    // In the tab's row, not a row of the panel's own.
    expect(close!.closest("header")).toHaveTextContent("Lead Qualification Agent");
    unmount();

    // A tab with no slot for them still gets its close button.
    renderSplit(deferredLoader().load, { tab: "lead-qualification", content: <p>Figures</p> });
    expect(screen.getAllByRole("button", { name: "Close the dashboard" })).toHaveLength(1);
  });

  // The tab strip that carried every agent's name across the top of the panel
  // was removed (2026-10-09): the list beside it already selects an agent, and
  // a locked agent is reached from its own row there. The strip's own test
  // still covers the component itself.
});
