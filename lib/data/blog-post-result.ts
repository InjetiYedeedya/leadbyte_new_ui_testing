/**
 * What a blog-posting run came back with, in the shape the screen shows.
 *
 * The contract is the backend's handoff (README for `POST /api/blog-posting`,
 * 2026-09-28): the browser sends only `website_url`; the backend takes the
 * account from the login token and runs the blog pipeline, which writes a
 * post and publishes it (a GitHub push or WordPress). One call, 1 to 4
 * minutes. Pure, so every outcome is tested.
 */

export interface BlogPublish {
  /** Where the post went, e.g. "github_push" or "wordpress". */
  method: string;
  url: string | null;
  /** Set when it was opened as a pull request for someone to review. */
  prUrl: string | null;
  message: string;
}

export type BlogOutcome =
  | {
      kind: "done";
      /**
       * False when the post was written but could not be published; null when
       * the job reported done without saying either way.
       */
      published: boolean | null;
      title: string;
      metaDescription: string;
      topic: string;
      /** The AI-written body. Rendered ONLY in a sandboxed frame, never as HTML in the page. */
      contentHtml: string;
      /** A `data:image/...` URL, or null. Nothing else is accepted as an image source. */
      image: string | null;
      imageAlt: string;
      publish: BlogPublish | null;
      warnings: string[];
    }
  | {
      /**
       * The backend took the run as a background job (since 2026-10-12 it
       * answers `{ job_id, status, reused, website_url }` at once) and is
       * writing and publishing now; `GET /api/blog-posting/status/{job_id}`
       * reports it.
       */
      kind: "started";
      jobId: string;
    }
  | {
      kind: "failed";
      message: string;
      /** The reply's layout (field names only), shown small for support. */
      details?: string;
      /** We stopped waiting; the post may still be written and published. */
      timedOut?: boolean;
    };

type Raw = Record<string, unknown>;
const record = (value: unknown): Raw => (value && typeof value === "object" ? (value as Raw) : {});
const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** What each refusal means for the customer, per the handoff's table. */
const STATUS_MESSAGES: Record<number, string> = {
  400: "Enter a valid public website address, starting with https://.",
  401: "Your session expired. Please sign in again.",
  404: "We couldn't find this website on your account. Run the website analysis first.",
  502: "The blog service had a problem. Please try again in a few minutes.",
  504: "Writing the post is taking longer than expected. Check your site in a few minutes before trying again.",
};

export const NOT_SWITCHED_ON = "Blog posting isn't switched on yet. It will work here as soon as it is.";

/** A safe image source: an inline image, and nothing that could run or track. */
function inlineImage(value: unknown): string | null {
  const text = str(value);
  return /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(text) ? text : null;
}

function webLink(value: unknown): string | null {
  const text = str(value).trim();
  return /^https:\/\//i.test(text) ? text : null;
}

/** A sentence, whether the field holds one or an object carrying one. */
function sentence(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const node = record(value);
  return str(node.message).trim() || str(node.error).trim() || str(node.detail).trim();
}

/**
 * Why a run stopped, wherever the reply put it. The pipeline is a Python
 * service behind the Lambda, so besides the handoff's `data.error` the reason
 * can arrive as `detail` (a string, FastAPI's habit) or as an error OBJECT.
 * `message` is read only on an explicit `success: false` — on any other reply
 * it is as likely to say "Blog generated" as anything else.
 */
function failureReason(body: Raw, data: Raw): string {
  const refused = body.success === false || data.success === false;
  const candidates = [data.error, data.detail, body.error, body.detail, ...(refused ? [data.message, body.message] : [])];
  for (const candidate of candidates) {
    const text = sentence(candidate);
    if (text) return text;
  }
  return "";
}

/**
 * The reply's layout — field names and flags, never values — for the log when
 * a 2xx carries no post. The body holds the whole article and an inline image,
 * so it is never logged itself.
 */
