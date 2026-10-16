import { parseAgentMarkdown, parseSpans, stripEmoji } from "./agent-markdown";

/**
 * The cases are taken from a real strategy-agent turn captured on 2026-09-08,
 * which is what the screen was rendering as raw punctuation.
 */
describe("stripEmoji", () => {
  it("drops an emoji and the space that followed it", () => {
    expect(stripEmoji("🏢 Business: ZippyGo")).toBe("Business: ZippyGo");
  });

  it("drops several emoji across a multi-line turn, one line at a time", () => {
    expect(stripEmoji("🎯 Detected goals: grow\n💰 Estimated budget: $7/mo")).toBe(
      "Detected goals: grow\nEstimated budget: $7/mo",
    );
  });

  it("leaves plain prose untouched", () => {
    expect(stripEmoji("Business: ZippyGo — travel booking")).toBe(
      "Business: ZippyGo — travel booking",
    );
  });
});

describe("parseSpans", () => {
  it("reads bold", () => {
    expect(parseSpans("**Business:** Chefgaa")).toEqual([
      { text: "Business:", bold: true },
      { text: " Chefgaa" },
    ]);
  });

  it("reads a link", () => {
    expect(parseSpans("see [go.chefgaa.com](https://go.chefgaa.com/india) now")).toEqual([
      { text: "see " },
      { text: "go.chefgaa.com", href: "https://go.chefgaa.com/india" },
      { text: " now" },
    ]);
  });

  it("never lets a non-http scheme become an href", () => {
    // The agent quotes URLs it crawled. The words are its meaning; the target
    // is the part we cannot vouch for. The assertion is the invariant — that
    // NO span carries a link — rather than the exact spans, because the
    // nested bracket leaves a stray character and that is cosmetic, not a
    // security property.
    for (const attack of [
      "[click](javascript:alert(1))",
      "[click](JavaScript:alert(1))",
      "[click](data:text/html;base64,PHN2Zz4=)",
      "[click](vbscript:msgbox)",
    ]) {
      expect(parseSpans(attack).every((span) => span.href === undefined)).toBe(true);
    }
  });

  it("drops a relative link the same way", () => {
    expect(parseSpans("[home](/overview)")).toEqual([{ text: "home" }]);
  });

  it("leaves plain text alone", () => {
    expect(parseSpans("no markup here")).toEqual([{ text: "no markup here" }]);
  });

  it("survives an unclosed bold marker", () => {
    // A language model will eventually write this. It must read as text, not
    // swallow the rest of the turn.
    expect(parseSpans("**not closed")).toEqual([{ text: "**not closed" }]);
  });
});

describe("parseAgentMarkdown", () => {
  it("reads a heading", () => {
    expect(parseAgentMarkdown("## Section 1 — Business Profile")).toEqual([
      { kind: "heading", level: 2, spans: [{ text: "Section 1 — Business Profile" }] },
    ]);
  });

  it("reads a single-hash heading", () => {
    // Seen live: `# 📊 Business Analysis` rendered with the hash still on it
    // because the parser started at `##`.
    expect(parseAgentMarkdown("# Business Analysis")).toEqual([
      { kind: "heading", level: 2, spans: [{ text: "Business Analysis" }] },
    ]);
  });

  it("drops a leading emoji the agent used in place of a real icon", () => {
    // Seen live: "🏢 **Business:** ZippyGo — an AI-powered..." — this app
    // draws icons from its own SVG set, not emoji.
    expect(parseAgentMarkdown("🏢 **Business:** ZippyGo")).toEqual([
      {
        kind: "paragraph",
        spans: [
          { text: "Business:", bold: true },
          { text: " ZippyGo" },
        ],
      },
    ]);
  });

  it("does not treat a bare hash as a heading", () => {
    // No space after the hash — that is prose, or a hashtag.
    expect(parseAgentMarkdown("#hashtag")[0]).toMatchObject({ kind: "paragraph" });
  });

  it("flattens headings deeper than three", () => {
    const [block] = parseAgentMarkdown("##### Deep");
    expect(block).toEqual({ kind: "heading", level: 3, spans: [{ text: "Deep" }] });
  });

  it("groups consecutive bullets into one list", () => {
    const blocks = parseAgentMarkdown("- Online ordering\n- Table reservation\n- POS");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "list" });
    expect(blocks[0]).toHaveProperty("items.length", 3);
  });

  it("keeps line breaks inside a paragraph", () => {
    // Collapsing these to spaces is what ran the agent's sections together.
    const [block] = parseAgentMarkdown("first line\nsecond line");
    expect(block).toEqual({ kind: "paragraph", spans: [{ text: "first line\nsecond line" }] });
  });

  it("splits paragraphs on a blank line", () => {
    const blocks = parseAgentMarkdown("one\n\ntwo");
    expect(blocks).toHaveLength(2);
  });

  it("reads a whole turn in the agent's own shape", () => {
    const blocks = parseAgentMarkdown(
      [
        "## Section 1 — Business Profile",
        "",
        "**Business:** Chefgaa — a restaurant technology SaaS company.",
        "",
        "**What you offer:**",
        "- Online ordering systems",
        "- Table reservation platforms",
        "",
        "## Section 4 — Confirmation Request",
        "",
        "Does that look right?",
      ].join("\n"),
    );

    expect(blocks.map((b) => b.kind)).toEqual([
      "heading",
      "paragraph",
      "paragraph",
      "list",
      "heading",
      "paragraph",
    ]);
  });

  it("returns nothing for an empty turn rather than an empty block", () => {
    expect(parseAgentMarkdown("")).toEqual([]);
    expect(parseAgentMarkdown("\n\n  \n")).toEqual([]);
  });
});
