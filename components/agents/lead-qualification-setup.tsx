import { CheckedFileInput } from "@/components/ui/checked-file-input";
import { LaunchButton, ProblemList, Section, TextAreaField } from "@/components/agents/setup-fields";
import { LeadSourcePicker } from "@/components/agents/lead-source-picker";

/**
 * The Lead Qualification agent's setup form.
 *
 * The simplest of the four and the only one that uploads: a leads file, an
 * optional document, and the outreach template. Everything else the agent needs
 * — company name, website, business type — rides along from the business
 * details already on file rather than being asked for a second time.
 *
 * The file inputs post straight to a Server Action, which signs a URL and PUTs
 * the bytes server-side. The presigned URL is minted with the customer's JWT,
 * so it never reaches the browser.
 */
export function LeadQualificationSetup({
  action,
  emailTemplate,
  problems,
  adsSummary,
}: {
  action: (formData: FormData) => Promise<void>;
  /** Whatever was saved last time, so a re-run does not retype it. */
  emailTemplate: string;
  problems: string[];
  /** How many ad-captured leads exist and how many are currently selected —
      see `lib/data/lead-selection.ts`. */
  adsSummary: { total: number; selected: number };
}) {
  return (
    <form action={action} className="max-w-2xl">
      <ProblemList problems={problems} />

      <Section title="Your leads">
        <div className="mb-3">
          <LeadSourcePicker adsSummary={adsSummary} />
        </div>

        <label className="block">
          <span className="mb-1 block text-sm text-ink">
            Product or service document{" "}
            <span className="text-ink-soft">(optional, .pdf — helps it qualify accurately)</span>
          </span>
          <CheckedFileInput name="companyDoc" kind="pdf-document" className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-surface-raised file:px-3 file:py-1 file:text-sm file:text-ink" />
        </label>
      </Section>

      <Section title="What it should send">
        {/* Optional: the agent writes its own when this is empty, which is the
            common case on a first run. */}
        <TextAreaField
          name="emailTemplate"
          label="Outreach email template"
          placeholder="Leave blank and the agent writes one. Use {{name}} and {{company}} for the lead's details."
        />
        {emailTemplate !== "" && (
          <p className="text-xs text-ink-soft">
            You have a template saved — leave this blank to keep using it.
          </p>
        )}
      </Section>

      <LaunchButton label="Qualify these leads" />
    </form>
  );
}
