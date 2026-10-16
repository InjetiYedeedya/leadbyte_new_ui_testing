import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LiveCampaign } from "@/lib/data/campaign-controls";
import { LiveCampaigns } from "./live-campaigns";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => "/agents",
}));

const JOB: LiveCampaign = {
  jobId: "mail_1",
  name: "Spring leads",
  status: "running",
  total: 40,
  sent: 12,
  pending: 28,
  failed: 0,
  createdAt: "2026-10-14T09:00:00Z",
};

const ok = async () => ({ ok: true, message: "Done." });

describe("LiveCampaigns", () => {
  beforeEach(() => refresh.mockClear());

  it("shows each campaign's progress, and says so when nothing is sending", () => {
    const { rerender } = render(<LiveCampaigns jobs={[JOB]} onControl={ok} onStopAll={ok} />);
    expect(screen.getByText("Spring leads")).toBeInTheDocument();
    expect(screen.getByText(/12 of 40 sent · 28 waiting · Started 14 Oct/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "12");

    rerender(<LiveCampaigns jobs={[]} onControl={ok} onStopAll={ok} />);
    expect(screen.getByText("No campaigns are sending right now.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop all" })).toBeNull();
  });

  it("pauses by the campaign's own id and re-reads the list", async () => {
    const user = userEvent.setup();
    const onControl = vi.fn(ok);
    render(<LiveCampaigns jobs={[JOB]} onControl={onControl} onStopAll={ok} />);

    await user.click(screen.getByRole("button", { name: "Pause" }));

    expect(onControl).toHaveBeenCalledWith("mail_1", "pause");
    expect(await screen.findByText("Done.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("asks before cancelling, and Keep running cancels nothing", async () => {
    const user = userEvent.setup();
    const onControl = vi.fn(ok);
    render(<LiveCampaigns jobs={[JOB]} onControl={onControl} onStopAll={ok} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Keep running" }));
    expect(onControl).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Yes, cancel it" }));
    expect(onControl).toHaveBeenCalledWith("mail_1", "cancel");
  });

  it("asks before Stop all, and shows a refusal without re-reading", async () => {
    const user = userEvent.setup();
    const onStopAll = vi.fn(async () => ({ ok: false, message: "We couldn't stop your campaigns." }));
    render(<LiveCampaigns jobs={[JOB]} onControl={ok} onStopAll={onStopAll} />);

    await user.click(screen.getByRole("button", { name: "Stop all" }));
    expect(onStopAll).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Yes, stop all" }));

    expect(onStopAll).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("We couldn't stop your campaigns.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows Resume for a paused campaign and keeps unknown counts out of the line", () => {
    render(
      <LiveCampaigns
        jobs={[{ ...JOB, status: "paused", total: null, sent: null, pending: null, failed: null, createdAt: null }]}
        onControl={ok}
        onStopAll={ok}
      />,
    );
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(screen.getByText("Progress not reported yet")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
