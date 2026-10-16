import { act, fireEvent, render, screen } from "@testing-library/react";
import { CreativePromptPicker } from "./creative-prompt-picker";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const notYet = async () => ({ ready: false, prompts: [] });

describe("CreativePromptPicker polling", () => {
  it("asks every five seconds", async () => {
    const onPoll = vi.fn(notYet);
    render(<CreativePromptPicker alreadyWriting onPoll={onPoll} onChoose={vi.fn()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    // t = 0, 5s, 10s.
    expect(onPoll).toHaveBeenCalledTimes(3);
  });

  it("gives up after three minutes, says so, and tries again on request", async () => {
    const onPoll = vi.fn(notYet);
    render(<CreativePromptPicker alreadyWriting onPoll={onPoll} onChoose={vi.fn()} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(179_000);
    });
    expect(screen.queryByText("We couldn't write prompts right now.")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.getByText("We couldn't write prompts right now.")).toBeInTheDocument();
    const calls = onPoll.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    // Stopped: no polling while it says it gave up.
    expect(onPoll).toHaveBeenCalledTimes(calls);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByText("We couldn't write prompts right now.")).toBeNull();
    expect(onPoll.mock.calls.length).toBeGreaterThan(calls);
  });

  it("gives up even when a poll never answers", async () => {
    const onPoll = vi.fn(() => new Promise<{ ready: boolean; prompts: [] }>(() => {}));
    render(<CreativePromptPicker alreadyWriting onPoll={onPoll} onChoose={vi.fn()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(screen.getByText("We couldn't write prompts right now.")).toBeInTheDocument();
  });

  it("shows the prompts once they are done", async () => {
    const onPoll = vi.fn(async () => ({
      ready: true,
      prompts: [{ index: 0, model: "gpt", prompt: "A sunny beach", warnings: [] }],
    }));
    render(<CreativePromptPicker alreadyWriting onPoll={onPoll} onChoose={vi.fn()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("A sunny beach")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200_000);
    });
    expect(screen.queryByText("We couldn't write prompts right now.")).toBeNull();
  });
});

describe("CreativePromptPicker skip", () => {
  const ready = async () => ({
    ready: true,
    prompts: [{ index: 0, model: "gpt", prompt: "A sunny beach", warnings: [] }],
  });

  it("shows it is launching and locks the prompt picks while skipping", async () => {
    const onSkip = vi.fn(() => new Promise<void>(() => {}));
    render(
      <CreativePromptPicker alreadyWriting onPoll={ready} onChoose={vi.fn()} onSkip={onSkip} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(screen.getByRole("button", { name: "Launch without choosing a prompt" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    const skip = screen.getByRole("button", { name: "Launching…" });
    expect(skip).toBeDisabled();
    expect(skip).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Use this and launch" })).toBeDisabled();
  });

  it("locks skip while a prompt pick is launching", async () => {
    const onChoose = vi.fn(() => new Promise<{ ok: boolean }>(() => {}));
    const onSkip = vi.fn(async () => {});
    render(
      <CreativePromptPicker alreadyWriting onPoll={ready} onChoose={onChoose} onSkip={onSkip} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(screen.getByRole("button", { name: "Use this and launch" }));
    const skip = screen.getByRole("button", { name: "Launch without choosing a prompt" });
    expect(skip).toBeDisabled();
    fireEvent.click(skip);
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("re-arms and says so when skipping fails", async () => {
    const onSkip = vi.fn(async () => {
      throw new Error("down");
    });
    render(<CreativePromptPicker alreadyWriting onPoll={notYet} onChoose={vi.fn()} onSkip={onSkip} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Launch without choosing a prompt" }));
    });
    expect(screen.getByText("We couldn't launch the campaign. Please try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Launch without choosing a prompt" })).toBeEnabled();
  });
});
