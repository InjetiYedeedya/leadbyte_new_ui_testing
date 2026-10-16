import type { SourceOutcome } from "@/lib/api/read-cascade";
import { buildSocialPerformance, mapPlatform, mediaTypeLabel, SOCIAL_PLATFORMS } from "./social-performance";

const ok = (rows: Record<string, unknown>[]): SourceOutcome => ({ ok: true, error: null, rows });
const spec = (id: string) => SOCIAL_PLATFORMS.find((p) => p.id === id)!;

describe("social performance", () => {
  it("reads Instagram under either spelling", () => {
    const ig = mapPlatform(
      spec("instagram"),
      ok([
        { PostLink: "https://instagram.com/p/a", Like_count: "10", Comment_count: 2, share_count: 1, Reach: 100, Media_type: "IMAGE" },
        { post_link: "https://instagram.com/p/b", likes_count: 5, comments_count: "1", reach_count: 50 },
      ]),
    );
    expect(ig.audienceLabel).toBe("Reach");
    expect(ig.posts.map((p) => [p.likes, p.comments, p.shares, p.audience])).toEqual([
      [10, 2, 1, 100],
      [5, 1, null, 50],
    ]);
    expect(ig.posts[0]!.mediaType).toBe("IMAGE");
  });

  it("reads X retweets as shares and views as audience", () => {
    const x = mapPlatform(
      spec("x"),
      ok([{ post_link: "https://x.com/s/1", likes_count: 4, comment_count: 1, retweet_count: 5, views_count: 200 }]),
    );
    expect(x.sharesLabel).toBe("Retweets");
    expect(x.audienceLabel).toBe("Views");
    expect(x.posts[0]!.engagement).toBe(10);
    expect(x.rate).toBeCloseTo(0.05);
  });

  it("reads YouTube new subs and has no shares", () => {
    const yt = mapPlatform(
      spec("youtube"),
      ok([{ permalink: "https://youtube.com/watch?v=1", like_count: 3, comment_count: 1, share_count: 9, view_count: 40, subscriber_count: 2 }]),
    );
    expect(yt.sharesLabel).toBeNull();
    expect(yt.posts[0]!.shares).toBeNull();
    expect(yt.posts[0]!.newSubs).toBe(2);
    expect(yt.rate).toBeCloseTo(0.1);
  });

  it("keeps a platform on one audience measure, preferring reach", () => {
    const fb = mapPlatform(
      spec("facebook"),
      ok([
        { Postlink: "fb.com/1", Like_count: 1, Reach: 10 },
        { Postlink: "fb.com/2", Like_count: 1, views_count: 999 },
      ]),
    );
    expect(fb.audienceLabel).toBe("Reach");
    // The views-only post is not folded into a reach figure.
    expect(fb.posts.find((p) => p.link === "fb.com/2")!.audience).toBeNull();
    expect(fb.ratedPosts).toBe(1);
  });

  it("falls back to views for Facebook rows written that way", () => {
    const fb = mapPlatform(spec("facebook"), ok([{ post_link: "fb.com/1", likes_count: 2, views_count: 20 }]));
    expect(fb.audienceLabel).toBe("Views");
    expect(fb.rate).toBeCloseTo(0.1);
  });

  it("has no rate when the audience is missing or zero", () => {
    expect(mapPlatform(spec("instagram"), ok([{ post_link: "a", likes_count: 5 }])).rate).toBeNull();
    expect(mapPlatform(spec("instagram"), ok([{ post_link: "a", likes_count: 5, Reach: 0 }])).rate).toBeNull();
  });

  it("rates only over posts carrying both figures", () => {
    const ig = mapPlatform(
      spec("instagram"),
      ok([
        { post_link: "a", likes_count: 10, Reach: 100 },
        { post_link: "b", likes_count: 500 },
      ]),
    );
    expect(ig.rate).toBeCloseTo(0.1);
    expect(ig.ratedPosts).toBe(1);
    expect(ig.engagement).toBe(510);
  });

  it("sorts posts by total engagement", () => {
    const ig = mapPlatform(
      spec("instagram"),
      ok([
        { post_link: "low", likes_count: 1 },
        { post_link: "none" },
        { post_link: "high", likes_count: 9, comments_count: 3 },
      ]),
    );
    expect(ig.posts.map((p) => p.link)).toEqual(["high", "low", "none"]);
  });

  it("de-duplicates a post synced more than once, keeping the biggest figures", () => {
    const ig = mapPlatform(
      spec("instagram"),
      ok([
        { post_link: "https://www.instagram.com/p/a/", likes_count: 5, Reach: 100, Media_type: "VIDEO" },
        { post_link: "https://instagram.com/p/a", likes_count: 8, comments_count: 2 },
        { post_link: "https://instagram.com/p/b", likes_count: 1, Reach: 10 },
      ]),
    );
    expect(ig.posts).toHaveLength(2);
    const a = ig.posts[0]!;
    expect([a.likes, a.comments, a.audience, a.engagement, a.mediaType]).toEqual([8, 2, 100, 10, "VIDEO"]);
  });

  it("does not fold YouTube videos together by their query string", () => {
    const yt = mapPlatform(
      spec("youtube"),
      ok([
        { permalink: "https://youtube.com/watch?v=1", like_count: 1 },
        { permalink: "https://youtube.com/watch?v=2", like_count: 1 },
      ]),
    );
    expect(yt.posts).toHaveLength(2);
  });

  it("picks the best platform by rate, not by volume", () => {
    const perf = buildSocialPerformance({
      Instagram_analytics: ok([{ post_link: "a", likes_count: 1000, Reach: 100000 }]),
      social_media_twitter: ok([{ post_link: "b", likes_count: 10, views_count: 100 }]),
      Facebook_Analytics: ok([]),
      Youtube_analytics: ok([]),
    });
    expect(perf.best?.id).toBe("x");
    expect(perf.ranked.map((p) => p.id)).toEqual(["x", "instagram"]);
    expect(perf.tracked).toBe(2);
    expect(perf.totalEngagement).toBe(1010);
  });

  it("never adds reach to views", () => {
    const perf = buildSocialPerformance({
      Instagram_analytics: ok([{ post_link: "a", Reach: 100 }]),
      Facebook_Analytics: ok([{ post_link: "b", Reach: 50 }]),
      social_media_twitter: ok([{ post_link: "c", views_count: 7 }]),
    });
    expect(perf.audienceByMeasure).toEqual([
      { label: "Reach", total: 150 },
      { label: "Views", total: 7 },
    ]);
  });

  it("reports a failed table as failed, not as empty", () => {
    const perf = buildSocialPerformance({
      Instagram_analytics: { ok: false, error: "500", rows: [] },
      Facebook_Analytics: ok([{ post_link: "b", likes_count: 1 }]),
    });
    expect(perf.failed.map((p) => p.name)).toEqual(["Instagram"]);
    expect(perf.tracked).toBe(1);
    expect(perf.totalEngagement).toBe(1);
  });

  it("builds Instagram's content mix", () => {
    const ig = mapPlatform(
      spec("instagram"),
      ok([
        { post_link: "a", Media_type: "IMAGE" },
        { post_link: "b", Media_type: "image" },
        { post_link: "c", Media_type: "CAROUSEL_ALBUM" },
        { post_link: "d" },
      ]),
    );
    expect(ig.mediaMix).toEqual([
      { label: "Image", count: 2, share: 0.5 },
      { label: "Carousel album", count: 1, share: 0.25 },
      { label: "Type not reported", count: 1, share: 0.25 },
    ]);
    expect(mediaTypeLabel("REELS")).toBe("Reels");
  });

  it("leaves the mix out when no type was reported", () => {
    expect(mapPlatform(spec("instagram"), ok([{ post_link: "a" }])).mediaMix).toEqual([]);
  });
});
