import {
  MAX_QUERY_LENGTH,
  approvalBody,
  fallbackGoogleLabel,
  isVideoUrl,
  readCreativeReview,
} from "./creative-review";

const q = (query: string) => new URLSearchParams(query);
const IMG = "https://cdn.example.com/a.png";
const IMG2 = "https://cdn.example.com/b.jpg";
const VID = "https://cdn.example.com/c.mp4";

describe("readCreativeReview — Meta", () => {
  it("splits one mixed list into images and videos", () => {
    const review = readCreativeReview(q(`platform=meta_ads&urls=${IMG},${VID},${IMG2}&location_key=London`));
    expect(review?.images.map((a) => a.url)).toEqual([IMG, IMG2]);
    expect(review?.videos.map((a) => a.url)).toEqual([VID]);
    expect(review?.locationKey).toBe("London");
  });

  it("reads a single url, and treats a missing platform as Meta", () => {
    const review = readCreativeReview(q(`url=${IMG}`));
    expect(review?.platform).toBe("meta_ads");
    expect(review?.images).toEqual([{ url: IMG, label: "" }]);
  });

  it("drops anything that is not https", () => {
    const review = readCreativeReview(q(`urls=javascript:alert(1),http://x.com/a.png,${IMG}`));
    expect(review?.images.map((a) => a.url)).toEqual([IMG]);
  });
});

describe("readCreativeReview — Google", () => {
  it("uses the label the email sends", () => {
    const review = readCreativeReview(
      q(`platform=google_ads&images=${encodeURIComponent(`${IMG},Square|${IMG2},Landscape`)}&videos=${encodeURIComponent(`${VID},Vertical`)}`),
    );
    expect(review?.images).toEqual([
      { url: IMG, label: "Square" },
      { url: IMG2, label: "Landscape" },
    ]);
    expect(review?.videos).toEqual([{ url: VID, label: "Vertical" }]);
  });

  it("falls back to the position when no label is sent", () => {
    const urls = Array.from({ length: 9 }, (_, i) => `https://cdn.example.com/${i}.png`).join("|");
    const review = readCreativeReview(q(`platform=google_ads&images=${encodeURIComponent(urls)}`));
    expect(review?.images.map((a) => a.label)).toEqual([
      ...Array(4).fill("Square"),
      ...Array(4).fill("Vertical"),
      "Landscape",
    ]);
    expect(fallbackGoogleLabel(8)).toBe("Landscape");
  });
});

describe("readCreativeReview — refusals", () => {
  it("refuses an unknown platform, an empty link and an oversized one", () => {
    expect(readCreativeReview(q(`platform=tiktok&url=${IMG}`))).toBeNull();
    expect(readCreativeReview(q("platform=meta_ads"))).toBeNull();
    expect(readCreativeReview(q(`url=${IMG}&pad=${"x".repeat(MAX_QUERY_LENGTH)}`))).toBeNull();
  });
});

describe("approvalBody", () => {
  it("forwards every field of the link, minus our own flags, plus action=approved", () => {
    const review = readCreativeReview(q(`platform=Meta_Ads&url=${IMG}&campaign_id=42&error=1`));
    expect(review && approvalBody(review)).toEqual({
      platform: "meta_ads",
      url: IMG,
      campaign_id: "42",
      action: "approved",
    });
  });
});

describe("isVideoUrl", () => {
  it("reads the path's extension and ignores a signed query string", () => {
    expect(isVideoUrl("https://s3.example.com/v.MP4?X-Amz-Signature=abc")).toBe(true);
    expect(isVideoUrl("https://s3.example.com/v.png?name=a.mp4")).toBe(false);
  });
});
