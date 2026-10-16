import Image from "next/image";
import Link from "@/components/ui/app-link";
import {
  ChartBar,
  ChartLineUp,
  Lightbulb,
  MagnifyingGlass,
} from "@phosphor-icons/react/ssr";

/**
 * The frame around the sign-in and sign-up forms, built to the approved
 * design (2026-09-24): the promise on the left, the form on a frosted card on
 * the right, both over a softened photograph of an office.
 *
 * ## The photograph
 *
 * `public/login-img.jpg`, the design's own photo (a 176 KB JPEG of the 1.5 MB
 * `login-img.png` original, removed 2026-10-03 — it is in git history). It is already soft-focus
 * and blue, so it gets no blur or tint of its own, only the wash that keeps
 * the headline readable. Its rising chart and the "Website / Search /
 * Insights / Growth" labels are part of the picture, not the page, which is
 * why they sit to the right of the card rather than being drawn.
 *
 * A still, not video: a moving picture behind a form competes with the one
 * thing on the screen someone came to do.
 *
 * ## Motion
 *
 * One entrance, CSS only, so this stays a Server Component. The card lands
 * first because it is what the visitor came for; the copy beside it follows
 * in reading order. Everything is `transform` / `opacity`, and reduced motion
 * keeps the fade and drops the movement (`reveal-up`, `auth-backdrop`).
 */

const FEATURES = [
  {
    icon: MagnifyingGlass,
    title: "Website Audit",
    body: "Find technical and content opportunities",
  },
  {
    icon: ChartBar,
    title: "AI Visibility",
    body: "See how AI search engines understand you",
  },
  {
    icon: Lightbulb,
    title: "Actionable Insights",
    body: "Get clear, prioritized recommendations",
  },
  {
    icon: ChartLineUp,
    title: "Grow Faster",
    body: "Turn insights into more traffic, leads and revenue",
  },
] as const;

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as React.CSSProperties;

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative isolate min-h-dvh overflow-x-hidden">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {/* Anchored right so the chart stays in view as the window narrows;
            the left of the photo is plain window and wash. */}
        <div className="auth-backdrop absolute inset-0">
          <Image
            src="/login-img.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-[70%_center]"
          />
        </div>
        <div className="auth-wash absolute inset-0" />
      </div>

      <div className="mx-auto flex min-h-dvh w-full max-w-[1320px] flex-col px-5 sm:px-8 xl:px-10">
        <header className="pt-7 lg:pt-10 short:pt-5">
          <Link
            href="/"
            className="inline-flex rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            <Image
              src="/leadbyte-logo.png"
              alt="LeadByte"
              width={512}
              height={133}
              priority
              className="h-8 w-auto"
            />
          </Link>
        </header>

        <div className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_31rem] lg:gap-16 lg:py-8 xl:pr-[9%] short:py-4">
          {/* The card comes first in the source so a phone shows the form
              without scrolling past the pitch; the grid puts it back on the
              right from `lg`. */}
          <section
            className="reveal-up auth-card rounded-3xl p-6 sm:p-10 lg:col-start-2 lg:row-start-1 xl:p-12 short:p-8"
            style={delay(0)}
          >
            {children}
          </section>

          <div className="lg:col-start-1 lg:row-start-1">
            <p
              className="reveal-up text-[2.5rem] font-bold leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-[3.5rem] short:text-[2.75rem]"
              style={delay(90)}
            >
              Turn your <br className="hidden sm:block" />
              online presence <br className="hidden sm:block" />
              into <span className="text-accent-vivid">real growth.</span>
            </p>

            <p
              className="reveal-up mt-5 max-w-[27rem] text-base leading-relaxed text-ink-soft lg:text-[1.125rem] lg:leading-[1.6] short:mt-3 short:text-base"
              style={delay(160)}
            >
              LeadByte analyses your website, AI visibility and marketing performance to find
              opportunities and help your business grow faster.
            </p>

            <ul className="mt-7 grid gap-4 short:mt-5 short:gap-2.5">
              {FEATURES.map((feature, i) => {
                const Icon = feature.icon;
                return (
                  <li
                    key={feature.title}
                    className="reveal-up flex items-center gap-4"
                    style={delay(230 + i * 60)}
                  >
                    <span className="auth-chip flex size-13 shrink-0 short:size-11 items-center justify-center rounded-md text-accent">
                      <Icon size={24} weight="bold" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">{feature.title}</span>
                      <span className="block text-xs text-ink-soft">{feature.body}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
