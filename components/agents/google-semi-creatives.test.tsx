import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoogleSemiCreatives } from "./google-semi-creatives";

/**
 * The uploader is the gate on a Semi launch, so what is tested here is what
 * would cost money if it broke: an off-size or unreadable file must never reach
 * S3, "Proceed" must stay blocked until the required set has landed (and say
 * which ones are missing), the optional slots must not be treated as required,
 * and the video and YouTube link must ride the submit in their own fields.
 *
 * `Image` and `<video>` metadata are stubbed because jsdom decodes neither — the
 * component reads `naturalWidth`/`videoWidth` to check the size.
 */

const UPLOAD_URL = "https://s3.example.com/signed-put";
const FILE_URL = "https://s3.example.com/google-ads/asset.png";

/** The next dimensions `new Image()` will report; null makes it fail to decode. */
let nextDimensions: { w: number; h: number } | null = { w: 1200, h: 628 };
/** The next dimensions a `<video>` will report. */
let nextVideo = { w: 1920, h: 1080 };

class StubImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  set src(_value: string) {
    const dim = nextDimensions;
    if (!dim) {
      setTimeout(() => this.onerror?.(), 0);
      return;
    }
    this.naturalWidth = dim.w;
    this.naturalHeight = dim.h;
    setTimeout(() => this.onload?.(), 0);
  }
}

function pngNamed(name: string): File {
  return new File(["bytes"], name, { type: "image/png" });
}

const realCreateElement = document.createElement.bind(document);

beforeEach(() => {
  nextDimensions = { w: 1200, h: 628 };
  nextVideo = { w: 1920, h: 1080 };
  vi.stubGlobal("Image", StubImage as unknown as typeof Image);
  // Only the two statics: replacing `URL` itself would break `new URL()`,
  // which the YouTube check relies on.
  URL.createObjectURL = () => "blob:stub";
  URL.revokeObjectURL = () => {};
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    const el = realCreateElement(tag);
    if (tag === "video") {
      const v = { w: nextVideo.w, h: nextVideo.h };
      Object.defineProperty(el, "videoWidth", { get: () => v.w });
      Object.defineProperty(el, "videoHeight", { get: () => v.h });
      Object.defineProperty(el, "src", {
        set: () => setTimeout(() => (el as HTMLVideoElement).onloadedmetadata?.(new Event("loadedmetadata")), 0),
      });
    }
    return el;
  }) as typeof document.createElement);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/ads-media/upload-url")) {
        return new Response(JSON.stringify({ uploadUrl: UPLOAD_URL, fileUrl: FILE_URL }), {
          status: 200,
        });
      }
      // The PUT to S3.
      return new Response(null, { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function hidden(container: HTMLElement, name: string): string {
  return (container.querySelector(`input[name="${name}"]`) as HTMLInputElement).value;
}

describe("GoogleSemiCreatives", () => {
  it("offers every slot Performance Max composes from, each marked required or optional", () => {
    render(<GoogleSemiCreatives />);
    expect(screen.getByText("Google Display image assets")).toBeInTheDocument();
    for (const label of ["Landscape image", "Square image", "Portrait image", "Logo square", "Logo landscape"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText("Required")).toHaveLength(3);
    // Portrait, logo landscape and the video.
    expect(screen.getAllByText("Optional")).toHaveLength(3);
    expect(screen.getByText("Video is optional and is mainly used for Performance Max campaigns.")).toBeInTheDocument();
  });

  it("is invalid until every required slot has landed, and names what is missing", async () => {
    const onValidityChange = vi.fn();
    const { container } = render(<GoogleSemiCreatives onValidityChange={onValidityChange} />);
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Please upload the required Semi Automation assets before proceeding: Landscape image (1200 x 628px), Square image (1200 x 1200px), Logo square (1200 x 1200px)",
    );

    await userEvent.upload(screen.getByLabelText("Landscape image"), pngNamed("landscape.png"));
    await waitFor(() => expect(screen.getByText(/Uploaded — landscape\.png/)).toBeInTheDocument());
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("status")).not.toHaveTextContent("Landscape image");

    nextDimensions = { w: 1200, h: 1200 };
    await userEvent.upload(screen.getByLabelText("Square image"), pngNamed("square.png"));
    await waitFor(() => expect(screen.getByText(/Uploaded — square\.png/)).toBeInTheDocument());
    expect(onValidityChange).toHaveBeenLastCalledWith(false);

    await userEvent.upload(screen.getByLabelText("Logo square"), pngNamed("logo.png"));
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    expect(JSON.parse(hidden(container, "creativeUrls"))).toEqual({
      landscapeImage: FILE_URL,
      squareImage: FILE_URL,
      logoSquare: FILE_URL,
    });
  });

  it("refuses an off-size image without uploading it", async () => {
    const { container } = render(<GoogleSemiCreatives />);
    const input = screen.getByLabelText("Landscape image") as HTMLInputElement;

    // The right shape, the wrong size.
    nextDimensions = { w: 2400, h: 1256 };
    await userEvent.upload(input, pngNamed("wrong.png"));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Image must be exactly 1200x628px. Your image is 2400x1256px.",
      ),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(hidden(container, "creativeUrls")).toBe("");
    // Cleared, so re-picking the same file fires a change event.
    expect(input.value).toBe("");
  });

  it("refuses an image whose size cannot be read", async () => {
    render(<GoogleSemiCreatives />);
    nextDimensions = null;
    await userEvent.upload(screen.getByLabelText("Landscape image"), pngNamed("broken.png"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Could not read image dimensions."),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uploads a 16:9 video into its own hidden field, and refuses a vertical one", async () => {
    const { container } = render(<GoogleSemiCreatives />);
    const input = screen.getByLabelText("Performance Max video");

    nextVideo = { w: 1080, h: 1920 };
    await userEvent.upload(input, new File(["v"], "tall.mp4", { type: "video/mp4" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Video must be 16:9. Your video is 1080x1920px."),
    );
    expect(fetch).not.toHaveBeenCalled();

    nextVideo = { w: 1920, h: 1080 };
    await userEvent.upload(input, new File(["v"], "wide.mp4", { type: "video/mp4" }));
    await waitFor(() => expect(screen.getByText(/Uploaded — wide\.mp4/)).toBeInTheDocument());
    expect(hidden(container, "googleVideoUrl")).toBe(FILE_URL);
    // The video is not an image slot, so it stays out of the slot map.
    expect(hidden(container, "creativeUrls")).toBe("");
    const signBody = JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]!.body));
    expect(signBody).toMatchObject({ platform: "google", slot: "performanceMaxVideo", contentType: "video/mp4" });
  });

  it("checks the YouTube link as it is typed and posts it trimmed", async () => {
    const { container } = render(<GoogleSemiCreatives />);
    const field = screen.getByLabelText("YouTube link");

    await userEvent.type(field, "https://vimeo.com/1");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a YouTube link (youtube.com or youtu.be).");

    await userEvent.clear(field);
    await userEvent.type(field, "https://youtu.be/abc ");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(hidden(container, "googleYoutubeUrl")).toBe("https://youtu.be/abc");
  });

  it("says when the sign-in has expired, and links to sign in again", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "Your sign-in has expired, so the file couldn't be uploaded. Sign in again, then add it.", signIn: "/login?stale=1" }), { status: 401 }),
      ),
    );
    render(<GoogleSemiCreatives />);
    await userEvent.upload(screen.getByLabelText("Landscape image"), pngNamed("landscape.png"));
    expect(await screen.findByText(/Your sign-in has expired/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/login?stale=1");
  });
});