export function describeBlogReply(payload: unknown): string {
  const top = unwrap(payload);
  if (top === null || top === undefined) return "empty reply";
  if (typeof top === "string") return `text reply, ${top.length} characters`;
  const body = record(top);
  const data = runOf(body);
  const keys = (node: Raw) => Object.keys(node).sort().join(",") || "none";
  return (
    `${Array.isArray(payload) ? "list of " + payload.length + ", first " : ""}top-level [${keys(body)}], data [${keys(data)}], ` +
    `blog [${keys(record(data.blog))}], success ${String(body.success)}/${String(data.success)}, ` +
    `stage ${str(data.stage) || "none"}`
  );
}

/**
 * A job's status word, read the way `toJobState` in `analysis-job.ts` reads
 * the website analysis's. Copied rather than imported: that module reaches
 * cookies and the API client, and this one is also loaded in the browser.
 */
function toJobState(raw: unknown): "queued" | "running" | "done" | "failed" | "unknown" {
  const value = String(raw ?? "").toLowerCase().trim();
  if (["done", "complete", "completed", "succeeded", "success", "finished", "published"].includes(value)) return "done";
  if (["failed", "error", "failure"].includes(value)) return "failed";
  if (["running", "in_progress", "in-progress", "processing", "started"].includes(value)) return "running";
  if (["queued", "pending", "waiting", "accepted"].includes(value)) return "queued";
  return "unknown";
}

/** n8n answers as a one-element list; the Lambda forwards it verbatim. */
const unwrap = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);

/** The part of the reply that holds the run: `data`, n8n's `output` / `result`, or the reply itself. */
function runOf(body: Raw): Raw {
  return record(unwrap(body.data ?? body.output ?? body.result ?? body));
}

/** A 2xx answer: `{ success, data: { success, stage, error, blog, publish_result } }`. */
export function readBlogSuccess(payload: unknown, options: { acceptJob?: boolean } = { acceptJob: true }): BlogOutcome {
  const top = unwrap(payload);

  // Replies that are not an object at all. Each says something different, so
  // each gets its own sentence — one generic line hid which one it was.
  if (top === null || top === undefined || (typeof top === "string" && top.trim() === "")) {
    return { kind: "failed", message: "The blog service sent back an empty reply. Please try again." };
  }
  if (typeof top === "string") {
    const text = top.trim();
    return {
      kind: "failed",
      message: text.startsWith("<")
        ? "The blog service sent back an error page instead of a post. Please try again."
        : `The post couldn't be finished: ${text.slice(0, 200)}`,
    };
  }

  const body = record(top);
  const data = runOf(body);
  const blog = record(unwrap(data.blog ?? data.post ?? data.article ?? body.blog));
  const title = (str(blog.title) || str(data.title)).trim();

  const rawPublishValue = unwrap(data.publish_result ?? data.publish ?? body.publish_result);
  const rawPublish = rawPublishValue === null || rawPublishValue === undefined ? null : record(rawPublishValue);
  const publish: BlogPublish | null = rawPublish
    ? {
        method: str(rawPublish.method),
        url: webLink(rawPublish.url),
        prUrl: webLink(rawPublish.pr_url),
        message: str(rawPublish.message),
      }
    : null;
  // Proof the post reached the site. It outranks every other flag: the run
  // pushed to GitHub while this screen said "couldn't be finished"
  // (2026-10-12), because an overall `success` or a missing title read as
  // failure. A post that is live is never reported as a failure.
  const published = rawPublish?.success === true || publish?.url != null || publish?.prUrl != null;

  // A job, not a post: the run continues in the background. Checked after
  // the post itself, so a reply carrying both is read as the post.
  const jobId = str(body.job_id) || str(data.job_id) || str(body.jobId) || str(data.jobId);
  const state = toJobState(data.status ?? body.status);
  if (!published && title === "" && jobId !== "" && state !== "failed" && state !== "done" && options.acceptJob) {
    return { kind: "started", jobId };
  }

  if (!published && (body.success === false || data.success === false || title === "")) {
    const reason = failureReason(body, data);
    const stage = str(data.stage);
    const where = stage ? ` (stopped while ${stage.replace(/_/g, " ")})` : "";
    return {
      kind: "failed",
      message: reason
        ? `The post couldn't be finished${where}: ${reason}`
        : body.success === false || data.success === false
          ? `The post couldn't be finished${where}. Please try again.`
          : "The blog service answered without a post or a reason. Please try again.",
      // Field names only, never values: what came back, so the next report
      // says which shape it was instead of another round of guessing.
      details: describeBlogReply(payload),
    };
  }

  return {
    kind: "done",
    published,
    title: title || "Your new post",
    metaDescription: str(blog.meta_description),
    topic: str(data.topic),
    contentHtml: str(blog.content_html),
    image: inlineImage(blog.image_base64),
    imageAlt: str(blog.image_alt) || title || "Cover image",
    publish,
    warnings: Array.isArray(data.warnings) ? data.warnings.filter((w): w is string => typeof w === "string") : [],
  };
}

