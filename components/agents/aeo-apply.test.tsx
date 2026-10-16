import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AeoApply, type AeoApplyActions } from "./aeo-apply";
import type { ApplyRoute } from "@/lib/data/aeo-deploy";

const ROUTES: ApplyRoute[] = [
  {
    id: "source_pr",
    label: "GitHub pull request",
    from: 46,
    to: 77,
    suggested: true,
    shortfall:
      "GitHub pull request cannot reach 23 points here — Server rendering, AI visibility, Freshness. Another route may.",
  },
  { id: "manual", label: "Copy-paste pack", from: 46, to: 72, suggested: false, shortfall: null },
];

const PREVIEW = {
  repo: "acme/site",
  branch: "main",
  branchNote: "",
  ships: 5,
  heldBack: 2,
  filesChanged: 3,
  addedLines: 40,
  diff: "+ <script>",
  canPush: true,
  pushBlockedReason: "",
  pullRequestUrl: "",
  achievable: 77,
};

function actions(overrides: Partial<AeoApplyActions> = {}): AeoApplyActions {
  return {
    githubStatus: vi.fn().mockResolvedValue({
      ok: true,
      status: {
        configured: true,
        connected: false,
        repo: "",
        installUrl: "https://github.com/apps/x/installations/new",
      },
    }),
    githubRepos: vi.fn().mockResolvedValue({ ok: true, repos: [] }),
    githubDisconnect: vi.fn(),
    preview: vi.fn().mockResolvedValue({ ok: true, preview: PREVIEW }),
    openPullRequest: vi.fn(),
    ...overrides,
  };
}

function renderApply(a = actions()) {
  render(
    <AeoApply
      jobId="job1"
      domain="acme.com"
      routes={ROUTES}
      unavailable={["WordPress plugin (this site is not WordPress)"]}
      actions={a}
    />,
  );
  return a;
}

