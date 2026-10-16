import { render, screen } from "@testing-library/react";
import { BrandSheet } from "./brand-sheet";
import { altTextFor } from "@/lib/data/profile-display";
import type { BusinessProfile } from "@/lib/data/types";

describe("altTextFor", () => {
  it("reads a descriptive filename as a real hint", () => {
    expect(altTextFor("https://cdn.example.com/img/team-photo.jpg", 0, "ZippyGo")).toBe(
      "team photo, from ZippyGo",
    );
  });

  it("falls back to a generic description for a hash-like filename", () => {
    expect(altTextFor("https://cdn.example.com/img/8f3a9c2b1e.jpg", 2, "ZippyGo")).toBe(
      "Image 3 from ZippyGo",
    );
  });

  it("falls back to a generic description for an unparseable src", () => {
    expect(altTextFor("not a url", 1, "ZippyGo")).toBe("Image 2 from ZippyGo");
  });
});

/**
 * The shapes OTHER accounts actually have.
 *
 * This screen was built and checked against one workspace whose profile
 * happened to fill every card, and its two columns were assigned by hand from
 * that account's heights. On an account with a different mix — which is most of
 * them — everything landed in one column and the other sat empty. These tests
 * are the accounts I cannot sign in as.
 */

const base: BusinessProfile = {
  businessId: "acct",
  businessName: "Acme",
  businessType: "B2B SaaS",
  industry: "Marketing",
  websiteUrl: "acme.test",
  description: "Acme does a thing that is described in rather more than twenty characters.",
  websiteAuditScore: 0,
  geoVisibilityScore: 0,
};

/** The board the cards flow through, and the cards themselves. */
function board(container: HTMLElement): HTMLElement {
  return container.querySelector(":scope > div") as HTMLElement;
}

function cards(container: HTMLElement): HTMLElement[] {
  return Array.from(board(container).children) as HTMLElement[];
}

