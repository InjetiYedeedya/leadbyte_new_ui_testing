import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BlogPostPanel } from "./blog-post-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  // `PendingLink` (the "Add website" button) asks where it is.
  usePathname: () => "/agents/aeo",
}));
import type { BlogOutcome } from "@/lib/data/blog-post-result";

const DONE: BlogOutcome = {
  kind: "done",
  published: true,
  title: "10 ways to grow",
  metaDescription: "How to grow.",
  topic: "",
  contentHtml: "<h2>One</h2><script>alert(1)</script>",
  image: "data:image/webp;base64,AAAA",
  imageAlt: "Cover",
  publish: { method: "github_push", url: "https://github.com/acme/site/blob/main/blog/grow.md", prUrl: null, message: "" },
  warnings: ["Keyword density low"],
};

describe("BlogPostPanel", () => {
  it("shows the account's website without a box to type another one", async () => {
    const write = vi.fn().mockResolvedValue(DONE);
    render(<BlogPostPanel website="acme.com" write={write} />);
    expect(screen.getByText("acme.com")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Write and publish" }));
    await waitFor(() => expect(screen.getByText(/written and published/)).toBeInTheDocument());
    expect(write).toHaveBeenCalledWith();
  });

  it("keeps the button off when the account has no website", () => {
    const write = vi.fn();
    render(<BlogPostPanel website="" write={write} />);
    expect(screen.getByText("No website on your account yet")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Write and publish" });
    expect(button).toBeDisabled();
    fireEvent.submit(button.closest("form")!);
    expect(write).not.toHaveBeenCalled();
  });

  it("disables itself and shows the steps while it runs", async () => {
    let finish: (value: BlogOutcome) => void = () => {};
    const write = vi.fn(() => new Promise<BlogOutcome>((resolve) => (finish = resolve)));
    render(<BlogPostPanel website="acme.com" write={write} />);
    fireEvent.click(screen.getByRole("button", { name: "Write and publish" }));
    expect(screen.getByRole("button", { name: "Writing…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Reading your website");
    fireEvent.click(screen.getByRole("button", { name: "Writing…" }));
    expect(write).toHaveBeenCalledTimes(1);
    await act(async () => finish({ kind: "failed", message: "Blog posting isn't switched on yet." }));
    expect(screen.getByRole("alert")).toHaveTextContent("isn't switched on yet");
  });

  it("shows the post in a sandboxed frame, never in the page", async () => {
    const { container } = render(<BlogPostPanel website="acme.com" write={vi.fn().mockResolvedValue(DONE)} />);
    fireEvent.click(screen.getByRole("button", { name: "Write and publish" }));
    await waitFor(() => expect(screen.getByTitle("Preview of 10 ways to grow")).toBeInTheDocument());
    const frame = screen.getByTitle("Preview of 10 ways to grow");
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).toContain("<h2>One</h2>");
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("link", { name: "View it" })).toHaveAttribute("href", "https://github.com/acme/site/blob/main/blog/grow.md");
    expect(screen.getByAltText("Cover")).toBeInTheDocument();
  });

  it("says plainly when the post was written but not published", async () => {
    const unpublished: BlogOutcome = { ...DONE, published: false, publish: { method: "", url: null, prUrl: null, message: "No GitHub repo connected." } } as BlogOutcome;
    render(<BlogPostPanel website="acme.com" write={vi.fn().mockResolvedValue(unpublished)} />);
    fireEvent.click(screen.getByRole("button", { name: "Write and publish" }));
    await waitFor(() => expect(screen.getByText(/wasn't published: No GitHub repo connected\./)).toBeInTheDocument());
  });

  it("keeps the button off and offers Connect while GitHub is not connected", () => {
    const write = vi.fn();
    render(
      <BlogPostPanel
        website="acme.com"
        write={write}
        github={{ kind: "blocked", title: "Connect GitHub to publish", message: "Connect GitHub for acme.com first.", installUrl: "https://github.com/apps/x/installations/new" }}
        checkGithub={vi.fn()}
      />,
    );
    expect(screen.getByText("Connect GitHub to publish")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Write and publish" });
    expect(button).toBeDisabled();
    fireEvent.submit(button.closest("form")!);
    expect(write).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });

  it("points at adding a website when there is none to connect GitHub for", () => {
    render(
      <BlogPostPanel
        website=""
        write={vi.fn()}
        github={{ kind: "blocked", title: "Add your website to publish", message: "Add your website first.", installUrl: null }}
      />,
    );
    expect(screen.getByRole("link", { name: "Add website" })).toHaveAttribute("href", "/");
  });

  it("names the repository when GitHub is connected", () => {
    render(<BlogPostPanel website="acme.com" write={vi.fn()} github={{ kind: "ready", note: "It goes to acme/site on GitHub." }} />);
    expect(screen.getByText(/It goes to acme\/site on GitHub\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write and publish" })).toBeEnabled();
  });

  it("follows a background job until the post is published", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const write = vi.fn().mockResolvedValue({ kind: "started", jobId: "job-1" });
      const check = vi.fn().mockResolvedValueOnce({ kind: "running" }).mockResolvedValueOnce(DONE);
      render(<BlogPostPanel website="acme.com" write={write} check={check} />);
      fireEvent.click(screen.getByRole("button", { name: "Write and publish" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(11_000);
      });
      await waitFor(() => expect(screen.getByText(/written and published/)).toBeInTheDocument());
      expect(check).toHaveBeenCalledWith("job-1");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
