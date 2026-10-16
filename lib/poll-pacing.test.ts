import { pollDelay, whenVisible } from "./poll-pacing";

describe("pollDelay", () => {
  it("keeps the screen's own pace for the first two minutes", () => {
    expect(pollDelay(1500, 0)).toBe(1500);
    expect(pollDelay(1500, 119_000)).toBe(1500);
  });

  it("backs off to 15s, then 60s after ten minutes", () => {
    expect(pollDelay(1500, 2 * 60_000)).toBe(15_000);
    expect(pollDelay(1500, 10 * 60_000)).toBe(60_000);
  });

  it("never makes a slow poller faster", () => {
    expect(pollDelay(120_000, 30 * 60_000)).toBe(120_000);
  });
});

describe("whenVisible", () => {
  function setVisibility(state: DocumentVisibilityState) {
    Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  }

  afterEach(() => setVisibility("visible"));

  it("resolves at once in a visible tab", async () => {
    setVisibility("visible");
    await expect(whenVisible()).resolves.toBeUndefined();
  });

  it("waits in a hidden tab until it is shown again", async () => {
    setVisibility("hidden");
    let done = false;
    const wait = whenVisible().then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await wait;
    expect(done).toBe(true);
  });
});
