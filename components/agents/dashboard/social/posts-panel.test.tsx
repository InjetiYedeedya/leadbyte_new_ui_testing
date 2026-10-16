import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SourceOutcome } from "@/lib/api/read-cascade";
import { buildSocialPerformance } from "@/lib/data/dashboard/social-performance";
import { SocialPostsPanel } from "./posts-panel";

const ok = (rows: Record<string, unknown>[]): SourceOutcome => ({ ok: true, error: null, rows });

function platforms() {
  return buildSocialPerformance({
    Instagram_analytics: ok([
      { post_link: "instagram.com/p/low", likes_count: 1, Reach: 10, Media_type: "IMAGE" },
      { post_link: "instagram.com/p/high", likes_count: 40, Reach: 100, Media_type: "REELS" },
    ]),
    Facebook_Analytics: { ok: false, error: "500", rows: [] },
    social_media_twitter: ok([{ post_link: "x.com/s/1", likes_count: 2, retweet_count: 3, views_count: 50 }]),
    Youtube_analytics: ok([]),
  }).platforms;
}

describe("SocialPostsPanel", () => {
  it("opens on the first platform with posts, best post first", () => {
    render(<SocialPostsPanel platforms={platforms()} />);
    expect(screen.getByRole("button", { name: "Instagram" }).getAttribute("aria-pressed")).toBe("true");
    const links = within(screen.getByRole("region", { name: "Instagram posts" })).getAllByRole("link");
    expect(links[0]!.getAttribute("href")).toBe("https://instagram.com/p/high");
    expect(links[0]!.getAttribute("target")).toBe("_blank");
    expect(links[0]!.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText("Reels")).toBeTruthy();
  });

  it("switches platform, with that platform's own columns", async () => {
    const user = userEvent.setup();
    render(<SocialPostsPanel platforms={platforms()} />);
    await user.click(screen.getByRole("button", { name: "X" }));
    expect(screen.getByRole("button", { name: "X" }).getAttribute("aria-pressed")).toBe("true");
    const list = screen.getByRole("region", { name: "X posts" });
    expect(within(list).getByText("Retweets")).toBeTruthy();
    expect(within(list).getByText("Views")).toBeTruthy();
    expect(within(list).queryByText("Reach")).toBeNull();
  });

  it("says a platform has no posts yet, and which one failed to load", async () => {
    const user = userEvent.setup();
    render(<SocialPostsPanel platforms={platforms()} />);
    await user.click(screen.getByRole("button", { name: "YouTube" }));
    expect(screen.getByText("No YouTube posts synced yet.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Facebook" }));
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load Facebook posts");
  });

  it("scrolls the list back to the top on a platform switch", async () => {
    const user = userEvent.setup();
    render(<SocialPostsPanel platforms={platforms()} />);
    await user.click(screen.getByRole("button", { name: "X" }));
    const list = screen.getByRole("region", { name: "X posts" });
    list.scrollTop = 200;
    await user.click(screen.getByRole("button", { name: "Instagram" }));
    await user.click(screen.getByRole("button", { name: "X" }));
    expect(screen.getByRole("region", { name: "X posts" }).scrollTop).toBe(0);
  });
});
