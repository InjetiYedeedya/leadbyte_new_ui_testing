import type { Metadata } from "next";
import { CheckCircle, ShieldCheck, XCircle } from "@phosphor-icons/react/ssr";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/ui/page-container";
import { SubmitButton } from "@/components/ui/submit-button";
import { getSession } from "@/lib/auth/session";
import { logout } from "@/app/logout/actions";
import { claimAdminInvite } from "./actions";

export const metadata: Metadata = { title: "Claim admin access · LeadByte" };

/**
 * `/admin/claim?token=…` — the link in an admin invite email. The URL is the
 * one the legacy app emailed, so invites already sent keep working.
 *
 * Signed-in only (the `(app)` layout sees to that), but not admin-gated:
 * nobody claiming an invite is an admin yet.
 */

const RESULTS: Record<string, { title: string; body: string }> = {
  "no-invite": {
    title: "No invite for this account",
    body: "We couldn't find an admin invite for the address you're signed in with.",
  },
  "bad-token": {
    title: "This link isn't valid",
    body: "The link doesn't match your invite. It may have been replaced by a newer one — use the most recent email, or ask for a new invite.",
  },
  failed: {
    title: "We couldn't finish that",
    body: "Something went wrong on our side while claiming the invite. Try again in a moment.",
  },
};

export default async function ClaimAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; result?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { token = "", result } = await searchParams;
  const problem = result ? RESULTS[result] : token === "" ? {
    title: "This link is missing its token",
    body: "Open the exact link from your invite email.",
  } : undefined;

  const button =
    "rounded-md px-4 py-2 text-sm font-medium transition active:scale-[0.98] motion-reduce:transform-none";

  return (
    <PageContainer width="reading">
      <div className="mx-auto mt-16 flex w-full max-w-md flex-col items-center gap-3 rounded-lg border border-border bg-surface p-8 text-center">
        <span
          aria-hidden="true"
          className={`flex size-12 items-center justify-center rounded-full ${
            problem ? "bg-crit-soft text-crit" : "bg-accent-soft text-accent-ink"
          }`}
        >
          {problem ? <XCircle className="size-6" /> : <ShieldCheck className="size-6" />}
        </span>

        <h1 className="text-2xl font-bold tracking-tight text-ink">
          {problem ? problem.title : "Claim admin access"}
        </h1>

        {problem ? (
          <p className="text-sm text-ink-soft">{problem.body}</p>
        ) : (
          <p className="text-sm text-ink-soft">You&apos;ve been invited to be a LeadByte admin. Claim it for:</p>
        )}

        <p className="font-medium text-ink [overflow-wrap:anywhere]">{session.businessId}</p>

        {problem ? (
          <p className="text-xs text-ink-soft">
            If the invite went to a different address, sign in with that account and open the link
            again.
          </p>
        ) : (
          <form action={claimAdminInvite} className="mt-1">
            <input type="hidden" name="token" value={token} />
            <SubmitButton pendingLabel="Claiming…" className={`${button} bg-accent text-surface hover:bg-accent-ink`}>
              <CheckCircle aria-hidden="true" className="size-4" />
              Claim admin access
            </SubmitButton>
          </form>
        )}

        <form action={logout}>
          <SubmitButton pendingLabel="Signing out…" className="text-xs text-accent-ink underline underline-offset-2">
            Not you? Sign in with a different account
          </SubmitButton>
        </form>
      </div>
    </PageContainer>
  );
}
