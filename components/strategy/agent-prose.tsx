import { parseAgentMarkdown, stripEmoji, type Block, type Span } from "@/lib/agent-markdown";

/**
 * A stable anchor for a section heading.
 *
 * Derived from the heading's own words so the contents rail and the document
 * agree without either passing ids to the other, and so a link survives the
 * agent rewording a later turn — the anchor changes with the words it names,
 * which is the honest behaviour.
 */
export function headingId(spans: Span[]): string {
  return (
    "s-" +
    spans
      .map((s) => s.text)
      .join("")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
  );
}

/** The `##` headings of a turn, for the contents rail. */
export function sectionHeadings(text: string): { id: string; label: string }[] {
  return parseAgentMarkdown(text)
    .filter((b): b is Extract<Block, { kind: "heading" }> => b.kind === "heading" && b.level === 2)
    .map((b) => ({ id: headingId(b.spans), label: b.spans.map((s) => s.text).join("") }));
}

/**
 * The agent's turn, set as a document rather than a chat bubble.
 *
 * ## Why it is not a bubble
 *
 * The two sides of this conversation are not the same shape. The customer
 * writes a sentence; the agent writes a structured brief with numbered
 * sections, definition lists and a budget table. A speech bubble is the right
 * container for the first and completely wrong for the second — 900px of
 * headed, bulleted prose inside a rounded blob reads as a chat log of a
 * document rather than the document itself.
 *
 * So the agent's side has no bubble at all. It is set as body text at a
 * reading measure, with the hierarchy the Markdown was always describing, and
 * the customer's replies stay small and right-aligned beside it. The asymmetry
 * is what tells you who is speaking — no label, no avatar, no tail needed.
 *
 * ## Rendering, and what it refuses to do
 *
 * React elements from a parsed model. No `innerHTML` anywhere in this path, so
 * markup in an agent reply is text and cannot become DOM. Links are already
 * filtered to http(s) by the parser and carry `rel="noreferrer noopener"`
 * because they point at sites we crawled, not at us.
 */
function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((span, i) => {
        if (span.href) {
          return (
            <a
              key={i}
              href={span.href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent-ink underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
            >
              {span.text}
            </a>
          );
        }
        if (span.bold) {
          return (
            <strong key={i} className="font-semibold text-ink">
              {span.text}
            </strong>
          );
        }
        // `whitespace-pre-line` on the block keeps the agent's own line breaks:
        // it lays sections out with them and joining them runs its sentences
        // together.
        return <span key={i}>{span.text}</span>;
      })}
    </>
  );
}

export function AgentProse({ text }: { text: string }) {
  const blocks = parseAgentMarkdown(text);

  // Nothing parseable — show the raw turn rather than an empty panel. The
  // agent is a language model and silence here would look like a failure.
  if (blocks.length === 0) {
    return (
      <p className="whitespace-pre-wrap text-[0.9375rem] leading-7 text-ink">{stripEmoji(text)}</p>
    );
  }

  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          // `h2` opens a section and earns a rule under it; `h3` is a label
          // inside one and does not. The rule is the section divider the
          // agent's `##` was standing in for.
          return block.level === 2 ? (
            <h2
              key={i}
              id={headingId(block.spans)}
              // `scroll-mt` clears the sticky header when the contents rail
              // jumps here, or the heading lands under it and looks skipped.
              className="scroll-mt-28 border-b border-border pb-2 pt-2 text-base font-bold tracking-tight text-ink first:pt-0"
            >
              <Spans spans={block.spans} />
            </h2>
          ) : (
            <h3 key={i} className="pt-1 text-sm font-bold text-ink">
              <Spans spans={block.spans} />
            </h3>
          );
        }

        if (block.kind === "list") {
          return (
            <ul key={i} className="space-y-1.5">
              {block.items.map((item, j) => (
                <li key={j} className="flex gap-3 text-[0.9375rem] leading-7 text-ink-soft">
                  {/* A dot rather than a disc marker, aligned to the first
                      line's optical centre, so a wrapped item hangs cleanly. */}
                  <span
                    aria-hidden="true"
                    className="mt-[0.6875rem] h-1 w-1 shrink-0 rounded-full bg-ink-soft/50"
                  />
                  <span>
                    <Spans spans={item} />
                  </span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p
            key={i}
            className="whitespace-pre-line text-[0.9375rem] leading-7 text-ink-soft"
          >
            <Spans spans={block.spans} />
          </p>
        );
      })}
    </div>
  );
}
