import {
  GOOGLE_VIDEO_FIELD,
  GOOGLE_VIDEO_URL_FIELD,
  GOOGLE_YOUTUBE_URL_FIELD,
  creativesFor,
  googleMissingMessage,
  googleSemiAutomationMedia,
  googleUploadField,
  imageSizeProblem,
  isYoutubeUrl,
  missingCreativeUrls,
  parseCreativeUrls,
  readGoogleSemiMedia,
  serialiseCreativeUrls,
  videoRatioMatches,
} from "@/lib/data/ads-creatives";

const LANDSCAPE = "https://s3.example.com/google-ads-creatives/landscape.png";
const SQUARE = "https://s3.example.com/google-ads-creatives/square.png";
const LOGO = "https://s3.example.com/google-ads-creatives/logo.png";
const PORTRAIT = "https://s3.example.com/google-ads-creatives/portrait.png";

/** The three Google slots that a semi launch cannot go without. */
const COMPLETE = {
  landscapeImage: LANDSCAPE,
  squareImage: SQUARE,
  logoSquare: LOGO,
};

describe("parseCreativeUrls", () => {
  it("round-trips the slots the uploader filled", () => {
    const urls = { ...COMPLETE, portraitImage: PORTRAIT };
    expect(parseCreativeUrls("google-ads", serialiseCreativeUrls(urls))).toEqual(urls);
  });

  it("is empty for anything unreadable, rather than throwing", () => {
    // A forged or truncated hidden field must read as "nothing uploaded", which
    // `missingCreativeUrls` then reports honestly. Throwing here would 500 the
    // approve action instead of asking for the files again.
    expect(parseCreativeUrls("google-ads", "{ not json")).toEqual({});
    expect(parseCreativeUrls("google-ads", "")).toEqual({});
    expect(parseCreativeUrls("google-ads", null)).toEqual({});
    expect(parseCreativeUrls("google-ads", "[]")).toEqual({});
    expect(parseCreativeUrls("google-ads", '"a string"')).toEqual({});
  });

  it("keeps only slots the platform declares", () => {
    // The map is spread into the launch body top-level, so an unknown key would
    // arrive at the executor as a field nobody defined.
    const parsed = parseCreativeUrls(
      "google-ads",
      JSON.stringify({ ...COMPLETE, sneakyField: "https://elsewhere.example.com/x.png" }),
    );
    expect(parsed).toEqual(COMPLETE);
  });

  it("drops values that are not usable URLs", () => {
    const parsed = parseCreativeUrls(
      "google-ads",
      JSON.stringify({ ...COMPLETE, portraitImage: "  ", logoLandscape: 42 }),
    );
    expect(parsed).toEqual(COMPLETE);
  });
});

describe("missingCreativeUrls", () => {
  it("passes a complete required set", () => {
    expect(missingCreativeUrls("google-ads", COMPLETE)).toEqual([]);
  });

  it("does not ask for the optional slots", () => {
    // Portrait and landscape logo are optional in `SEMI_CREATIVES`; requiring
    // them here would block a launch the platform accepts.
    const optional = creativesFor("google-ads").filter((f) => !f.required);
    expect(optional.map((f) => f.name)).toEqual(["portraitImage", "logoLandscape"]);
    expect(missingCreativeUrls("google-ads", COMPLETE)).toEqual([]);
  });

  it("names the required slots that are absent, by label", () => {
    expect(missingCreativeUrls("google-ads", { landscapeImage: LANDSCAPE })).toEqual([
      "Square image",
      "Logo square",
    ]);
  });

  it("treats an empty map as everything missing", () => {
    expect(missingCreativeUrls("google-ads", {})).toEqual([
      "Landscape image",
      "Square image",
      "Logo square",
    ]);
  });

  it("asks for nothing from a platform with no creative slots", () => {
    expect(missingCreativeUrls("on-page-seo", {})).toEqual([]);
  });
});

