import { NOT_SWITCHED_ON, blogStepAt, describeBlogReply, readBlogStatus, readBlogFailure, readBlogSuccess } from "@/lib/data/blog-post-result";

const PUBLISHED = {
  success: true,
  data: {
    success: true,
    stage: "published",
    topic: "10 ways to grow",
    warnings: ["Keyword density low"],
    blog: {
      title: "10 ways to grow",
      meta_description: "How to grow.",
      slug: "grow",
      content_html: "<h2>One</h2>",
      image_base64: "data:image/webp;base64,AAAA",
      image_alt: "Cover",
    },
    publish_result: { success: true, method: "github_push", url: "https://github.com/acme/site/blob/main/blog/grow.md", pr_url: null },
  },
};

describe("readBlogSuccess", () => {
  it("reads a published post", () => {
    const outcome = readBlogSuccess(PUBLISHED);
    expect(outcome).toMatchObject({
      kind: "done",
      published: true,
      title: "10 ways to grow",
      contentHtml: "<h2>One</h2>",
      image: "data:image/webp;base64,AAAA",
      imageAlt: "Cover",
      warnings: ["Keyword density low"],
      publish: { method: "github_push", url: "https://github.com/acme/site/blob/main/blog/grow.md", prUrl: null },
    });
  });

  it("reads a post that was written but not published", () => {
    const outcome = readBlogSuccess({ ...PUBLISHED, data: { ...PUBLISHED.data, publish_result: { success: false, message: "No GitHub repo connected" } } });
    expect(outcome).toMatchObject({ kind: "done", published: false, publish: { message: "No GitHub repo connected" } });
  });

  it("says where the pipeline stopped when it failed", () => {
    expect(readBlogSuccess({ success: false, data: { success: false, stage: "image_generation", error: "quota exceeded", blog: null } })).toMatchObject({
      kind: "failed",
      message: "The post couldn't be finished (stopped while image generation): quota exceeded",
    });
  });

  it("finds the reason in a FastAPI detail string or an error object", () => {
    expect(readBlogSuccess({ detail: "GitHub token expired" })).toMatchObject({
      message: "The post couldn't be finished: GitHub token expired",
    });
    expect(readBlogSuccess({ success: false, data: { success: false, stage: "publish", error: { message: "repo not found" } } })).toMatchObject({
      message: "The post couldn't be finished (stopped while publish): repo not found",
    });
  });

  it("reads message only on an explicit refusal", () => {
    expect(readBlogSuccess({ success: false, message: "website not analysed" })).toMatchObject({
      message: "The post couldn't be finished: website not analysed",
    });
    expect(readBlogSuccess({ success: true, message: "Blog generated" })).toMatchObject({
      message: "The blog service answered without a post or a reason. Please try again.",
    });
  });

  it("reads a post wrapped in n8n's one-element list, or under output", () => {
    expect(readBlogSuccess([PUBLISHED])).toMatchObject({ kind: "done", title: "10 ways to grow" });
    expect(readBlogSuccess({ output: PUBLISHED.data })).toMatchObject({ kind: "done", title: "10 ways to grow" });
  });

  it("names an empty, text or HTML reply for what it is", () => {
    expect(readBlogSuccess(null)).toMatchObject({ message: "The blog service sent back an empty reply. Please try again." });
    expect(readBlogSuccess("Workflow was started")).toMatchObject({ message: "The post couldn't be finished: Workflow was started" });
    expect(readBlogSuccess("<html>502</html>")).toMatchObject({
      message: "The blog service sent back an error page instead of a post. Please try again.",
    });
    expect(describeBlogReply("abc")).toBe("text reply, 3 characters");
  });

  it("reports a post that reached GitHub as published, whatever the other flags say", () => {
    const pushed = { success: true, method: "github_push", url: "https://github.com/acme/site/blob/main/blog/x.md" };
    expect(readBlogSuccess({ success: false, data: { success: false, publish_result: pushed } })).toMatchObject({
      kind: "done",
      published: true,
      title: "Your new post",
      publish: { url: pushed.url },
    });
    expect(readBlogSuccess({ data: { blog: null, publish_result: { success: true } } })).toMatchObject({ kind: "done", published: true });
  });

  it("shows the reply's field names with a failure, never its values", () => {
    const outcome = readBlogSuccess({ success: false, data: { success: false, secret_value: "do-not-show" } });
    expect(outcome).toMatchObject({ kind: "failed" });
    expect(outcome.kind === "failed" && outcome.details).toContain("secret_value");
    expect(outcome.kind === "failed" && outcome.details).not.toContain("do-not-show");
  });

  it("describes a reply by its field names, never its contents", () => {
    const text = describeBlogReply(PUBLISHED);
    expect(text).toContain("blog [content_html,image_alt,image_base64,meta_description,slug,title]");
    expect(text).not.toContain("10 ways");
  });

  it("accepts only an inline image and only https links", () => {
    const outcome = readBlogSuccess({
      ...PUBLISHED,
      data: {
        ...PUBLISHED.data,
        blog: { ...PUBLISHED.data.blog, image_base64: "javascript:alert(1)" },
        publish_result: { success: true, url: "javascript:alert(1)", pr_url: "http://insecure.test" },
      },
    });
    expect(outcome.kind === "done" && outcome.image).toBeNull();
    expect(outcome.kind === "done" && outcome.publish).toMatchObject({ url: null, prUrl: null });
  });
});

