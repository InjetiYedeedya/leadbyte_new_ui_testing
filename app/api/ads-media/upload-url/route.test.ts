import { POST } from "./route";

const presignUpload = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ businessId: "a@b.com" }) }));
vi.mock("@/lib/data/uploads", () => ({
  presignUpload: (...args: unknown[]) => presignUpload(...args),
  SIGN_IN_AGAIN: "Your sign-in has expired.",
  UploadError: class UploadError extends Error {
    signInAgain = false;
  },
}));

function post(body: unknown) {
  return POST(new Request("http://x/api/ads-media/upload-url", { method: "POST", body: JSON.stringify(body) }) as never);
}

afterEach(() => presignUpload.mockReset());

describe("upload-url, social posts (2026-10-01)", () => {
  it("signs an image or a video into the social posts folder", async () => {
    presignUpload.mockResolvedValue({ uploadUrl: "https://s3/put", fileUrl: "https://s3/f", key: "k" });
    expect((await post({ platform: "social", fileName: "a.png", contentType: "image/png" })).status).toBe(200);
    expect((await post({ platform: "social", fileName: "v.mov", contentType: "video/quicktime" })).status).toBe(200);
    expect(presignUpload).toHaveBeenCalledWith(expect.objectContaining({ folder: "social-media/media", email: "a@b.com" }));
  });

  it("refuses any other file class", async () => {
    const response = await post({ platform: "social", fileName: "x.pdf", contentType: "application/pdf" });
    expect(response.status).toBe(400);
    expect(presignUpload).not.toHaveBeenCalled();
  });
});

describe("upload-url, LinkedIn semi creative (2026-10-08)", () => {
  it("signs images and video into their own LinkedIn folders", async () => {
    presignUpload.mockResolvedValue({ uploadUrl: "https://s3/put", fileUrl: "https://s3/f", key: "k" });
    expect((await post({ platform: "linkedin", fileName: "a.jpg", contentType: "image/jpeg" })).status).toBe(200);
    expect(presignUpload).toHaveBeenLastCalledWith(expect.objectContaining({ folder: "linkedin-ads/semi-images" }));
    expect((await post({ platform: "linkedin", fileName: "v.mp4", contentType: "video/mp4" })).status).toBe(200);
    expect(presignUpload).toHaveBeenLastCalledWith(expect.objectContaining({ folder: "linkedin-ads/semi-videos" }));
  });

  it("refuses WebP and anything that is not an image or a video", async () => {
    expect((await post({ platform: "linkedin", fileName: "a.webp", contentType: "image/webp" })).status).toBe(400);
    expect((await post({ platform: "linkedin", fileName: "x.pdf", contentType: "application/pdf" })).status).toBe(400);
    expect(presignUpload).not.toHaveBeenCalled();
  });
});