describe("AeoApply", () => {
  it("shows each route as a tab with its score range, and the suggested one open", async () => {
    renderApply();
    const tab = screen.getByRole("tab", { name: /GitHub pull request/ });
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(tab).toHaveTextContent("46 → 77");
    expect(screen.getByRole("tab", { name: /Copy-paste pack/ })).toHaveTextContent("46 → 72");
    expect(screen.getByText(/cannot reach 23 points here/)).toBeInTheDocument();
    expect(screen.getByText(/Not available here: WordPress plugin/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Connect GitHub" })).toBeInTheDocument();
  });

  it("keeps Preview disabled until a repository is typed", async () => {
    const user = userEvent.setup();
    renderApply();
    const preview = screen.getByRole("button", { name: "Preview" });
    expect(preview).toBeDisabled();
    await user.type(screen.getByLabelText("Repository"), "acme/site");
    expect(preview).toBeEnabled();
  });

  it("previews first, and never offers a pull request before GitHub is connected", async () => {
    const user = userEvent.setup();
    const a = renderApply();
    await user.type(screen.getByLabelText("Repository"), "acme/site");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(
      await screen.findByText(/5 fixes would go into 3 files, 40 lines added/),
    ).toBeInTheDocument();
    expect(a.preview).toHaveBeenCalledWith("job1", "acme/site", "main");
    expect(screen.queryByRole("button", { name: "Open pull request" })).toBeNull();
    expect(screen.getByText("Connect GitHub to open this as a pull request.")).toBeInTheDocument();
    expect(a.openPullRequest).not.toHaveBeenCalled();
  });

  it("opens the pull request only from a preview, when connected", async () => {
    const user = userEvent.setup();
    const a = renderApply(
      actions({
        githubStatus: vi.fn().mockResolvedValue({
          ok: true,
          status: { configured: true, connected: true, repo: "acme/site", installUrl: "" },
        }),
        openPullRequest: vi.fn().mockResolvedValue({
          ok: true,
          preview: { ...PREVIEW, pullRequestUrl: "https://github.com/acme/site/pull/7" },
        }),
      }),
    );
    // The connected repository is filled in for them.
    await waitFor(() => expect(screen.getByLabelText("Repository")).toHaveValue("acme/site"));
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await user.click(await screen.findByRole("button", { name: "Open pull request" }));
    expect(await screen.findByText("Pull request opened")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View the pull request on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/acme/site/pull/7",
    );
    expect(a.openPullRequest).toHaveBeenCalledTimes(1);
  });

  it("offers the connected account's repositories as a list, and picks a lone one", async () => {
    renderApply(
      actions({
        githubStatus: vi.fn().mockResolvedValue({
          ok: true,
          status: { configured: true, connected: true, repo: "", installUrl: "" },
        }),
        githubRepos: vi.fn().mockResolvedValue({ ok: true, repos: ["acme/site"] }),
      }),
    );
    const picker = await screen.findByRole("combobox", { name: "Repository" });
    await waitFor(() => expect(picker).toHaveValue("acme/site"));
  });

  it("brings the Connect box back when the service says to connect first", async () => {
    const user = userEvent.setup();
    const status = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: { configured: true, connected: true, repo: "", installUrl: "" },
      })
      .mockResolvedValue({
        ok: true,
        status: {
          configured: true,
          connected: false,
          repo: "",
          installUrl: "https://github.com/apps/x/installations/new",
        },
      });
    renderApply(
      actions({
        githubStatus: status,
        githubRepos: vi.fn().mockResolvedValue({ ok: true, repos: ["acme/site"] }),
        openPullRequest: vi
          .fn()
          .mockResolvedValue({ ok: false, message: "connect GitHub for this site first" }),
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Repository" })).toHaveValue("acme/site"),
    );
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await user.click(await screen.findByRole("button", { name: "Open pull request" }));
    expect(await screen.findByText("connect GitHub for this site first")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Connect GitHub" })).toBeInTheDocument();
  });

  it("shows while fixes are still being written, with Preview locked", async () => {
    const user = userEvent.setup();
    const a = actions();
    render(
      <AeoApply jobId="job1" domain="acme.com" routes={ROUTES} unavailable={[]} actions={a} writing />,
    );
    await user.type(screen.getByLabelText("Repository"), "acme/site");
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
    expect(screen.getByText(/Preview opens once all the fixes are written/)).toBeInTheDocument();
    expect(a.preview).not.toHaveBeenCalled();
  });

  it("switches panels, and always offers the full report", async () => {
    const user = userEvent.setup();
    renderApply();
    await user.click(screen.getByRole("tab", { name: /Copy-paste pack/ }));
    expect(screen.getByText(/You paste each fix into your site yourself/)).toBeInTheDocument();
    expect(screen.queryByText(/cannot reach 23 points/)).toBeNull();
    // A button now, not an anchor: it fetches the file so it can say it is
    // preparing it (`PendingDownload`).
    expect(screen.getByRole("button", { name: "Download the full report" })).toBeInTheDocument();
  });

  describe("disconnecting GitHub (2026-10-01)", () => {
    const CONNECTED = {
      ok: true as const,
      status: { configured: true, connected: true, repo: "acme/site", installUrl: "https://github.com/apps/x/installations/new" },
    };
    const AFTER = {
      ok: true as const,
      status: { configured: true, connected: false, repo: "", installUrl: "https://github.com/apps/x/installations/new?fresh" },
    };

    it("asks first, then disconnects and offers Connect again", async () => {
      const a = renderApply(
        actions({
          githubStatus: vi.fn().mockResolvedValue(CONNECTED),
          githubDisconnect: vi.fn().mockResolvedValue(AFTER),
        }),
      );
      await userEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
      expect(screen.getByText("Disconnect GitHub for acme.com?")).toBeInTheDocument();
      expect(a.githubDisconnect).not.toHaveBeenCalled();

      const confirm = within(screen.getByRole("group", { name: "Disconnect GitHub for acme.com?" }));
      await userEvent.click(confirm.getByRole("button", { name: "Disconnect" }));
      expect(a.githubDisconnect).toHaveBeenCalledWith("job1", "acme.com");
      expect(await screen.findByText("GitHub disconnected.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Connect GitHub" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "GitHub's settings" })).toHaveAttribute(
        "href",
        "https://github.com/settings/installations",
      );
    });

    it("can be cancelled", async () => {
      const a = renderApply(actions({ githubStatus: vi.fn().mockResolvedValue(CONNECTED), githubDisconnect: vi.fn() }));
      await userEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByText("Disconnect GitHub for acme.com?")).toBeNull();
      expect(a.githubDisconnect).not.toHaveBeenCalled();
    });

    it("keeps the connection and says so when it fails", async () => {
      renderApply(
        actions({
          githubStatus: vi.fn().mockResolvedValue(CONNECTED),
          githubDisconnect: vi.fn().mockResolvedValue({ ok: false, message: "We couldn't disconnect GitHub just now. Nothing changed." }),
        }),
      );
      await userEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
      const confirm = within(screen.getByRole("group", { name: "Disconnect GitHub for acme.com?" }));
      await userEvent.click(confirm.getByRole("button", { name: "Disconnect" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Nothing changed.");
      expect(screen.getByText("GitHub connected")).toBeInTheDocument();
    });
  });
});
