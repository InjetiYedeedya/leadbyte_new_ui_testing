import { cookies } from "next/headers";

/**
 * Whether the customer has said "not now" to the Connect-Google banner.
 *
 * ## Why this exists
 *
 * `SearchConsolePrompt` rides along on every page and hid itself only when
 * Google was connected, when Search Console data arrived, or when there was no
 * analysis to stand beside. Choosing "Move to strategy" in its own dialog —
 * the option whose copy is "Start the plan now" — was a plain navigation that
 * recorded nothing, so the banner was still sitting there on the page it sent
 * you to. Asking again, immediately, on the screen the customer asked to be
 * taken to, reads as an app that is not listening.
 *
 * ## Why not `connectionsRepo.skip()`
 *
 * That already exists and would have been less code. It is the wrong thing:
 * `skip` feeds `connectionsResolved` in `computeStageInputs`, so it ticks the
 * whole Connections STAGE off the setup rail. Declining one banner is not a
 * statement about onboarding, and silently completing a stage on the
 * customer's behalf is a bigger claim than they made. Rule 1 cuts both ways —
 * stage state is derived from real data, so nothing may fake it.
 *
 * ## Why it comes back
 *
 * "Not now" is not "never". Search Console is the only source of the keyword
 * data three screens are built around, so a permanent dismissal quietly costs
 * the customer a feature they never decided to give up. `DISMISS_DAYS` is how
 * long the app takes the hint for. Connecting removes the banner on its own
 * merits and this never enters into it.
 *
 * The cookie carries the `leadbyte_` prefix so `lib/auth/sign-out.ts` sweeps it
 * with everything else — one customer's "not now" must not greet the next
 * person to sign in on the same browser.
 */

const COOKIE = "leadbyte_google_prompt";
const DISMISS_DAYS = 7;

/** Readable anywhere. */
export async function googlePromptDismissed(): Promise<boolean> {
  const store = await cookies();
  return store.get(COOKIE)?.value === "dismissed";
}

/**
 * Records "not now".
 *
 * Cookies are writable only from a Server Action or Route Handler, so this
 * must be called from one — see `skipGoogleAndPlan`.
 */
export async function dismissGooglePrompt(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, "dismissed", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DISMISS_DAYS * 24 * 60 * 60,
  });
}
