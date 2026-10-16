/**
 * Writing the Lead Qualification outreach email for the customer.
 *
 * ## The contract (FRONTEND_BACKEND_API_CALLS.md §4)
 *
 *   POST /api/email-template/generate   { mode, email, ...context }  -> { template, source }
 *   POST /api/email-template/to-html    { user_id, template }        -> { html_template }
 *
 * ## Why the modes matter beyond this file
 *
 * `business | instructions | document` is the SAME enumeration
 * `emailTemplateMode` on the run payload is drawn from — it records how the
 * template was written. Treating it as a free-text field is what put an
 * invented `"custom"` on every run. `TEMPLATE_MODES` is the one declaration of
 * that set; add a mode here or nowhere.
 *
 * ## Why an empty template is null, not ""
 *
 * The generator answers into a box the customer may already have typed in. An
 * empty string would silently wipe their draft, so a reply we cannot read
 * leaves the box alone and says so.
 *
 * Pure: the transport is in `email-template-api.ts`, so the popup can import
 * the modes without pulling the server client into the browser bundle.
 */

import { absoluteUrl } from "@/lib/data/profile-display";

/**
 * The three modes that GENERATE a template.
 *
 * The endpoint recognises a fourth, `custom`, which returns the customer's own
 * typed template cleaned up rather than writing a new one (confirmed from the
 * Lambda source, 2026-09-07). It is deliberately not offered here: this list
 * drives a "write it for me" control, and "write it for me" is not what
 * `custom` does. It is the value the RUN payload's `emailTemplateMode` carries
 * when the customer wrote their own — see `lead-qualification.ts`.
 *
 * An unrecognised mode is a `400 "Unknown template mode"`, not a silent
 * fallback, which is why the Server Action validates against this list before
 * calling.
 */
export const TEMPLATE_MODES = ["business", "instructions", "document"] as const;

export type TemplateMode = (typeof TEMPLATE_MODES)[number];

export interface TemplateContext {
  email: string;
  websiteUrl: string;
  companyName: string;
  businessType: string;
  specialization: string;
}

export const MODE_LABELS: Record<TemplateMode, string> = {
  business: "From my business details",
  instructions: "From instructions I write",
  document: "From a document I upload",
};

export const MODE_HINTS: Record<TemplateMode, string> = {
  business: "Uses your company name, what you do and who you serve.",
  instructions: "Describe the email you want and the agent writes it.",
  document: "We read your brief or product sheet and write from that.",
};

/**
 * The request body for one mode.
 *
 * Only the fields that mode uses are added: `instructions` on a business-mode
 * request is a key the backend has no branch for, and sending it blank invites
 * it to write from nothing.
 */
export function templateRequest(
  mode: TemplateMode,
  context: TemplateContext,
  extra: { instructions?: string; sourceUrl?: string },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    mode,
    email: context.email,
    // With its scheme — a bare host from Stage 01 is not a URL to anyone else.
    websiteUrl: absoluteUrl(context.websiteUrl),
    companyName: context.companyName,
    businessType: context.businessType,
    specialization: context.specialization,
  };

  if (mode === "instructions" && extra.instructions !== undefined) {
    body.instructions = extra.instructions;
  }
  if (mode === "document" && extra.sourceUrl !== undefined) {
    body.emailTemplateSourceUrl = extra.sourceUrl;
  }
  return body;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** The generated template, or null when the backend sent nothing usable. */
export function readGeneratedTemplate(payload: unknown): string | null {
  const body = record(payload);
  if (body?.success === false) return null;
  return nonEmpty(body?.template);
}

/** The HTML version, or null. */
export function readHtmlTemplate(payload: unknown): string | null {
  const body = record(payload);
  if (body?.success === false) return null;
  return nonEmpty(body?.html_template ?? body?.htmlTemplate);
}
