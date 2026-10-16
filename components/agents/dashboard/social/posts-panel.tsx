"use client";

/**
 * The Social Media tab's posts, one platform at a time.
 *
 * ## Why a client island
 *
 * Switching platform is state plus a marker that travels between the
 * platform buttons — exactly what a `<form action={serverAction}>` cannot
 * express, and a round trip per click would re-read four tables to show rows
 * that are already here. All four platforms' posts arrive as props from the
 * Server Component; nothing here fetches.
 *
 * ## Why a toggle group and not a tablist
 *
 * The same call `breakdown-panel.tsx` made: a tablist promises arrow-key
 * navigation and a roving tabindex. These are four buttons that swap one
 * region, which `aria-pressed` + `aria-controls` describes honestly.
 *
 * ## Why the list scrolls back to the top
 *
 * The list scrolls inside its own box (the dashboard is a narrow slide-in),
 * so without a reset, switching from post 30 of Instagram lands the reader
 * half way down Facebook's list, looking at its middle as if it were the top.
 */

import { ArrowUpRight } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";
import { LoadFailed, NothingYet, Panel } from "@/components/agents/dashboard/parts";
import { mediaTypeLabel, type PlatformPerformance, type SocialPost } from "@/lib/data/dashboard/social-performance";
import { webHref } from "@/lib/data/profile-display";
import { formatCount } from "@/lib/format";
import { PlatformMark } from "./platform-mark";

function figure(value: number | null): string {
  return value === null ? "—" : formatCount(value);
}

/** The platform the panel opens on: the first with posts, so it never opens on an empty list it could avoid. */
function initialPlatform(platforms: PlatformPerformance[]): string {
  return (platforms.find((p) => p.posts.length > 0) ?? platforms.find((p) => p.ok) ?? platforms[0])?.id ?? "";
}

export function SocialPostsPanel({ platforms }: { platforms: PlatformPerformance[] }) {
  const reduce = useReducedMotion();
  const uid = useId();
  const [activeId, setActiveId] = useState(() => initialPlatform(platforms));
  const listRef = useRef<HTMLDivElement>(null);

  const active = platforms.find((p) => p.id === activeId) ?? platforms[0];

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [activeId, platforms]);

  if (!active) return null;

  const sharesWord = active.sharesLabel?.toLowerCase();
  const hint =
    active.posts.length > 0
      ? `${formatCount(active.posts.length)} ${active.posts.length === 1 ? "post" : "posts"}, sorted by likes, comments${
          sharesWord ? ` and ${sharesWord}` : ""
        } combined.`
      : "Sorted by likes, comments and shares combined.";

  const controls = (
    <div className="max-w-full overflow-x-auto">
      <div role="group" aria-label="Platform" className="flex w-max gap-0.5 rounded-md bg-ground p-0.5">
        {platforms.map((platform) => {
          const selected = platform.id === active.id;
          return (
            <button
              key={platform.id}
              type="button"
              aria-pressed={selected}
              aria-controls={`${uid}-posts`}
              onClick={() => setActiveId(platform.id)}
              className={`relative inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                selected ? "text-ink" : "text-ink-soft hover:text-ink"
              }`}
            >
              {/* The marker travels between buttons rather than blinking — it
                  IS the answer to the click, so reduced motion moves it
                  instantly instead of removing it. */}
              {selected && (
                <motion.span
                  layoutId={`${uid}-marker`}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-md bg-surface shadow-sm"
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative inline-flex items-center gap-1.5">
                <PlatformMark platform={platform.id} size={14} />
                {platform.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Panel title="Posts" hint={hint} action={controls}>
      <div id={`${uid}-posts`}>
        {!active.ok ? (
          <LoadFailed what={`${active.name} posts`} />
        ) : active.posts.length === 0 ? (
          <NothingYet
            title={`No ${active.name} posts synced yet.`}
            description="They appear here after the Social Media agent's next sync with this account."
          />
        ) : (
          <div
            ref={listRef}
            tabIndex={0}
            role="region"
            aria-label={`${active.name} posts`}
            className="max-h-[28rem] overflow-y-auto rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ol className="divide-y divide-border">
              {active.posts.map((post, index) => (
                <PostRow
                  key={post.key}
                  post={post}
                  rank={index + 1}
                  platform={active}
                  max={active.posts[0]?.engagement ?? 0}
                />
              ))}
            </ol>
          </div>
        )}
      </div>
    </Panel>
  );
}

function PostRow({
  post,
  rank,
  platform,
  max,
}: {
  post: SocialPost;
  rank: number;
  platform: PlatformPerformance;
  /** The top post's engagement — what a full bar means. */
  max: number;
}) {
  const href = webHref(post.link);
  const engagement = post.engagement ?? 0;
  const width = max > 0 && engagement > 0 ? Math.max(4, (engagement / max) * 100) : 0;

  const figures: { label: string; value: number | null }[] = [
    { label: "Likes", value: post.likes },
    { label: "Comments", value: post.comments },
    ...(platform.sharesLabel ? [{ label: platform.sharesLabel, value: post.shares }] : []),
    ...(platform.audienceLabel ? [{ label: platform.audienceLabel, value: post.audience }] : []),
    ...(platform.hasNewSubs ? [{ label: "New subs", value: post.newSubs }] : []),
  ];

  return (
    <li className="flex min-w-0 flex-col gap-1.5 py-2.5 pr-1">
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-6 shrink-0 text-xs tabular-nums text-ink-soft">{rank}</span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-0.5 rounded-md text-sm font-medium text-accent-ink underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Post {rank}
            <ArrowUpRight size={12} weight="bold" aria-hidden="true" />
            <span className="sr-only"> on {platform.name} (opens in a new tab)</span>
          </a>
        ) : (
          <span className="shrink-0 text-sm font-medium text-ink">Post {rank}</span>
        )}
        {platform.hasMediaType && post.mediaType && (
          <span className="truncate rounded-md bg-ground px-1.5 py-0.5 text-xs text-ink-soft">
            {mediaTypeLabel(post.mediaType)}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {/* Length against the top post, so the list's shape reads at a
              glance; the number beside it carries the value for everyone. */}
          <span aria-hidden="true" className="block h-1.5 w-12 overflow-hidden rounded-full bg-border/60">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
          </span>
          <span className="text-sm font-semibold tabular-nums text-ink">
            {figure(post.engagement)}
            <span className="sr-only"> engagements</span>
          </span>
        </span>
      </div>
      <dl className="ml-8 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
        {figures.map((f) => (
          <div key={f.label} className="flex gap-1">
            <dt className="text-ink-soft">{f.label}</dt>
            <dd className="tabular-nums text-ink">{figure(f.value)}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}
