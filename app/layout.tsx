import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { DatePickerOnClick } from "@/components/ui/date-picker-on-click";

// Geist Sans + Geist Mono, replacing Inter + JetBrains Mono (2026-09-20).
//
// The design's stated intent was always Söhne / Söhne Mono, which is not
// available as a web font; Inter was picked as the nearest substitute. Geist
// is the closer one. It is a grotesque cut for interfaces rather than for
// text, so it holds its shape at the 12-14px this app runs most of its
// labels at, and its mono is metrically matched to it — which Inter and
// JetBrains Mono never were, so a figure in a table sat at a different
// optical weight to the label beside it.
//
// The variables stay `*-face`, not `--font-sans` / `--font-mono`: those two
// names are Tailwind 4 theme tokens, and a token defined as
// `--font-sans: var(--font-sans)` would reference itself.
const sans = { variable: GeistSans.variable };
const mono = { variable: GeistMono.variable };

export const metadata: Metadata = {
  title: "LeadByte",
  description: "AI marketing intelligence platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla's
          cz-shortcut-listen attribute) inject attributes into <body> before
          React hydrates, causing a harmless mismatch warning unrelated to
          our code. See https://react.dev/link/hydration-mismatch */}
      <body suppressHydrationWarning>
        {/* There is no navigation bar here any more. It swept across the top
            while a page was in flight, and then `PageLoading` ran in the body
            while that page streamed — two animations for one wait, both on
            screen together on a slow read. `PageLoading` is now the only one,
            and it covers the whole wait. */}
        {children}
        {/* Every date field opens its calendar on a click anywhere in it. */}
        <DatePickerOnClick />
      </body>
    </html>
  );
}