describe("BrandSheet across account shapes", () => {
  it("renders a profile with nothing extracted at all", () => {
    // A brand-new account: a row exists, the crawl has found nothing yet.
    const { container } = render(<BrandSheet profile={base} />);
    expect(screen.getByText("Business information")).toBeTruthy();
    expect(cards(container)).toHaveLength(1);
  });

  it("lets the browser balance the columns on real heights", () => {
    // The layout used to deal cards into two hand-built columns using a
    // per-card height ESTIMATE, and an estimate that came in short left a
    // screen-and-a-half of white space under one column while the other ran
    // on. CSS multi-column measures at layout time instead, so there is one
    // flow and nothing here to drift.
    const { container } = render(<BrandSheet profile={base} />);
    const className = board(container).className;
    expect(className).toContain("sm:columns-2");
    // One column on a phone, where two would leave each card unreadable.
    expect(className).toContain("columns-1");
    // Without this a column boundary falls through the middle of a card and
    // splits it across both sides — worse than the gap it replaces.
    expect(className).toContain("break-inside-avoid");
  });

  it("never renders an empty column, whatever the account holds", () => {
    // The original failure in miniature: one card assigned by hand to the
    // right meant column one rendered empty and the page looked broken. A
    // single flow cannot express that state at all.
    const { container } = render(<BrandSheet profile={base} />);
    expect(cards(container)).toHaveLength(1);
    expect(cards(container)[0]!.textContent).toContain("Business information");
  });

  it("puts the business facts before the brand read, with no forced shared height", () => {
    // These two used to be pulled out of the board into their own forced
    // two-column row, so they would always sit side by side. Two versions of
    // that were tried — stretching the shorter card to match (dead space
    // INSIDE it) and `items-start` (the same dead space moved to BETWEEN it
    // and the next card) — and both left visible dead space because a CSS
    // grid row is always exactly as tall as its tallest cell regardless of
    // how the shorter cell aligns within it. Flowing both through the same
    // balanced board as every other card is what actually removes the dead
    // space: a short card is simply followed by the next card in its own
    // column, not a row shared with a taller neighbour.
    const profile: BusinessProfile = {
      ...base,
      brand: { toneOfVoice: "Direct.", brandValues: ["Clear"], keywords: ["alpha"] },
    };
    const { container } = render(<BrandSheet profile={profile} />);

    const all = cards(container);
    const businessIndex = all.findIndex((c) => c.textContent?.includes("Business information"));
    const brandIndex = all.findIndex((c) => c.textContent?.includes("Brand intelligence"));
    expect(businessIndex).toBeGreaterThanOrEqual(0);
    expect(brandIndex).toBeGreaterThan(businessIndex);
    // Neither card is wrapped in a height-matching row any more.
    for (const card of all) {
      expect(card.className).not.toContain("h-full");
    }
  });

  it("puts the business's own facts first, not the card with the most rows", () => {
    // 40 competitors against a three-line business card. Ranked by size, the
    // rival list opened a screen titled "Here's what we learned about your
    // business" and the business's own name sat below it.
    const heavy: BusinessProfile = {
      ...base,
      brand: {
        competitors: Array.from({ length: 40 }, (_, i) => ({ name: `Rival ${i}` })),
        keywords: ["alpha", "beta"],
        emails: ["a@b.test"],
      },
    };
    const { container } = render(<BrandSheet profile={heavy} />);
    const rendered = cards(container);
    expect(rendered[0]!.textContent).toContain("Business information");
    expect(rendered.length).toBeGreaterThan(1);
  });

  it("survives a brand object whose every field is empty", () => {
    // `mapBrandProfile` strips empties, but a half-written row can still
    // arrive with empty arrays — those must not render headless cards.
    const empty: BusinessProfile = {
      ...base,
      brand: { competitors: [], keywords: [], images: [], emails: [], phones: [] },
    };
    render(<BrandSheet profile={empty} />);
    expect(screen.queryByText("Who you are competing with")).toBeNull();
    expect(screen.queryByText("What your site is about")).toBeNull();
    expect(screen.queryByText("Images on your site")).toBeNull();
  });

  it("renders exactly the competitors it is handed, one row each", () => {
    // The nameless-row guard lives in `mapBrandProfile`, not here — this
    // component renders what it is given, and `website-analysis.test.ts`
    // covers the dropping. Asserting it in both places would have moved the
    // rule to the wrong layer.
    const profile: BusinessProfile = {
      ...base,
      brand: {
        competitors: [
          { name: "Linked", url: "https://rival.test", reason: "Sells the same thing." },
          { name: "Unlinked" },
        ],
      },
    };
    const { container } = render(<BrandSheet profile={profile} />);
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByText("Linked")).toBeTruthy();
    expect(screen.getByText("Unlinked")).toBeTruthy();
  });

  it("keeps a competitor's reasoning closed until the name is clicked", () => {
    // Five competitors each carrying a sentence made this the tallest card on
    // the page, so the answer to "who am I up against" could not be read
    // without scrolling past the reasoning for every one of them.
    const profile: BusinessProfile = {
      ...base,
      brand: {
        competitors: [{ name: "Rival", url: "https://rival.test", reason: "Sells the same thing." }],
      },
    };
    const { container } = render(<BrandSheet profile={profile} />);

    const row = container.querySelector("li details");
    expect(row).toBeTruthy();
    // `<details>` keeps its content in the DOM, so "closed" is the attribute
    // rather than an absence — and it is what a reader and a printer both go
    // by. Open by default would be the old card with extra clicks.
    expect(row!.hasAttribute("open")).toBe(false);
    expect(screen.getByText("Sells the same thing.")).toBeTruthy();
  });

  it("puts the rival's site behind its own link, not the name", () => {
    // The name used to BE the link, so reading about a competitor and leaving
    // for their homepage were the same click. A competitor's site is somebody
    // else's, so it stays a raw anchor.
    const profile: BusinessProfile = {
      ...base,
      brand: { competitors: [{ name: "Rival", url: "https://rival.test" }] },
    };
    render(<BrandSheet profile={profile} />);

    expect(screen.queryByRole("link", { name: "Rival" })).toBeNull();
    const link = screen.getByRole("link", { name: "Visit site" });
    expect(link.getAttribute("href")).toBe("https://rival.test");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("does not make a name with nothing behind it look clickable", () => {
    // A competitor the analysis named but gave neither a reason nor a url has
    // nothing to open. A row that invites a click and then does nothing is
    // worse than a plain line.
    const profile: BusinessProfile = {
      ...base,
      brand: { competitors: [{ name: "Bare" }] },
    };
    const { container } = render(<BrandSheet profile={profile} />);
    expect(container.querySelector("li details")).toBeNull();
    expect(screen.getByText("Bare")).toBeTruthy();
  });

  it("offers Edit on every card it renders, and none when editing is off", () => {
    const profile: BusinessProfile = {
      ...base,
      brand: { keywords: ["alpha"], emails: ["a@b.test"] },
    };

    const { unmount } = render(
      <BrandSheet profile={profile} editBase="/overview/business-profile" />,
    );
    // One per rendered card — business information, keywords, contact.
    expect(screen.getAllByRole("link", { name: "Edit" }).length).toBe(3);
    unmount();

    render(<BrandSheet profile={profile} />);
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
  });
});

describe("card headers line up whether or not a card has a hint", () => {
  /**
   * The regression this guards, reported from a real screenshot on
   * 2026-09-21: "Business information" carries no hint and "Who you are
   * competing with" does, so their headers were different heights and the
   * two cards beside each other started their content 13px apart. Both
   * cards, both borders and both insets matched; only the header did not.
   */
  const withCompetitors = {
    ...base,
    brand: { competitors: [{ name: "Rival" }] },
  };

  it("reserves the hint's line on a card that has no hint", () => {
    render(<BrandSheet profile={withCompetitors} />);

    const withoutHint = screen.getByRole("heading", { name: "Business information" });
    const withHint = screen.getByRole("heading", { name: "Who you are competing with" });

    // The heading sits inside the header's text block; that block is what
    // holds the reserved height.
    const blockOf = (heading: HTMLElement) => heading.parentElement?.parentElement;

    expect(blockOf(withoutHint)?.className).toContain("min-h-[3.125rem]");
    expect(blockOf(withHint)?.className).toContain("min-h-[3.125rem]");
  });

  it("gives every header a bottom border, visible or not", () => {
    // Measured in a browser, because jsdom has no layout and this one is a
    // single pixel: a rule on `flush` headers alone made them 1px taller
    // than padded ones. Always present, `border-transparent` when it should
    // not be seen.
    render(<BrandSheet profile={withCompetitors} />);

    // The two this fixture renders: one flush card with a hint, one without.
    for (const name of ["Business information", "Who you are competing with"]) {
      const header = screen
        .getByRole("heading", { name })
        .closest("div")!.parentElement!.parentElement!;
      expect(header.className).toContain("border-b");
    }
  });

  it("still renders the hint where there is one", () => {
    render(<BrandSheet profile={withCompetitors} />);

    expect(
      screen.getByText(/Found by the analysis from your market/),
    ).toBeInTheDocument();
  });
});