describe("SEMI_CREATIVES ratios", () => {
  it("gives every Google slot a ratio to check against", () => {
    // The uploader blocks on these, so a slot with no ratio would silently
    // accept anything.
    for (const field of creativesFor("google-ads")) {
      expect(field.ratio).not.toBeNull();
    }
  });
});

describe("the Google Display spec", () => {
  it("keeps the slot names and sets each slot's exact size, ceiling and folder", () => {
    // The names are the posted `creativeUrls` keys, so they must not move.
    expect(
      creativesFor("google-ads").map((f) => ({
        name: f.name,
        label: f.label,
        required: f.required,
        size: f.size,
        mb: f.maxBytes / (1024 * 1024),
        folder: f.folder,
      })),
    ).toEqual([
      { name: "landscapeImage", label: "Landscape image", required: true, size: { width: 1200, height: 628 }, mb: 10, folder: "google-ads/display-assets/landscape" },
      { name: "squareImage", label: "Square image", required: true, size: { width: 1200, height: 1200 }, mb: 10, folder: "google-ads/display-assets/square" },
      { name: "portraitImage", label: "Portrait image", required: false, size: { width: 960, height: 1200 }, mb: 10, folder: "google-ads/display-assets/portrait" },
      { name: "logoSquare", label: "Logo square", required: true, size: { width: 1200, height: 1200 }, mb: 5, folder: "google-ads/display-assets/logo-square" },
      { name: "logoLandscape", label: "Logo landscape", required: false, size: { width: 1200, height: 300 }, mb: 5, folder: "google-ads/display-assets/logo-landscape" },
    ]);
    expect(GOOGLE_VIDEO_FIELD.folder).toBe("google-ads/display-assets/video");
    expect(GOOGLE_VIDEO_FIELD.maxBytes).toBe(1024 * 1024 * 1024);
  });

  it("knows which slots a presign request may name", () => {
    expect(googleUploadField("landscapeImage")).toEqual({
      name: "landscapeImage",
      folder: "google-ads/display-assets/landscape",
      kind: "image",
    });
    expect(googleUploadField("performanceMaxVideo")?.kind).toBe("video");
    expect(googleUploadField("semiMediaFile")).toBeNull();
  });
});

describe("imageSizeProblem", () => {
  const landscape = creativesFor("google-ads")[0]!;

  it("passes only the exact size", () => {
    expect(imageSizeProblem(landscape, { w: 1200, h: 628 })).toBeNull();
    // 1.91:1 but not the size Google asks for.
    expect(imageSizeProblem(landscape, { w: 2400, h: 1256 })).toBe(
      "Image must be exactly 1200x628px. Your image is 2400x1256px.",
    );
  });

  it("refuses an image whose size could not be read", () => {
    expect(imageSizeProblem(landscape, null)).toBe("Could not read image dimensions.");
  });
});

describe("videoRatioMatches", () => {
  it("accepts 16:9 within 0.01 and nothing wider", () => {
    expect(videoRatioMatches({ w: 1920, h: 1080 })).toBe(true);
    expect(videoRatioMatches({ w: 1280, h: 722 })).toBe(true); // 1.7729
    expect(videoRatioMatches({ w: 1080, h: 1920 })).toBe(false);
    expect(videoRatioMatches({ w: 1440, h: 1080 })).toBe(false);
  });
});

describe("isYoutubeUrl", () => {
  it("accepts https links on YouTube's own hosts", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=abc",
      "https://youtube.com/watch?v=abc",
      "https://m.youtube.com/watch?v=abc",
      "https://youtu.be/abc",
    ]) {
      expect(isYoutubeUrl(url)).toBe(true);
    }
  });

  it("refuses everything else", () => {
    for (const url of [
      "http://www.youtube.com/watch?v=abc",
      "https://youtube.com.evil.example/watch",
      "https://vimeo.com/1",
      "youtube.com/watch?v=abc",
      "",
    ]) {
      expect(isYoutubeUrl(url)).toBe(false);
    }
  });
});

