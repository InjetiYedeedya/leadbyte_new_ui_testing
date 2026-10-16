/**
 * Meta Engagement campaigns promote a post that is ALREADY published, so the
 * customer gives that post and nothing else creative (LBS-1253).
 *
 * An Engagement campaign used to go through the same Full/Semi choice and the
 * creative steps as every other goal, writing prompts for an ad that would
 * never be used — the point is likes, comments and shares on a post people
 * can already see. So the setup form asks for the post, the plan and the
 * details follow as before, and the campaign launches straight after the
 * details form.
 *
 * Pure, so it is tested.
 *
 * **Unconfirmed with the n8n owner:** which key the Meta workflow reads the
 * post from. It goes out under `existingPostId`, `post_id` and, when the
 * customer gave the `pageId_postId` form Meta itself uses for promoting a
 * post, `object_story_id`; a link goes out as `postUrl` too.
 */

const POST_HOSTS = /(^|\.)(facebook\.com|fb\.com|fb\.watch|instagram\.com)$/i;

/** The post as given — an id, `pageId_postId`, or a post link — or "" when it is none of those. */
export function readPostReference(raw: FormDataEntryValue | null): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (/^\d{5,}(_\d{5,})?$/.test(text)) return text;
  try {
    const url = new URL(text);
    if ((url.protocol === "https:" || url.protocol === "http:") && POST_HOSTS.test(url.hostname) && url.pathname.length > 1) {
      return url.toString();
    }
  } catch {
    // Not a link either.
  }
  return "";
}

/** The launch body's keys for the post (see the note above). */
export function postLaunchExtras(post: string): Record<string, string> {
  if (post === "") return {};
  const isLink = /^https?:/i.test(post);
  return {
    existingPostId: post,
    post_id: post,
    ...(isLink ? { postUrl: post } : {}),
    ...(/^\d+_\d+$/.test(post) ? { object_story_id: post } : {}),
  };
}

/** The post this campaign promotes, from the stored suggestion's extras, or "". */
export function existingPostOf(extras: Record<string, unknown> | undefined): string {
  const value = extras?.existingPostId;
  return typeof value === "string" ? value : "";
}
