import {
  SEMI_MEDIA_SPECS,
  acceptsFileType,
  buildSemiAutomationMedia,
  parseSemiAutomationMedia,
  semiRatioMatches,
  validateSemiAutomationMedia,
} from "@/lib/data/meta-semi-media";

const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://cdn.example/${i}.png`);

describe("the video rules (legacy spec, 2026-10-02)", () => {
  const video = SEMI_MEDIA_SPECS.video;

  it("accepts three named video types, not video/*", () => {
    expect(video.accept).toBe("video/mp4,video/quicktime,video/webm");
    expect(acceptsFileType(video, "video/mp4")).toBe(true);
    expect(acceptsFileType(video, "video/quicktime")).toBe(true);
    expect(acceptsFileType(video, "video/x-msvideo")).toBe(false);
    expect(acceptsFileType(SEMI_MEDIA_SPECS.image, "image/webp")).toBe(false);
  });

  it("holds a video to 9:16 within 0.01", () => {
    expect(semiRatioMatches({ w: 1080, h: 1920 }, video)).toBe(true);
    expect(semiRatioMatches({ w: 1090, h: 1920 }, video)).toBe(true);
    expect(semiRatioMatches({ w: 1110, h: 1920 }, video)).toBe(false);
    expect(semiRatioMatches({ w: 1920, h: 1080 }, video)).toBe(false);
    // Images keep the shared 3% rule.
    expect(semiRatioMatches({ w: 1000, h: 1020 }, SEMI_MEDIA_SPECS.image)).toBe(true);
  });

  it("declares 9:16 on the media object", () => {
    expect(buildSemiAutomationMedia("video", ["https://cdn.example/v.mp4"]).videoRequirement).toBe("9:16");
    expect(buildSemiAutomationMedia("image", urls(1)).videoRequirement).toBeNull();
  });
});

describe("validateSemiAutomationMedia", () => {
  it("needs 2 to 10 carousel images", () => {
    expect(validateSemiAutomationMedia(buildSemiAutomationMedia("carousel", urls(1)))).toMatch(/at least 2/);
    expect(validateSemiAutomationMedia(buildSemiAutomationMedia("carousel", urls(2)))).toBeNull();
    expect(validateSemiAutomationMedia(buildSemiAutomationMedia("carousel", urls(10)))).toBeNull();
    expect(validateSemiAutomationMedia(buildSemiAutomationMedia("carousel", urls(11)))).toMatch(/at most 10/);
  });

  it("checks what a hand-posted form sends, not just what the picker allows", () => {
    const posted = parseSemiAutomationMedia(JSON.stringify({ type: "carousel", urls: urls(12) }));
    expect(validateSemiAutomationMedia(posted)).toMatch(/at most 10/);
    expect(validateSemiAutomationMedia(buildSemiAutomationMedia("image", urls(2)))).toMatch(/just one image/);
    expect(validateSemiAutomationMedia(null)).toMatch(/Choose a media type/);
  });
});