describe("googleMissingMessage", () => {
  it("lists every required slot with its size when nothing is uploaded", () => {
    expect(googleMissingMessage({})).toBe(
      "Please upload the required Semi Automation assets before proceeding: Landscape image (1200 x 628px), Square image (1200 x 1200px), Logo square (1200 x 1200px)",
    );
  });

  it("names only the ones still missing, and nothing when complete", () => {
    expect(googleMissingMessage({ landscapeImage: LANDSCAPE, squareImage: SQUARE })).toBe(
      "Please upload the required Semi Automation assets before proceeding: Logo square (1200 x 1200px)",
    );
    expect(googleMissingMessage(COMPLETE)).toBeNull();
  });
});

describe("googleSemiAutomationMedia", () => {
  it("builds the legacy shape, with empty urls for empty slots", () => {
    expect(
      googleSemiAutomationMedia(COMPLETE, { youtubeUrl: "https://youtu.be/abc", uploadedUrl: "" }),
    ).toEqual({
      images: {
        landscape: { label: "Landscape image", required: true, width: 1200, height: 628, url: LANDSCAPE },
        square: { label: "Square image", required: true, width: 1200, height: 1200, url: SQUARE },
        portrait: { label: "Portrait image", required: false, width: 960, height: 1200, url: "" },
        logoSquare: { label: "Logo square", required: true, width: 1200, height: 1200, url: LOGO },
        logoLandscape: { label: "Logo landscape", required: false, width: 1200, height: 300, url: "" },
      },
      video: {
        label: "Performance Max video",
        required: false,
        aspectRatio: "16:9",
        youtubeUrl: "https://youtu.be/abc",
        uploadedUrl: "",
      },
    });
  });
});

describe("readGoogleSemiMedia", () => {
  function form(fields: Record<string, string>): FormData {
    const data = new FormData();
    for (const [k, v] of Object.entries(fields)) data.set(k, v);
    return data;
  }

  const VIDEO = "https://s3.example.com/google-ads/display-assets/video/clip.mp4";

  it("returns the creatives and the media object for a complete set", () => {
    const result = readGoogleSemiMedia(
      form({
        creativeUrls: serialiseCreativeUrls(COMPLETE),
        [GOOGLE_VIDEO_URL_FIELD]: VIDEO,
        [GOOGLE_YOUTUBE_URL_FIELD]: " https://www.youtube.com/watch?v=abc ",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.creatives).toEqual(COMPLETE);
    expect(result.media.video).toMatchObject({
      uploadedUrl: VIDEO,
      youtubeUrl: "https://www.youtube.com/watch?v=abc",
    });
    expect(result.media.images.landscape.url).toBe(LANDSCAPE);
  });

  it("is fine with no video at all", () => {
    const result = readGoogleSemiMedia(form({ creativeUrls: serialiseCreativeUrls(COMPLETE) }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.media.video).toMatchObject({ youtubeUrl: "", uploadedUrl: "" });
  });

  it("reports missing required slots and a bad YouTube link together", () => {
    const result = readGoogleSemiMedia(
      form({
        creativeUrls: serialiseCreativeUrls({ landscapeImage: LANDSCAPE }),
        [GOOGLE_YOUTUBE_URL_FIELD]: "https://vimeo.com/1",
      }),
    );
    expect(result).toEqual({
      ok: false,
      problems: [
        "Please upload the required Semi Automation assets before proceeding: Square image (1200 x 1200px), Logo square (1200 x 1200px)",
        "Enter a YouTube link (youtube.com or youtu.be).",
      ],
    });
  });

  it("refuses a forged video url rather than dropping it", () => {
    const result = readGoogleSemiMedia(
      form({ creativeUrls: serialiseCreativeUrls(COMPLETE), [GOOGLE_VIDEO_URL_FIELD]: "javascript:alert(1)" }),
    );
    expect(result.ok).toBe(false);
  });

  it("treats an unreadable creativeUrls field as nothing uploaded", () => {
    const result = readGoogleSemiMedia(form({ creativeUrls: "{ not json" }));
    expect(result.ok).toBe(false);
  });
});
