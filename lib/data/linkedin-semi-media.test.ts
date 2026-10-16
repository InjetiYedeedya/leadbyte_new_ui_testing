import {
  LINKEDIN_MAX_IMAGES,
  linkedInFileProblem,
  linkedInMediaAssets,
  linkedInMediaKind,
  linkedInMixProblem,
  parseLinkedInSemiMedia,
  validateLinkedInSemiMedia,
} from "./linkedin-semi-media";

const MB = 1024 * 1024;
const img = (i: number) => `https://bucket.s3.amazonaws.com/linkedin-ads/semi-images/${i}.png`;

describe("LinkedIn semi media (2026-10-08, spec §7)", () => {
  it("takes JPG/PNG images and MP4/MOV video, nothing else", () => {
    expect(linkedInMediaKind("image/png")).toBe("image");
    expect(linkedInMediaKind("image/jpeg")).toBe("image");
    expect(linkedInMediaKind("video/quicktime")).toBe("video");
    expect(linkedInMediaKind("image/webp")).toBeNull();
    expect(linkedInMediaKind("application/pdf")).toBeNull();
  });

  it("holds images to 5 MB and video to 100 MB", () => {
    expect(linkedInFileProblem({ name: "a.png", type: "image/png", size: 5 * MB })).toBeNull();
    expect(linkedInFileProblem({ name: "a.png", type: "image/png", size: 5 * MB + 1 })).toMatch(/5 MB/);
    expect(linkedInFileProblem({ name: "v.mp4", type: "video/mp4", size: 100 * MB + 1 })).toMatch(/100 MB/);
    expect(linkedInFileProblem({ name: "a.webp", type: "image/webp", size: 1 })).toMatch(/isn't supported/);
  });

  it("allows up to 10 images or one video, never both", () => {
    expect(linkedInMixProblem([], ["image", "image"])).toBeNull();
    expect(linkedInMixProblem(["image"], ["video"])).toMatch(/already added images/);
    expect(linkedInMixProblem([], ["video", "video"])).toMatch(/only 1 video/);
    expect(linkedInMixProblem(Array(9).fill("image"), ["image", "image"])).toMatch(/up to 10 images/);
  });

  it("allows no creative at all — uploads are optional", () => {
    const none = parseLinkedInSemiMedia(undefined);
    expect(none).toEqual({ images: [], video: null });
    expect(validateLinkedInSemiMedia(none)).toBeNull();
  });

  it("keeps only https URLs from the post, and refuses a forged mix or too many", () => {
    const media = parseLinkedInSemiMedia(JSON.stringify({ images: [img(1), "javascript:alert(1)", 7], video: null }));
    expect(media.images).toEqual([img(1)]);
    expect(validateLinkedInSemiMedia({ images: [img(1)], video: img(2) })).toMatch(/not both/);
    const eleven = Array.from({ length: LINKEDIN_MAX_IMAGES + 1 }, (_, i) => img(i));
    expect(validateLinkedInSemiMedia({ images: eleven, video: null })).toMatch(/up to 10/);
  });

  it("launches images as `images` and a video as `videoUrl`", () => {
    expect(linkedInMediaAssets({ images: [img(1), img(2)], video: null })).toEqual({ images: [img(1), img(2)] });
    expect(linkedInMediaAssets({ images: [], video: img(9) })).toEqual({ images: [], videoUrl: img(9) });
  });
});
