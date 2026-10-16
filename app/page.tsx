import { NOT_PUBLIC_WEBSITE } from "@/lib/url-safety";
import { SubmitButton } from "@/components/ui/submit-button";
import { FlashNotice } from "@/components/ui/flash-notice";
import Link from "@/components/ui/app-link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { STALE_SESSION_PATH, isStaleSession } from "@/lib/auth/stale-session";
import { isBackendConfigured } from "@/lib/api/config";
import { getBusinessProfileRepo } from "@/lib/data/business-profile-repo";
import { computeStageInputs } from "@/lib/onboarding/compute-stage-inputs";
import { getStageFlags } from "@/lib/onboarding/stage-flags";
import { firstFilled } from "@/lib/data/profile-display";
import { BrandHeader } from "@/components/brand-header";
import { Caveat } from "next/font/google";
import { WebsiteField } from "@/components/entry/website-field";
import { CornerSparkle, LeftCards, RightCards, WhatHappensNext } from "@/components/entry/entry-visuals";
import { captureWebsiteUrl } from "./actions";
import { readPendingUrl } from "@/lib/data/pending-website";
import { logout } from "./logout/actions";

/** The hand-written aside's face — the same one the Overview hero uses. */
const script = Caveat({ subsets: ["latin"], weight: ["500", "600"], display: "swap" });

/**
 * Stage 01 — the website entry screen.
 *
 * Shown to signed-out visitors (the validated design opens here rather than on
 * a login form, so a visitor states their intent before creating an account)
 * AND to signed-in users who have not given us a website yet.
 *
 * The redirect is decided by DATA, never by whether the user happens to be
 * logged in — the same rule as `getStageFlags()`, which this now asks directly.
 *
 * ## Why a returning user still sees this screen
 *
 * It used to be enough to have a websiteUrl on file: one analysis and `/` sent
 * you to the dashboard forever. But setup is not one step. Somebody with an
 * analysis and no connected accounts is half-configured, and a dashboard is a
 * poor place to discover that — the stage rail was the only thing saying so,
 * in a strip above the content.
 *
 * So `/` keeps landing on setup until every stage is complete, and gets out of
 * the way entirely once they are. The URL comes pre-filled with the site on
 * file, so for a returning user this is a confirmation rather than a question
 * they have already answered — and `Skip to dashboard` is there for anyone who
 * only wanted to look.
 */
