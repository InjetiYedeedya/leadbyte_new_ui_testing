/**
 * The small slice of Markdown the strategy agent actually writes.
 *
 * ## Why this exists
 *
 * The agent replies in Markdown and the thread rendered it as raw text, so the
 * screen showed `## Section 1 — Business Profile` and `**Business:**` with the
 * punctuation intact. A page whose entire job is to present a strategy was
 * presenting its source code.
 *
 * ## Why a parser rather than a library
 *
 * `react-markdown` and friends carry a parser, a sanitiser and a plugin system
 * for a page that needs five constructs. This is a closed set — headings,
 * bold, links, bullets, paragraphs — taken from what the agent has actually
 * emitted, and it returns a MODEL rather than HTML. Nothing here can inject
 * markup: the renderer builds React elements from the model, so there is no
 * `dangerouslySetInnerHTML` anywhere in the path and a link's href is checked
 * before it is used.
 *
 * Anything it does not recognise falls through as plain text, which is the
 * behaviour that matters: the agent is a language model and will eventually
 * write something unanticipated, and the screen must degrade to "readable"
 * rather than "broken".
 */

/** A run of text, optionally bold, optionally a link. */
export interface Span {
  text: string;
  bold?: boolean;
  href?: string;
}

export type Block =
  | { kind: "heading"; level: 2 | 3; spans: Span[] }
  | { kind: "paragraph"; spans: Span[] }
  | { kind: "list"; items: Span[][] };

/**
 * Only http(s) links are kept.
 *
 * The agent quotes URLs it found while crawling, so these are third-party
 * strings arriving from a model. `javascript:` and `data:` are the reason this
 * check exists rather than trusting the parse.
 */
function safeHref(url: string): string | undefined {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

/** `**bold**` and `[text](url)`, in one pass so they cannot nest wrongly. */
export function parseSpans(line: string): Span[] {
  const spans: Span[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > last) spans.push({ text: line.slice(last, match.index) });

    if (match[1] !== undefined) {
      spans.push({ text: match[1], bold: true });
    } else if (match[2] !== undefined && match[3] !== undefined) {
      const href = safeHref(match[3]);
      // An unsafe or relative target keeps its label and loses its link. The
      // words are the agent's meaning; the href is the part we cannot vouch for.
      spans.push(href ? { text: match[2], href } : { text: match[2] });
    }
    last = pattern.lastIndex;
  }

  if (last < line.length) spans.push({ text: line.slice(last) });
  return spans.length > 0 ? spans : [{ text: line }];
}

/** Strips the leading marker off a bullet, if the line is one. */
function bulletBody(line: string): string | null {
  const match = /^\s*[-*•]\s+(.*)$/.exec(line);
  return match ? (match[1] ?? "") : null;
}

/**
 * Drops emoji the agent sometimes reaches for in place of a real heading or
 * label ("🏢 **Business:**"). This app draws every icon from its own SVG set
 * — see CLAUDE.md's no-emoji-icons rule — so a stray glyph here reads as
 * inconsistent with the rest of the product rather than as an accent. Applied
 * per line, then the leading whitespace an emoji-plus-space left behind is
 * trimmed, so blank-line and bullet detection downstream still see the same
 * line shapes they did before stripping.
 */
export function stripEmoji(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/\p{Extended_Pictographic}️?‍?/gu, "").replace(/^[ \t]+/, ""))
    .join("\n");
}

/**
 * Turns one agent turn into blocks.
 *
 * Consecutive non-blank prose lines stay in ONE paragraph with their newlines
 * intact rather than being joined with spaces. The agent lays out its sections
 * with real line breaks, and collapsing them runs its sentences together —
 * the same reason the previous renderer used `whitespace-pre-wrap`.
 */
export function parseAgentMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", spans: parseSpans(paragraph.join("\n")) });
    paragraph = [];
  };
  const flushList = () => {
    if (items.length === 0) return;
    blocks.push({ kind: "list", items: items.map(parseSpans) });
    items = [];
  };

  for (const raw of stripEmoji(text).split("\n")) {
    const line = raw.trimEnd();

    if (line.trim() === "") {
      flushList();
      flushParagraph();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      flushParagraph();
      // `#` counts. It was excluded on the assumption the agent only wrote
      // `##`, and it writes both — `# 📊 Business Analysis` came through with
      // the hash still on it, which is the exact bug this file exists to stop.
      //
      // `#` and `##` both render as a section heading, and everything deeper
      // as a label. The agent has two levels of structure however many hashes
      // it reaches for, and a sixth-level heading smaller than body text would
      // be a worse lie than flattening it.
      const level = heading[1]!.length <= 2 ? 2 : 3;
      blocks.push({ kind: "heading", level, spans: parseSpans(heading[2] ?? "") });
      continue;
    }

    const bullet = bulletBody(line);
    if (bullet !== null) {
      flushParagraph();
      items.push(bullet);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushList();
  flushParagraph();
  return blocks;
}
