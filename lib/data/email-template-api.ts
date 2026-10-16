import { apiRequest } from "@/lib/api/client";
import { isRedirectError } from "@/lib/auth/session-expired";
import {
  readGeneratedTemplate,
  readHtmlTemplate,
  templateRequest,
  type TemplateContext,
  type TemplateMode,
} from "@/lib/data/email-template";

/**
 * The transport for the email-template routes. Server-only.
 *
 * Never throws: this is an assistive feature beside a textarea the customer can
 * always fill in themselves, so a failure has to degrade to "write it yourself"
 * rather than break the popup they were halfway through.
 */

export async function generateEmailTemplate(
  mode: TemplateMode,
  context: TemplateContext,
  extra: { instructions?: string; sourceUrl?: string } = {},
): Promise<{ template: string | null; message?: string }> {
  try {
    // 45s, not the 8s page-render default: an LLM writing an email took longer
    // than 8 seconds on the very first live call, and the timeout surfaced as
    // "we couldn't reach the writer" for a service that was working fine.
    const payload = await apiRequest<unknown>("/api/email-template/generate", {
      method: "POST",
      body: templateRequest(mode, context, extra),
      timeoutMs: 45_000,
    });
    const template = readGeneratedTemplate(payload);
    if (template === null) {
      console.warn(`[email-template] ${mode} produced nothing readable:`, payload);
      return {
        template: null,
        message: "We couldn't write a template from that. Try adding more detail.",
      };
    }
    return { template };
  } catch (error) {
    // A dead session leaves as a redirect, not as this call's own
    // failure — see isRedirectError in session-expired.ts.
    if (isRedirectError(error)) throw error;
    console.error(`[email-template] ${mode} generation failed:`, error);
    return {
      template: null,
      message: "We couldn't reach the writer just now. You can type the email yourself.",
    };
  }
}

/** Converts a plain-text template to HTML. Null when it could not be done. */
export async function emailTemplateToHtml(
  userId: string,
  template: string,
): Promise<string | null> {
  try {
    const payload = await apiRequest<unknown>("/api/email-template/to-html", {
      method: "POST",
      body: { user_id: userId, template },
      // Same reasoning as the generator: it is an LLM call, not a lookup.
      timeoutMs: 45_000,
    });
    return readHtmlTemplate(payload);
  } catch (error) {
    // A dead session leaves as a redirect, not as this call's own
    // failure — see isRedirectError in session-expired.ts.
    if (isRedirectError(error)) throw error;
    console.error("[email-template] html conversion failed:", error);
    return null;
  }
}