export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ save?: string; setup?: string; url?: string }>;
}) {
  const { save, setup, url: urlProblem } = await searchParams;
  const session = await getSession();
  let savedUrl = "";

  /**
   * Before any authenticated read, not after.
   *
   * A session cookie minted in mock mode has no backend token, and once
   * `LEADBYTE_API_URL` is set every read below answers 401 "Authentication
   * required". Each one is caught and mapped to an empty result, so nothing
   * throws — which is worse than throwing: `allComplete` can then never be
   * true, so the redirect to `/overview` never fires and this screen asks a
   * returning customer for a website they gave us months ago, forever.
   *
   * `app/(app)/layout.tsx` has caught this since the backend was wired in.
   * This page is not in that route group, so it never did.
   */
  if (isStaleSession(session, isBackendConfigured())) {
    console.warn(
      `[auth] session for "${session?.businessId}" has no access token but a ` +
        "backend is configured — sending the user to sign in again.",
    );
    redirect(STALE_SESSION_PATH);
  }

  if (session) {
    const [profile, inputs] = await Promise.all([
      getBusinessProfileRepo().get(session.businessId),
      computeStageInputs(session.businessId),
    ]);

    savedUrl = firstFilled(profile?.websiteUrl)?.replace(/^https?:\/\//, "") ?? "";
    // A site typed before signing in to an existing account is NOT saved at
    // sign-in (see `completeSignIn`); it waits here, pre-filled, for the
    // customer to confirm with Analyze.
    const unconfirmed = await readPendingUrl(session.businessId);
    if (unconfirmed) savedUrl = unconfirmed;

    // Who goes straight to the dashboard.
    //
    // It was "every stage complete". But against the live backend two of the
    // four stages can never read complete — the strategy and the agent runs
    // are recorded only in the mock repos — so EVERY real account landed here
    // after every sign-in, waited on these reads, and had to click "Skip to
    // dashboard". The rule now uses what the live backend actually records: a
    // website on file and an analysis of it. Someone with those has a
    // dashboard to look at; the Connections prompt there covers the rest.
    // `?setup=1` still shows this screen on purpose (to analyse another URL).
    const hasDashboard = savedUrl !== "" && inputs.auditComplete;
    if (setup !== "1" && (hasDashboard || getStageFlags(inputs).allComplete)) {
      redirect("/overview");
    }
  }

  return (
    // The design given 2026-09-29: the form centred between two columns of
    // analysis cards, over a soft cool field, with what happens after the
    // analysis laid out along the bottom. `overflow-x-hidden` because the
    // side columns and their connectors reach towards the page edges.
    <main className="entry-backdrop relative flex min-h-dvh flex-col overflow-x-hidden">
      <div className="relative z-10 flex items-center justify-between gap-3 pr-6 sm:pr-10">
        <BrandHeader />
        <div className="flex min-w-0 items-center gap-3 whitespace-nowrap sm:gap-4">
          {session ? (
            <>
              {/* Hidden on a phone: the address and the button do not both
                  fit beside the logo, and the button is the one that acts. */}
              <span className="hidden min-w-0 truncate text-sm text-ink-soft sm:block">
                {session.ownerId}
              </span>
              {/* The same action the account menu uses, so leaving from here
                  clears every `leadbyte_` cookie too. */}
              <form action={logout}>
                {/* A SubmitButton, like the account menu's: sign-out makes a
                    backend call, and a plain button showed nothing meanwhile. */}
                <SubmitButton
                  pendingLabel="Signing out…"
                  className="rounded-md border border-border bg-surface/80 px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Sign out
                </SubmitButton>
              </form>
            </>
          ) : (
            // Not in the design, which shows no header controls — but a
            // signed-out visitor with an account needs a way in from here.
            <Link
              href="/login"
              className="whitespace-nowrap text-sm font-medium text-ink-soft transition-colors hover:text-ink"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>

      <section className="relative mx-auto w-full max-w-[1586px] flex-1 px-6 pb-16">
        <CornerSparkle />
        <LeftCards />
        <RightCards />

        <div className="relative mx-auto max-w-[46rem] pt-10 text-center sm:pt-14">
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-accent-vivid">
            Website analysis &amp; growth intelligence
          </p>
          <h1 className="mt-6 text-[clamp(2.35rem,4.4vw,4.25rem)] font-bold leading-[1.08] tracking-[-0.03em] text-ink">
            Your Website Is All We <br className="hidden sm:block" />
            Need to <span className="text-accent-vivid">Get Started</span>.
          </h1>
          <p className="mx-auto mt-6 max-w-[37rem] text-lg leading-relaxed text-ink-soft sm:text-[1.2rem]">
            Submit your website and let LeadByte build, launch, automate, monitor, and optimize your
            marketing — from strategy and SEO to AI-powered advertising, social media, and beyond.
          </p>

          <form action={captureWebsiteUrl} className="mx-auto mt-10 max-w-[44rem]">
            <WebsiteField defaultValue={session ? savedUrl : ""} />
          </form>

          {urlProblem === "invalid" && (
            <FlashNotice role="alert" clear={["url"]} className="mx-auto mt-3 max-w-[44rem] rounded-lg bg-crit-soft px-3 py-2 text-sm text-crit">
              {NOT_PUBLIC_WEBSITE}
            </FlashNotice>
          )}

          {save === "failed" ? (
            <FlashNotice role="alert" clear={["save"]} className="mx-auto mt-3 max-w-[44rem] rounded-lg bg-crit-soft px-3 py-2 text-sm text-crit">
              We couldn&apos;t save that just now. Please try again.
            </FlashNotice>
          ) : (
            <p className="mt-6 text-sm leading-relaxed text-ink-soft">
              No lengthy forms. No complicated setup.
              <br />
              Just your website.
            </p>
          )}

          {/* A returning user mid-setup lands here by design, so there has to
              be a way past it — otherwise the screen is a wall rather than a
              prompt. Absent for a signed-out visitor, who has no dashboard. */}
          {session && (
            <p className="mt-3 text-sm">
              <Link href="/overview" className="font-medium text-accent-ink underline-offset-2 hover:underline">
                Skip to dashboard
              </Link>
            </p>
          )}
        </div>

        {/* The hand-written aside, lower right. */}
        <div aria-hidden="true" className="pointer-events-none absolute right-[5%] top-[29rem] hidden -rotate-12 xl:block">
          <p className={`${script.className} text-[1.9rem] font-semibold leading-[1.05] text-accent-vivid`}>
            Better insights.
            <br />
            <span className="ml-6">Bigger growth.</span>
          </p>
          <svg viewBox="0 0 150 20" className="ml-10 mt-0.5 h-4 w-36 text-accent-vivid" fill="none">
            <path d="M2 16 C 45 8, 95 4, 148 2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>
      </section>

      <WhatHappensNext />
    </main>
  );
}