/**
 * One check of a blog job: `GET /api/blog-posting/status/{job_id}`. The
 * finished run sits under `result` (or `data`, or the reply itself) in the
 * same shape the run used to return whole; anything not finished reads as
 * still running. Status words come from the same reader as the website
 * analysis job, so a synonym cannot poll forever.
 */
export function readBlogStatus(payload: unknown): BlogOutcome | { kind: "running" } {
  const body = record(unwrap(payload));
  const data = record(unwrap(body.data ?? body));
  const state = toJobState(data.status ?? body.status ?? data.state ?? body.state);

  if (state === "failed") {
    const reason = failureReason(body, data) || sentence(data.result) || sentence(body.result);
    const stage = str(data.stage);
    return {
      kind: "failed",
      message: `The post couldn't be finished${stage ? ` (stopped while ${stage.replace(/_/g, " ")})` : ""}${reason ? `: ${reason}` : ". Please try again."}`,
      details: describeBlogReply(payload),
    };
  }
  if (state !== "done") return { kind: "running" };

  const finished = data.result ?? body.result ?? data.output ?? data;
  const outcome = readBlogSuccess(finished, { acceptJob: false });
  if (outcome.kind !== "failed" || /without a post or a reason/.test(outcome.message) === false) return outcome;
  // Done, but nothing in the reply says what was written: the job finished,
  // so the honest line is "finished — look at your site", not a failure.
  return {
    kind: "done",
    published: null,
    title: "Your new post",
    metaDescription: "",
    topic: "",
    contentHtml: "",
    image: null,
    imageAlt: "Cover image",
    publish: null,
    warnings: [],
  };
}

/**
 * A refusal. A 404 is two different things: the route not existing yet
 * (the backend answers "Route not found: …") and the website not being on
 * this account. Only the second is the customer's to fix.
 */
export function readBlogFailure(status: number, message: string): BlogOutcome {
  if (status === 404 && /^route not found/i.test(message.trim())) return { kind: "failed", message: NOT_SWITCHED_ON };
  return { kind: "failed", message: STATUS_MESSAGES[status] ?? (message.trim() || "Blog posting failed. Please try again.") };
}

/** Which of the pipeline's steps to show, from how long it has been running. An estimate: the backend reports no progress. */
export const BLOG_STEPS = [
  "Reading your website",
  "Picking a topic and keywords",
  "Writing the post",
  "Creating the cover image",
  "Publishing",
] as const;

/** Paced over roughly two and a half minutes, holding the last step until the run returns. */
export function blogStepAt(elapsedMs: number): number {
  return Math.min(BLOG_STEPS.length - 1, Math.floor(Math.max(0, elapsedMs) / 30_000));
}