describe("readBlogFailure", () => {
  it("tells a route that is not deployed apart from a website not on the account", () => {
    expect(readBlogFailure(404, "Route not found: POST /api/blog-posting")).toEqual({ kind: "failed", message: NOT_SWITCHED_ON });
    expect(readBlogFailure(404, "Website not found")).toEqual({
      kind: "failed",
      message: "We couldn't find this website on your account. Run the website analysis first.",
    });
  });

  it("maps the handoff's statuses to plain sentences", () => {
    expect(readBlogFailure(400, "bad")).toMatchObject({ message: "Enter a valid public website address, starting with https://." });
    expect(readBlogFailure(502, "")).toMatchObject({ message: "The blog service had a problem. Please try again in a few minutes." });
    expect(readBlogFailure(418, "I'm a teapot")).toMatchObject({ message: "I'm a teapot" });
  });
});

describe("blogStepAt", () => {
  it("moves a step every 30 seconds and holds the last one", () => {
    expect(blogStepAt(0)).toBe(0);
    expect(blogStepAt(31_000)).toBe(1);
    expect(blogStepAt(10 * 60_000)).toBe(4);
  });
});

describe("background jobs", () => {
  const STARTED = { job_id: "job-1", reused: false, status: "queued", website_url: "https://leadbyte.ai" };

  it("reads the immediate job answer as started, not failed (seen live 2026-10-12)", () => {
    expect(readBlogSuccess(STARTED)).toEqual({ kind: "started", jobId: "job-1" });
    expect(readBlogSuccess({ ...STARTED, reused: true, status: "running" })).toEqual({ kind: "started", jobId: "job-1" });
  });

  it("keeps checking while the job runs", () => {
    expect(readBlogStatus({ job_id: "job-1", status: "running" })).toEqual({ kind: "running" });
    expect(readBlogStatus({ job_id: "job-1", status: "queued" })).toEqual({ kind: "running" });
  });

  it("reads the finished post from result", () => {
    expect(readBlogStatus({ job_id: "job-1", status: "done", result: PUBLISHED.data })).toMatchObject({
      kind: "done",
      published: true,
      title: "10 ways to grow",
    });
    expect(readBlogStatus({ data: { status: "completed", result: PUBLISHED } })).toMatchObject({ kind: "done", published: true });
  });

  it("says finished, not failed, when the job is done but sends no post", () => {
    expect(readBlogStatus({ job_id: "job-1", status: "done" })).toMatchObject({ kind: "done", published: null });
  });

  it("gives the job's own reason when it fails", () => {
    expect(readBlogStatus({ job_id: "job-1", status: "failed", stage: "publish", error: "repo not found" })).toMatchObject({
      kind: "failed",
      message: "The post couldn't be finished (stopped while publish): repo not found",
    });
  });
});
