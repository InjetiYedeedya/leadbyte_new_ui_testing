"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * The agent whose dashboard is showing.
 *
 * ## Why this is a client component
 *
 * It is a `<select>` that has to navigate when its value changes, and an
 * `onChange` handler is the one thing `<form action={serverAction}>` cannot
 * express without a submit button beside it. That is all it does: it holds no
 * data, fetches nothing, and renders no figures — the sections come from the
 * server, already read.
 *
 * ## Why the choice lives in the URL
 *
 * Same rule as the explore page's `?source=`: a URL can be linked, bookmarked
 * and reloaded, and the server can then read only the agent being looked at.
 * Component state would make the selection unshareable and force every agent's
 * tables to be read up front.
 *
 * `useTransition` keeps the current dashboard on screen while the next one is
 * fetched, rather than blanking the panel — this is a control someone will
 * click through several times in a row.
 */
export function AgentDashboardPicker({
  agents,
  selected,
}: {
  agents: { id: string; name: string }[];
  selected: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="shrink-0 text-ink-soft">Agent</span>
      <select
        value={selected}
        aria-label="Agent to show the dashboard for"
        // `aria-busy` rather than a spinner: the app runs ONE loading
        // animation, in the body of the page that is arriving.
        aria-busy={pending}
        disabled={pending}
        suppressHydrationWarning
        onChange={(event) => {
          const next = event.target.value;
          startTransition(() => {
            router.push(`/agents?agent=${encodeURIComponent(next)}`, { scroll: false });
          });
        }}
        className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent disabled:opacity-70"
      >
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
    </label>
  );
}
