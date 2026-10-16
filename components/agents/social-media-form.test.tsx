import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SocialModeFields } from "./social-mode-fields";
import { SocialSchedule, dayAfterToday } from "./social-schedule";
import { SocialMediaUploader, mixProblem } from "./social-media-uploader";

function inForm(node: React.ReactNode) {
  const { container } = render(<form>{node}</form>);
  return container.querySelector("form")!;
}

describe("SocialModeFields", () => {
  it("shows only the chosen mode's questions, so the other's never post", () => {
    const form = inForm(
      <SocialModeFields
        defaultMode="full"
        full={<input name="mediaType" defaultValue="video" aria-label="full field" />}
        semi={<input name="socialMedia" defaultValue="[]" aria-label="semi field" />}
      />,
    );
    expect(screen.getByLabelText("full field")).toBeInTheDocument();
    expect(screen.queryByLabelText("semi field")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Semi automation/ }));
    expect(screen.queryByLabelText("full field")).toBeNull();
    expect(new FormData(form).get("mode")).toBe("semi");
    expect(new FormData(form).get("mediaType")).toBeNull();
  });
});

describe("SocialSchedule", () => {
  it("starts on every day and posts the choice", () => {
    const form = inForm(<SocialSchedule defaultSchedule={{ kind: "everyday" }} />);
    expect(new FormData(form).get("scheduleKind")).toBe("everyday");
    expect(screen.queryByLabelText("Add a date")).toBeNull();
  });

  it("adds dates from tomorrow on, once each, and removes them", () => {
    const form = inForm(<SocialSchedule defaultSchedule={{ kind: "dates", dates: [] }} />);
    const box = screen.getByLabelText("Add a date") as HTMLInputElement;
    const tomorrow = dayAfterToday();
    expect(box.min).toBe(tomorrow);

    fireEvent.change(box, { target: { value: tomorrow } });
    fireEvent.click(screen.getByRole("button", { name: "Add date" }));
    fireEvent.change(box, { target: { value: tomorrow } });
    fireEvent.click(screen.getByRole("button", { name: "Add date" }));
    expect(new FormData(form).getAll("postDates")).toEqual([tomorrow]);

    fireEvent.click(screen.getByRole("button", { name: /^Remove / }));
    expect(new FormData(form).getAll("postDates")).toEqual([]);
  });

  it("will not add a past date", () => {
    inForm(<SocialSchedule defaultSchedule={{ kind: "dates", dates: [] }} />);
    fireEvent.change(screen.getByLabelText("Add a date"), { target: { value: "2000-01-01" } });
    expect(screen.getByRole("button", { name: "Add date" })).toBeDisabled();
  });

  it("works out tomorrow across a month end", () => {
    expect(dayAfterToday(new Date(2026, 8, 30))).toBe("2026-10-01");
  });
});

describe("mixProblem", () => {
  it("allows up to ten images or one video, never both", () => {
    expect(mixProblem([], ["image", "image"])).toBeNull();
    expect(mixProblem([], ["video"])).toBeNull();
    expect(mixProblem([], ["image", "video"])).toBe("Upload images or a video — not both in the same post.");
    expect(mixProblem(["image"], ["video"])).toBe("You already added images. Remove them to upload a video instead.");
    expect(mixProblem(["video"], ["image"])).toBe("You already added a video. Remove it to upload images instead.");
    expect(mixProblem(["video"], ["video"])).toBe("You can upload only 1 video.");
    expect(mixProblem(Array(8).fill("image"), ["image", "image", "image"])).toBe(
      "You can upload up to 10 images. You can add 2 more.",
    );
  });
});

describe("SocialMediaUploader", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/api/ads-media/upload-url")) {
          const { fileName } = JSON.parse(String(init?.body)) as { fileName: string };
          return new Response(
            JSON.stringify({ uploadUrl: "https://s3.example/put", fileUrl: `https://s3.example/social-media/media/${fileName}` }),
            { status: 200 },
          );
        }
        return new Response(null, { status: 200 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const png = (name: string) => new File(["x"], name, { type: "image/png" });

  it("uploads images, says a carousel is coming, and posts only the URLs", async () => {
    const form = inForm(<SocialMediaUploader />);
    expect(form.checkValidity()).toBe(false);
    await userEvent.upload(screen.getByLabelText(/Upload your media/), [png("a.png"), png("b.png")]);
    await waitFor(() => expect(screen.getAllByText("Uploaded")).toHaveLength(2));
    expect(screen.getByText(/2 images selected — these will be published as a carousel post\./)).toBeInTheDocument();
    expect(JSON.parse(String(new FormData(form).get("socialMedia")))).toEqual([
      { url: "https://s3.example/social-media/media/a.png", kind: "image" },
      { url: "https://s3.example/social-media/media/b.png", kind: "image" },
    ]);
    expect(form.checkValidity()).toBe(true);
  });

  it("refuses a video beside images, and an unsupported file, without uploading", async () => {
    inForm(<SocialMediaUploader />);
    const input = screen.getByLabelText(/Upload your media/);
    await userEvent.upload(input, [png("a.png")]);
    await waitFor(() => expect(screen.getByText("Uploaded")).toBeInTheDocument());
    await userEvent.upload(input, [new File(["x"], "clip.mp4", { type: "video/mp4" })]);
    expect(screen.getByRole("alert")).toHaveTextContent("You already added images. Remove them to upload a video instead.");
    await userEvent.upload(input, [new File(["x"], "clip.avi", { type: "video/x-msvideo" })], { applyAccept: false });
    expect(screen.getByRole("alert")).toHaveTextContent("clip.avi isn't supported.");
  });

  it("removes an uploaded file", async () => {
    const form = inForm(<SocialMediaUploader />);
    await userEvent.upload(screen.getByLabelText(/Upload your media/), [png("a.png")]);
    await waitFor(() => expect(screen.getByText("Uploaded")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Remove a.png" }));
    expect(JSON.parse(String(new FormData(form).get("socialMedia")))).toEqual([]);
  });
});
