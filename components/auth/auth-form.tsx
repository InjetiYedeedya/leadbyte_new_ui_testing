"use client";

/**
 * A client island. It earns `"use client"` because `POST /auth/email-signin`
 * and `POST /auth/google-signin` both take a Firebase `idToken`, not
 * credentials — so the Firebase Web SDK has to run in the browser. Its entire
 * job is to produce an idToken and hand it to a Server Action. No application
 * state lives here.
 *
 * The user's password never leaves the browser: it goes to Firebase directly,
 * and only the resulting token reaches our server.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import Link from "@/components/ui/app-link";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import {
  NOT_SET_UP_MESSAGE,
  UPDATED_MESSAGE,
  authErrorMessage,
  isExpectedAuthError,
  isStaleDeployError,
} from "@/lib/firebase/errors";
import { unstable_rethrow } from "next/navigation";
import { completeSignIn, mockSignIn } from "@/app/login/actions";
import { Spinner } from "@/components/ui/spinner";
import { ArrowRight, EnvelopeSimple, LockSimple } from "@phosphor-icons/react";

export type AuthMode = "signin" | "signup";

/**
 * How long after someone comes back to this page an unanswered Google popup
 * is taken as abandoned and the button given back. Long enough for a popup
 * that has just been finished to report in (it closes, then reports), short
 * enough that a retry is not a wait.
 */
const GOOGLE_RETURN_GRACE_MS = 1200;

const COPY = {
  signin: {
    eyebrow: "Sign in to LeadByte",
    heading: "Welcome back.",
    intro: "Continue to your account and keep growing.",
    submit: "Sign in",
    google: "Continue with Google",
    switchPrompt: "New to LeadByte?",
    switchAction: "Create an account",
    switchHref: "/signup",
  },
  signup: {
    eyebrow: "Get started with LeadByte",
    heading: "Create your account.",
    intro: "Set up your account, then we'll analyse your website.",
    submit: "Create account",
    google: "Sign up with Google",
    switchPrompt: "Already have an account?",
    switchAction: "Sign in",
    switchHref: "/login",
  },
} as const;

/**
 * One field's frame: the icon, the input and anything trailing it share a
 * single border, so focus lights the whole row rather than just the text box.
 */
const FIELD =
  "group/field flex h-13 short:h-11 items-center gap-3 rounded-md border border-border bg-surface px-4 transition-[border-color,box-shadow] duration-150 focus-within:border-accent focus-within:shadow-[0_0_0_4px_rgb(29_63_209/0.12)] has-[:disabled]:opacity-50";
const FIELD_ICON =
  "shrink-0 text-ink-soft transition-colors duration-150 group-focus-within/field:text-accent";
const FIELD_INPUT =
  "h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft/80";

