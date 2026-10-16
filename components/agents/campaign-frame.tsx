import { FlashNotice } from "@/components/ui/flash-notice";
import { BACK_BUTTON_CLASSES } from "@/components/ui/back-button-classes";
import Link from "@/components/ui/app-link";
import { CampaignSteps, type CampaignStep, type CampaignStepId } from "@/components/agents/campaign-steps";
import { PageContainer } from "@/components/ui/page-container";
import { BlockingErrorCardView } from "@/components/agents/blocking-error-card";
import type { BlockingErrorCard } from "@/lib/data/ads-blocking-error";

/**
 * One frame for every step of a campaign launch.
 *
 * ## Why the four screens needed a shared shell
 *
 * They were built at different times and each invented its own: different
 * heading sizes, different back links, different margins, and all of them a
 * narrow column pinned to the left of a very wide window. Four screens of one
 * flow read as four unrelated pages, which is the opposite of what a sequence
 * ending in a charge should feel like.
 *
 * ## The measure, and why it is not the full width
 *
 * The column is capped and centred. A form is read one field at a time and a
 * 2300px-wide input is harder to fill in, not easier — but a narrow column
 * jammed against the left edge makes the empty two thirds look like a
 * rendering fault. Centred at a comfortable measure is the honest answer to a
 * wide screen for content that genuinely is one column.
 *
 * ## The eyebrow is a link, not a breadcrumb trail
 *
 * One step back is the only useful move here: forward is what the buttons are
 * for, and jumping to an arbitrary earlier step in a flow that has already
 * called a paid agent would need a story about what happens to the plan.
 */
export function CampaignFrame({
  step,
  title,
  intro,
  back,
  problems,
  blocked,
  steps,
  children,
}: {
  step: CampaignStepId;
  /** The strip to draw — `campaignStepsFor(agentId)`. Defaults to the shared four. */
  steps?: readonly CampaignStep[];
  title: string;
  /** One sentence on what this step is for. */
  intro: React.ReactNode;
  back?: { href: string; label: string };
  /** Anything the previous submit rejected, shown before the form. */
  problems?: string[];
  /**
   * A workflow refusal with a fix, shown INSTEAD of the problems list — it
   * is the same failure, said with the steps to repair it.
   */
  blocked?: BlockingErrorCard | null;
  children: React.ReactNode;
}) {
  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-5xl">
        {back && (
          // A real button, not grey text: people missed the way back to the
          // step before (LBS-1147 g), most of all on a phone.
          <Link href={back.href} className={`mb-4 ${BACK_BUTTON_CLASSES}`}>
            <span aria-hidden="true">←</span>
            {back.label}
          </Link>
        )}

        <CampaignSteps current={step} steps={steps} />

        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mb-4 mt-1.5 max-w-prose text-sm leading-6 text-ink-soft">{intro}</p>

        {/* Every problem at once, at the top, before the fields. Reported one
            at a time — or below the form — a long setup becomes a guessing
            game about which answer is being rejected. */}
        {blocked && <BlockingErrorCardView card={blocked} />}
        {!blocked && problems && problems.length > 0 && (
          <FlashNotice
            role="alert"
            clear={["problems", "problem"]}
            className="mb-4 rounded-lg border border-crit/30 bg-crit-soft px-4 py-3"
          >
            <p className="text-sm font-medium text-crit">
              {problems.length === 1 ? "One thing to fix" : `${problems.length} things to fix`}
            </p>
            <ul className="mt-1.5 space-y-1">
              {problems.map((problem) => (
                <li key={problem} className="flex gap-2.5 text-sm leading-6 text-ink">
                  <span
                    aria-hidden="true"
                    className="mt-[0.6875rem] h-1 w-1 shrink-0 rounded-full bg-crit/60"
                  />
                  <span>{problem}</span>
                </li>
              ))}
            </ul>
          </FlashNotice>
        )}

        {children}
      </div>
    </PageContainer>
  );
}
