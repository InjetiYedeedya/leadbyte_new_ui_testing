import { SubmitButton } from "@/components/ui/submit-button";
import { ProblemList } from "@/components/agents/setup-fields";
import { CheckCircle, Info, XCircle } from "@phosphor-icons/react/ssr";
import type { OpenAiAccount, OpenAiCheck } from "@/lib/data/openai-account";

/**
 * "Add your OpenAI API key" — shown in place of the OpenAI Ads setup form.
 *
 * ## Why it replaces the form rather than sitting above it
 *
 * The same rule as `EmailGateNotice`: the campaign cannot be planned without
 * the key, so letting someone fill in a budget, a date range and a location
 * first only to be turned away puts the block in the wrong place. The work
 * starts here.
 *
 * ## Why the key is a password field, and what that does not buy
 *
 * `type="password"` stops it being read over the customer's shoulder or
 * captured in a screen recording. It does NOT stop a browser extension or a
 * password manager, and it is not why the key is safe — the httpOnly cookie in
 * `lib/data/openai-key.ts` is. This is hygiene, not the mechanism.
 *
 * A Server Component: a `<form action={saveOpenAiKey}>` says everything this
 * needs to say, so it does not earn `"use client"`. `SubmitButton` is the one
 * island, because writing the cookie and redirecting takes long enough that a
 * button with no pending state reads as dead.
 */
export function OpenAiKeyForm({
  action,
  problems,
  /**
   * Whether a key is already stored. A yes/no on purpose: no part of the key
   * is ever shown back (product notes, 2026-09-30 — "users do not need to see
   * the API key they provide"). The old mask kept everything up to the key's
   * LAST hyphen, which for a real `sk-proj-…` key was most of it.
   */
  keySaved = false,
  forgetAction,
  /** What `verify` reported about the account, shown once a key is connected. */
  account = null,
  conversionEventCount = 0,
}: {
  action: (formData: FormData) => Promise<void>;
  problems: string[];
  keySaved?: boolean;
  /** Offered only alongside a stored key. */
  forgetAction?: () => Promise<void>;
  account?: OpenAiAccount | null;
  /** How many conversion events the account has — decides two of the goals. */
  conversionEventCount?: number;
}) {
  if (keySaved && forgetAction) {
    return (
      <ConnectedAccount
        account={account}
        conversionEventCount={conversionEventCount}
        forgetAction={forgetAction}
      />
    );
  }

  return (
    <form action={action} className="max-w-2xl">
      {/* Not a campaign — nothing has been launched or is about to be. */}
      <ProblemList problems={problems} heading="That key could not be connected:" />

      <div className="mb-5 rounded-lg border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-ink">Add your OpenAI API key</p>
        <p className="mt-1 text-sm text-ink-soft">
          The agent plans and runs campaigns on your own OpenAI account, so the key stays yours
          and so does the spend. We keep it in this browser only and clear it when you sign out.
        </p>

        <label className="mt-4 block">
          <span className="mb-1 block text-sm text-ink">API key</span>
          <input
            name="apiKey"
            type="password"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-…"
            // Password managers stamp attributes onto fields before React
            // hydrates; without this the form logs a hydration mismatch.
            suppressHydrationWarning
            className="w-full rounded-md border border-border bg-surface px-3.5 py-2.5 font-mono text-sm text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent"
          />
        </label>

        <SubmitButton
          pendingLabel="Validating…"
          className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink active:scale-[0.98] motion-reduce:transform-none"
        >
          Validate API key
        </SubmitButton>
      </div>
    </form>
  );
}

/** What each check is about, in the customer's words. */
const CHECK_LABELS: Record<string, string> = {
  key_valid: "API key",
  account_active: "Ad account",
  brand_approved: "Brand review",
  tracking: "Conversion tracking",
};

function checkLabel(key: string): string {
  const known = CHECK_LABELS[key];
  if (known) return known;
  const words = key.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The connected state: ONE card, as compact as the facts allow.
 *
 * It was two (2026-10-03): the account, and a "Ready to run" card for the
 * service's checks. With a key saved before checks were stored, the second
 * card was a box asking to connect again, beside a first card of white space.
 * Now the name and the key action share the top row, the four facts sit in one
 * row beneath (wrapping, never cut off), and the checks and conversion events
 * appear as a row of badges only when there is something to say. Each check
 * has its own icon as well as its colour, so it reads without colour. Every
 * value is the reply's; nothing is inferred.
 */
function ConnectedAccount({
  account,
  conversionEventCount,
  forgetAction,
}: {
  account: OpenAiAccount | null;
  conversionEventCount: number;
  forgetAction: () => Promise<void>;
}) {
  const facts: [label: string, value: string][] = account
    ? (
        [
          ["Status", account.status],
          ["Review status", account.reviewStatus],
          ["Currency", account.currency],
          ["Timezone", account.timezone],
        ] as [string, string][]
      ).filter(([, value]) => value.trim() !== "")
    : [];
  const checks = account?.checks ?? [];

  return (
    <section
      aria-labelledby="openai-account-heading"
      className="mb-5 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium text-good">
            <CheckCircle size={14} weight="fill" aria-hidden="true" />
            OpenAI key connected
          </p>
          <h2 id="openai-account-heading" className="mt-1 text-base font-semibold text-ink">
            {account?.name || "Your OpenAI ad account"}
          </h2>
          {account?.accountId && (
            <p className="break-all font-mono text-xs text-ink-soft">{account.accountId}</p>
          )}
        </div>
        <form action={forgetAction}>
          <SubmitButton
            pendingLabel="Removing…"
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-raised"
          >
            Use a different key
          </SubmitButton>
        </form>
      </div>

      {facts.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-border pt-3 sm:grid-cols-4">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-ink-soft">{label}</dt>
              <dd className="break-words text-sm font-medium text-ink first-letter:uppercase">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Only with something to say: a key saved before checks were kept has
          none, and an empty box asking to reconnect read as a fault. */}
      {(checks.length > 0 || conversionEventCount > 0) && (
        <ul aria-label="Account checks" className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          {checks.map((check) => (
            <CheckBadge key={check.key} check={check} />
          ))}
          <li className="inline-flex items-center gap-1.5 rounded-full bg-surface-raised px-2.5 py-1 text-xs text-ink">
            <span className="font-medium">
              {conversionEventCount === 1 ? "1 conversion event" : `${conversionEventCount} conversion events`}
            </span>
            <span className="text-ink-soft">
              {conversionEventCount > 0
                ? "Leads and App installs available"
                : "Leads and App installs unavailable"}
            </span>
          </li>
        </ul>
      )}

      <p className="mt-3 text-xs text-ink-soft">
        Your key stays in this browser and is cleared when you sign out. Campaigns run on your own
        account, so spend and rate limits are yours.
      </p>
    </section>
  );
}

function CheckBadge({ check }: { check: OpenAiCheck }) {
  const tone = check.ok
    ? "bg-good-soft text-good"
    : check.informational
      ? "bg-info-soft text-info"
      : "bg-crit-soft text-crit";
  const Icon = check.ok ? CheckCircle : check.informational ? Info : XCircle;
  return (
    <li className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${tone}`}>
      <Icon size={13} weight="fill" aria-hidden="true" />
      <span className="font-medium">{checkLabel(check.key)}</span>
      <span className="first-letter:uppercase">{check.value || (check.ok ? "OK" : "Not ready")}</span>
      <span className="sr-only">
        {check.ok ? "passed" : check.informational ? "for information, not required" : "needs attention"}
      </span>
    </li>
  );
}