export function AuthForm({
  mode,
  notice,
}: {
  mode: AuthMode;
  /** Shown above the heading: the login page's "session expired". */
  notice?: React.ReactNode;
}) {
  const copy = COPY[mode];
  const configured = isFirebaseConfigured();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // WHICH control is working, not merely that something is. Both routes share
  // one transition, so a spinner keyed on `pending` alone put one on the Google
  // button while an email sign-in ran — telling someone a popup was opening
  // when none was.
  const [busy, setBusy] = useState<"email" | "google" | "reset" | null>(null);
  /** Shown once a reset has been requested. See `handleReset` for the wording. */
  const [resetSent, setResetSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // The browser fills a saved login into these fields the moment the page
  // loads, so whoever last signed in on this machine is shown to the next
  // person as the default. A read-only field is skipped by that fill; the
  // fields unlock on the first press or focus, when the browser's own
  // suggestion list can still offer a saved login — asked for, not assumed.
  const [unlocked, setUnlocked] = useState(false);
  // Committed BEFORE the browser moves focus: a field that is still read-only
  // when it receives focus opens no keyboard on an iPhone, so the first tap
  // looked like it did nothing (2026-10-01). Pointer-down comes first, and
  // flushing makes the field writable in time.
  const unlock = () => {
    if (!unlocked) flushSync(() => setUnlocked(true));
  };
  // Until this component is live in the browser the form is plain HTML: a
  // press on Sign in would submit it natively (a GET to /login with the
  // fields in the URL) and reload the page with nothing done. On a slow phone
  // that window is seconds long — the Firebase bundle is large. So the submit
  // stays disabled until hydration, and a field tapped during it is unlocked
  // as soon as we can.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && (active.id === "email" || active.id === "password")) {
      setUnlocked(true);
    }
  }, []);

  /**
   * The failure every path shares. Logged to the browser console with the
   * code only — never a credential — because the customer sees one generic
   * sentence and "sometimes it doesn't work" is undiagnosable without it.
   *
   * A wrong password or a closed popup is a WARNING, not an error: in
   * development Next shows every `console.error` as a red overlay, which made
   * a mistyped password look like a crash (`isExpectedAuthError`).
   */
  function fail(caught: unknown) {
    const code =
      typeof caught === "object" && caught !== null && "code" in caught ? String((caught as { code: unknown }).code) : "";
    const log = isExpectedAuthError(caught) ? console.warn : console.error;
    log("[auth] sign-in failed:", code || (caught instanceof Error ? caught.message : caught));
    if (isStaleDeployError(caught)) {
      setError(UPDATED_MESSAGE);
      window.setTimeout(() => window.location.reload(), 1500);
      return;
    }
    // null means the user dismissed a popup — not an error worth showing.
    const message = authErrorMessage(caught);
    if (message !== null) setError(message);
    // Only the failure path: a success ends in `redirect()` and this
    // component goes with the page.
    setBusy(null);
  }

  /**
   * A production build without its Firebase keys would otherwise fall through
   * to the mock sign-in, which refuses in production with the generic error —
   * every attempt failing, for a reason only a rebuild can fix. Said as ours.
   */
  function notSetUp(): boolean {
    if (configured || process.env.NODE_ENV !== "production") return false;
    console.error("[auth] Firebase is not configured in this build — NEXT_PUBLIC_FIREBASE_* were missing at build time");
    setError(NOT_SET_UP_MESSAGE);
    return true;
  }

  /** Sends an idToken to the server, or falls back to mock sign-in. */
  function submitToken(getToken: () => Promise<string>) {
    setError(null);
    if (notSetUp()) return;
    setBusy("email");
    startTransition(async () => {
      try {
        if (!configured) {
          await mockSignIn();
          return;
        }
        const idToken = await getToken();
        const result = await completeSignIn(idToken, "email");
        if (result && !result.ok) {
          setError(result.message);
          // A refused sign-in RETURNS rather than throws, so the catch below
          // never ran and the button kept its spinner beside the error.
          setBusy(null);
        }
      } catch (caught) {
        // A SUCCESSFUL sign-in lands here. `completeSignIn` ends in
        // `redirect()`, which throws `NEXT_REDIRECT` — and `authErrorMessage`
        // returns its generic message for anything it does not recognise, so a
        // working login rendered "Something went wrong signing you in" and left
        // the button stuck on "One moment…" because the transition never
        // resolved. `unstable_rethrow` puts framework errors back where Next
        // can act on them and lets real failures through.
        unstable_rethrow(caught);
        fail(caught);
      }
    });
  }

  function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Trimmed: a pasted or keyboard-suggested address can carry a space that
    // Firebase answers with "invalid email".
    const address = email.trim();
    submitToken(async () => {
      const auth = getFirebaseAuth();
      if (!auth) throw new Error("Firebase is not configured");
      const credential =
        mode === "signup"
          ? await createUserWithEmailAndPassword(auth, address, password)
          : await signInWithEmailAndPassword(auth, address, password);
      return credential.user.getIdToken();
    });
  }

  /*
   * The Google popup, and getting the button back when it is abandoned
   * (2026-10-12: "stuck on Opening Google…").
   *
   * Firebase's `signInWithPopup` only settles when the popup reports back or
   * it notices the popup has CLOSED — and a click back on this page does not
   * close it, it drops it BEHIND this window, still open, so the promise never
   * settled and the button spun for good. (A popup that really is closed is
   * reported, but only some seconds later.) So:
   *
   * - The popup is waited on OUTSIDE the transition. Inside it, `pending` held
   *   the button disabled for as long as the popup existed, wherever it was.
   * - Coming back to this page while the popup is unanswered releases the
   *   button (`releaseGoogle`, after a short grace in which a popup that has
   *   just finished still gets to report). Pressing it again starts a fresh
   *   attempt; Firebase cancels the old one itself.
   * - Every attempt has a number, and only the CURRENT one may touch the
   *   button, so the old attempt's late "cancelled" cannot undo the new one.
   *   An abandoned popup the person goes back to and finishes still signs
   *   them in — it is the current attempt until another is started.
   */
  const googleAttempt = useRef(0);
  /** The current attempt's popup is answered: the sign-in itself is running. */
  const googleAnswered = useRef(false);
  const releaseTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    function onReturn() {
      if (document.visibilityState === "hidden") return;
      if (googleAttempt.current === 0 || googleAnswered.current) return;
      const attempt = googleAttempt.current;
      window.clearTimeout(releaseTimer.current);
      releaseTimer.current = window.setTimeout(() => {
        if (attempt !== googleAttempt.current || googleAnswered.current) return;
        setBusy((current) => (current === "google" ? null : current));
      }, GOOGLE_RETURN_GRACE_MS);
    }
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
      window.clearTimeout(releaseTimer.current);
    };
  }, []);

  function handleGoogle() {
    // One attempt at a time: a second press while it is really in progress
    // does nothing (the button is disabled too; this is the backstop).
    if (busy === "google" || pending) return;
    setError(null);
    if (notSetUp()) return;
    const attempt = ++googleAttempt.current;
    googleAnswered.current = false;
    window.clearTimeout(releaseTimer.current);
    setBusy("google");

    const finish = (run: () => Promise<void>) =>
      startTransition(async () => {
        try {
          await run();
        } catch (caught) {
          // Same as above: a successful Google sign-in throws NEXT_REDIRECT.
          unstable_rethrow(caught);
          if (attempt === googleAttempt.current) fail(caught);
        }
      });

    if (!configured) {
      finish(async () => {
        await mockSignIn();
      });
      return;
    }

    void (async () => {
      let idToken: string;
      try {
        const auth = getFirebaseAuth();
        if (!auth) throw new Error("Firebase is not configured");
        // Same provider setup as the previous app: always show the account
        // chooser rather than silently reusing a signed-in Google account.
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        provider.addScope("profile");
        provider.addScope("email");
        const credential = await signInWithPopup(auth, provider);
        // Answered — from here it is a sign-in in progress, and coming back
        // to the page must not release the button under it.
        if (attempt !== googleAttempt.current) return;
        googleAnswered.current = true;
        window.clearTimeout(releaseTimer.current);
        setBusy("google");
        idToken = await credential.user.getIdToken();
      } catch (caught) {
        // A newer attempt owns the button; this one's "cancelled" is noise.
        if (attempt !== googleAttempt.current) return;
        googleAnswered.current = false;
        // Clears the spinner for a dismissed popup (which shows no message)
        // as well as for a real failure (which does).
        fail(caught);
        return;
      }
      finish(async () => {
        const result = await completeSignIn(idToken, "google");
        if (result && !result.ok) {
          setError(result.message);
          // A refused sign-in RETURNS rather than throws, so the catch never
          // ran and the button kept its spinner beside the error.
          googleAnswered.current = false;
          setBusy(null);
        }
      });
    })();
  }

  /**
   * Send a password-reset email.
   *
   * ## The confirmation is deliberately the same either way
   *
   * Firebase answers `auth/user-not-found` for an address it does not know, and
   * surfacing that turns this box into a way to test whether someone has an
   * account here — which is a disclosure about your customers made to anyone
   * who can load the page. So a send and a miss produce the same sentence, and
   * the sentence is carefully hedged: "if that address has an account".
   *
   * A genuine fault — no network, a malformed address, too many attempts — is
   * still reported, because those the person can act on.
   */
  function handleReset() {
    const address = email.trim();
    if (address === "") {
      setError("Enter your email address first, and we'll send a reset link.");
      return;
    }

    setError(null);
    setBusy("reset");
    startTransition(async () => {
      try {
        const auth = getFirebaseAuth();
        // Mock mode has no Firebase to ask. Saying "sent" would be a lie; the
        // same non-committal sentence is true in both.
        if (auth) await sendPasswordResetEmail(auth, address);
        setResetSent(true);
      } catch (caught) {
        unstable_rethrow(caught);
        const message = authErrorMessage(caught);
        // An unknown address is not an error the customer should see — see
        // above. Anything else is.
        if (message !== null && !/user-not-found|no user record/i.test(String(caught))) {
          setError(message);
        } else {
          setResetSent(true);
        }
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <div>
      {notice}
      <p className="text-sm font-medium text-ink">{copy.eyebrow}</p>
      <h1 className="mt-2 text-[2.375rem] font-bold leading-[1.1] tracking-tight text-ink short:text-[2rem]">
        {copy.heading}
      </h1>
      <p className="mt-2 text-sm text-ink-soft">{copy.intro}</p>

      <button
        type="button"
        onClick={handleGoogle}
        // Busy only while a Google attempt is really running — not for as
        // long as an abandoned popup sits behind the window (`handleGoogle`).
        disabled={pending || busy === "google"}
        // Form-filler extensions stamp attributes onto BUTTONS as well as
        // inputs, so every control in this form needs this — not just the
        // credential fields.
        suppressHydrationWarning
        className="mt-8 flex h-13 w-full items-center short:mt-5 short:h-11 justify-center gap-3 rounded-md border border-border bg-surface px-4 font-semibold text-ink shadow-[0_1px_2px_rgb(12_21_63/0.06)] hover:border-ink/20 hover:bg-ground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
      >
        {busy === "google" ? <Spinner size="md" /> : <GoogleMark />}
        {busy === "google" ? "Opening Google…" : copy.google}
      </button>

      <div className="my-6 flex items-center gap-4 short:my-4">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-ink-soft">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleEmailSubmit} className="flex flex-col gap-5 short:gap-3.5">
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-ink">
            Email
          </label>
          <div className={FIELD}>
            <EnvelopeSimple size={20} aria-hidden="true" className={FIELD_ICON} />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={!unlocked}
              onPointerDown={unlock}
              onFocus={unlock}
              disabled={pending}
              placeholder="Enter your email"
              // Password managers inject attributes into credential fields before
              // React hydrates, which reads as a hydration mismatch. Scoped to
              // these two inputs only — never put this on a parent.
              suppressHydrationWarning
              className={FIELD_INPUT}
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <label htmlFor="password" className="block text-sm font-medium text-ink">
              Password
            </label>
            {/* Signin only: on the signup form there is no account to recover
                yet, and offering it there is an invitation to a dead end. */}
            {mode === "signin" && (
              <button
                type="button"
                onClick={handleReset}
                disabled={pending}
                suppressHydrationWarning
                className="rounded text-sm font-medium text-accent-ink hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
              >
                {busy === "reset" ? "Sending…" : "Forgot password?"}
              </button>
            )}
          </div>
          <div className={FIELD}>
            <LockSimple size={20} aria-hidden="true" className={FIELD_ICON} />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              readOnly={!unlocked}
              onPointerDown={unlock}
              onFocus={unlock}
              disabled={pending}
              placeholder={mode === "signup" ? "At least 6 characters" : "Enter your password"}
              suppressHydrationWarning
              className={FIELD_INPUT}
            />
            {/* A real button, not an icon-only affordance: it is reachable by
                keyboard, it says which state it is in, and `aria-pressed` makes
                that state available without sight. Typing a long password blind
                is the single most common reason people give up and reset it. */}
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-pressed={showPassword}
              aria-controls="password"
              suppressHydrationWarning
              className="-mr-1.5 shrink-0 rounded px-1.5 py-0.5 text-sm font-medium text-ink-soft hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {/* Deliberately hedged: "if that address has an account". Firebase
            distinguishes a known address from an unknown one, and repeating
            that distinction here would turn this form into a way to test who
            has an account — a disclosure about customers, made to anyone who
            can load the page. */}
        {resetSent && (
          <p role="status" className="reveal-up rounded-md bg-good-soft px-3 py-2 text-sm text-good">
            If that address has an account, a reset link is on its way. It expires in an hour.
          </p>
        )}

        {error !== null && (
          <p role="alert" className="reveal-up rounded-md bg-crit-soft px-3 py-2 text-sm text-crit">
            {error}
          </p>
        )}

        <button
          type="submit"
          // Off until hydrated — see `hydrated`.
          disabled={pending || !hydrated}
          suppressHydrationWarning
          className="group flex h-13 w-full items-center justify-center gap-2 short:h-11 rounded-md bg-accent px-4 font-semibold text-surface shadow-[0_10px_24px_-10px_rgb(29_63_209/0.7)] hover:bg-accent-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
        >
          {busy === "email" && <Spinner />}
          {busy === "email" ? "One moment…" : copy.submit}
          {busy !== "email" && (
            <ArrowRight
              size={18}
              weight="bold"
              aria-hidden="true"
              className="hover-nudge transition-transform duration-200 ease-out"
            />
          )}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-ink-soft short:mt-5">
        {copy.switchPrompt}{" "}
        <Link href={copy.switchHref} className="font-semibold text-accent-ink hover:underline">
          {copy.switchAction}
        </Link>
      </p>

      {!configured && process.env.NODE_ENV !== "production" && (
        <p className="mt-5 rounded-md border border-border bg-surface/70 px-3 py-2 text-xs text-ink-soft">
          Mock mode: Firebase isn&apos;t configured, so any submission signs you into the seeded
          NovaFlow workspace. Set the <code className="font-mono">NEXT_PUBLIC_FIREBASE_*</code> vars
          to use real accounts.
        </p>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
