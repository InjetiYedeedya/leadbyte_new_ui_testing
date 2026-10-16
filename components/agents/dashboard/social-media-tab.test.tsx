import { render, screen } from "@testing-library/react";
import type { SourceOutcome } from "@/lib/api/read-cascade";
import { buildSocialPerformance } from "@/lib/data/dashboard/social-performance";
import { dashboardTabFor } from "@/lib/data/dashboard/tabs";
import { SocialMediaView } from "./social-media-tab";

const ok = (rows: Record<string, unknown>[]): SourceOutcome => ({ ok: true, error: null, rows });
const tab = dashboardTabFor("social-media")!;

describe("SocialMediaView", () => {
  it("shows the empty state when no platform has posts", () => {
    render(<SocialMediaView tab={tab} performance={buildSocialPerformance({})} />);
    expect(screen.getByText("No social posts tracked yet")).toBeTruthy();
    expect(screen.queryByText("Platforms tracked")).toBeNull();
  });

  it("summarises, ranks by rate, and names a failed platform", () => {
    const performance = buildSocialPerformance({
      Instagram_analytics: ok([{ post_link: "a", likes_count: 10, Reach: 1000, Media_type: "IMAGE" }]),
      social_media_twitter: ok([{ post_link: "b", likes_count: 5, views_count: 50 }]),
      Youtube_analytics: { ok: false, error: "500", rows: [] },
    });
    render(<SocialMediaView tab={tab} performance={performance} />);
    expect(screen.getByText("2 / 4")).toBeTruthy();
    expect(screen.getByText("1,000 reach · 50 views")).toBeTruthy();
    expect(screen.getByText("15")).toBeTruthy();
    expect(screen.getByText("10% engagement rate, based on 1 post")).toBeTruthy();
    expect(screen.getByText("Platform performance")).toBeTruthy();
    expect(screen.getAllByRole("alert")[0]!.textContent).toContain("Couldn't load YouTube posts");
    expect(screen.getByText("Content mix")).toBeTruthy();
  });

  it("hides the platform comparison with only one platform", () => {
    const performance = buildSocialPerformance({
      Instagram_analytics: ok([{ post_link: "a", likes_count: 10, Reach: 1000 }]),
    });
    render(<SocialMediaView tab={tab} performance={performance} />);
    expect(screen.queryByText("Platform performance")).toBeNull();
    expect(screen.queryByText("Content mix")).toBeNull();
  });
});
