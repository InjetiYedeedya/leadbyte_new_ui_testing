import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MetaSemiMedia } from "./meta-semi-media";

/** jsdom does not decode images; report a square so the 1:1 check passes. */
class StubImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  set src(_value: string) {
    this.naturalWidth = 1080;
    this.naturalHeight = 1080;
    setTimeout(() => this.onload?.(), 0);
  }
}

function signReply(body: unknown, status: number) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

beforeEach(() => {
  vi.stubGlobal("Image", StubImage as unknown as typeof Image);
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:stub", revokeObjectURL: () => {} });
});
afterEach(() => vi.unstubAllGlobals());

async function pick(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, new File(["bytes"], "square.png", { type: "image/png" }));
}

describe("MetaSemiMedia upload errors", () => {
  it("says a failure once, on the file's own row (2026-10-01)", async () => {
    signReply({ error: "We couldn't prepare that upload. Please try again." }, 502);
    const { container } = render(<MetaSemiMedia />);
    await pick(container);
    expect(await screen.findAllByText("We couldn't prepare that upload. Please try again.")).toHaveLength(1);
  });

  it("asks for a fresh sign-in when that is the fix, with a link", async () => {
    signReply(
      { error: "Your sign-in has expired, so the file couldn't be uploaded. Sign in again, then add it.", signIn: "/login?stale=1" },
      401,
    );
    const { container } = render(<MetaSemiMedia />);
    await pick(container);
    expect(await screen.findByText("Not uploaded")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/login?stale=1");
    expect(screen.getAllByText(/Your sign-in has expired/)).toHaveLength(1);
  });
});

describe("MetaSemiMedia video", () => {
  /** jsdom never loads a video; report these dimensions on the next tick. */
  function stubVideo(w: number, h: number) {
    const restore = [
      Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src"),
      Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, "videoWidth"),
      Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, "videoHeight"),
    ] as const;
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => w });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => h });
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      configurable: true,
      set(this: HTMLVideoElement) {
        setTimeout(() => this.onloadedmetadata?.(new Event("loadedmetadata")), 0);
      },
    });
    return () => {
      if (restore[0]) Object.defineProperty(HTMLMediaElement.prototype, "src", restore[0]);
      if (restore[1]) Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", restore[1]);
      if (restore[2]) Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", restore[2]);
    };
  }

  async function pickVideo(container: HTMLElement, type = "video/mp4") {
    await userEvent.click(screen.getByRole("button", { name: "Video" }));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe("video/mp4,video/quicktime,video/webm");
    await userEvent.upload(input, new File(["bytes"], "clip.mp4", { type }), { applyAccept: false });
  }

  it("refuses a video that is not 9:16, before uploading anything", async () => {
    const restore = stubVideo(1920, 1080);
    try {
      signReply({ uploadUrl: "https://s3.example/put", fileUrl: "https://cdn.example/v.mp4" }, 200);
      const { container } = render(<MetaSemiMedia />);
      await pickVideo(container);
      expect(await screen.findByText("Must be 9:16 — this is 1920×1080.")).toBeInTheDocument();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("uploads a 9:16 video", async () => {
    const restore = stubVideo(1080, 1920);
    try {
      signReply({ uploadUrl: "https://s3.example/put", fileUrl: "https://cdn.example/v.mp4" }, 200);
      const { container } = render(<MetaSemiMedia />);
      await pickVideo(container);
      expect(await screen.findByText("Uploaded")).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it("refuses a video type Meta does not take", async () => {
    signReply({}, 200);
    const { container } = render(<MetaSemiMedia />);
    await pickVideo(container, "video/x-msvideo");
    expect(await screen.findByText("Use an MP4, MOV or WebM video.")).toBeInTheDocument();
  });
});
