import { buildStoryChapters } from "@/lib/data/profile-story";
import type { BusinessProfile } from "@/lib/data/types";

const bare: BusinessProfile = {
  businessId: "acct",
  businessName: "",
  businessType: "",
  industry: "",
  websiteUrl: "",
  description: "",
  websiteAuditScore: 0,
  geoVisibilityScore: 0,
};

const byId = (profile: BusinessProfile) =>
  Object.fromEntries(buildStoryChapters(profile).map((c) => [c.id, c]));

describe("buildStoryChapters", () => {
  it("always tells the same six-chapter story, in order", () => {
    // The rail promises six and the reader counts them. A chapter that
    // disappears on one account and returns on another makes the analysis
    // look inconsistent rather than thorough.
    //
    // It was seven until location was folded into contact: on most accounts
    // location held one line, and a pinned viewport for a single address is
    // the emptiest scene in the story.
    expect(buildStoryChapters(bare).map((c) => c.id)).toEqual([
      "business",
      "brand",
      "competitors",
      "contact",
      "website",
      "images",
    ]);
    // The numbers are contiguous and start at 01. A gap here means a chapter
    // was removed without renumbering, and the rail would show 01-03, 05-07.
    expect(buildStoryChapters(bare).map((c) => c.number)).toEqual([
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
    ]);
  });

  it("gives the rail a caption that never depends on what was found", () => {
    // The rail says what is IN the document. A caption that changed with the
    // data would turn a contents list back into the scoreboard that was
    // removed from it — and it has to read the same on an account whose crawl
    // returned nothing at all.
    const empty = buildStoryChapters(bare).map((c) => c.caption);
    const filled = buildStoryChapters({
      ...bare,
      businessName: "Acme",
      brand: { competitors: [{ name: "Rival" }], keywords: ["widgets"] },
    }).map((c) => c.caption);
    expect(empty).toEqual(filled);
    for (const caption of empty) expect(caption).not.toMatch(/\d/);
  });

  it("marks every chapter empty for an account with nothing extracted", () => {
    for (const chapter of buildStoryChapters(bare)) {
      expect(chapter.empty).not.toBeNull();
    }
  });

  it("says what was NOT found rather than inventing what was", () => {
    const chapters = byId(bare);
    expect(chapters.competitors?.empty).toBe("No competitors identified yet.");
    expect(chapters.contact?.empty).toBe(
      "No contact details or address were published on the site.",
    );
    expect(chapters.images?.empty).toBe("No website images detected.");
    expect(chapters.brand?.empty).toBe("Visual identity hasn't been extracted yet.");
  });

  it("clears the empty state the moment real data exists", () => {
    const chapters = byId({
      ...bare,
      businessName: "Acme",
      brand: {
        competitors: [{ name: "Rival" }],
        keywords: ["automation"],
        images: ["https://x.test/a.jpg"],
        emails: ["hi@acme.test"],
        colors: [{ label: "Primary", hex: "#12126E" }],
        location: { addresses: ["1 Test Street"] },
      },
    });

    expect(chapters.business?.empty).toBeNull();
    expect(chapters.brand?.empty).toBeNull();
    expect(chapters.competitors?.empty).toBeNull();
    expect(chapters.contact?.empty).toBeNull();
    expect(chapters.website?.empty).toBeNull();
    expect(chapters.images?.empty).toBeNull();
  });

  it("treats an empty string as nothing, not as a value", () => {
    // Rule 5 in CLAUDE.md: `mapProfile` coerces a missing field to "", so a
    // profile row that exists but was never filled in still has every key.
    expect(byId({ ...bare, businessName: "   " }).business?.empty).not.toBeNull();
    expect(byId({ ...bare, businessName: "Acme" }).business?.empty).toBeNull();
  });

  it("treats an empty LIST as nothing too", () => {
    const chapters = byId({
      ...bare,
      brand: { competitors: [], keywords: [], images: [], emails: [], phones: [] },
    });
    expect(chapters.competitors?.empty).not.toBeNull();
    expect(chapters.website?.empty).not.toBeNull();
    expect(chapters.images?.empty).not.toBeNull();
    expect(chapters.contact?.empty).not.toBeNull();
  });

  it("does not call the competitor list a ranking", () => {
    expect(byId(bare).competitors?.subtitle).toContain("Not a ranking");
  });

  it("points each editable chapter at a form that exists", () => {
    // A chapter whose Edit button opens the wrong section is worse than one
    // with no Edit button, so the mapping is asserted rather than assumed.
    const chapters = byId(bare);
    expect(chapters.business?.section).toBe("business");
    expect(chapters.brand?.section).toBe("brand");
    expect(chapters.competitors?.section).toBe("competitors");
    expect(chapters.contact?.section).toBe("contact");
    expect(chapters.website?.section).toBe("keywords");
    expect(chapters.images?.section).toBe("images");
  });
  it("counts what was found rather than grading it", () => {
    // Every secondary line on the scene is arithmetic on the payload. The
    // analysis reports no score and no confidence, so a rail note or a
    // "what we found" line implying one would be invented outright.
    const chapters = byId({
      ...bare,
      brand: {
        competitors: [{ name: "Rival" }, { name: "Other" }],
        keywords: ["a", "b", "c"],
        images: ["https://x.test/a.jpg"],
      },
    });

    expect(chapters.competitors?.railNote).toBe("2 found");
    expect(chapters.competitors?.found).toContain("2 businesses");
    expect(chapters.website?.railNote).toBe("3 terms");
    // Singular, so no line ever reads "1 images".
    expect(chapters.images?.railNote).toBe("1 image");
    expect(chapters.images?.found).toContain("1 image ");
  });

  it("never claims a finding for a chapter that has none", () => {
    for (const chapter of buildStoryChapters(bare)) {
      expect(chapter.found).toBeNull();
      // The rail still says something — silence reads as "still loading" —
      // but it says the absence, never a number.
      expect(chapter.railNote).not.toMatch(/\d/);
    }
  });

  it("names the fields it actually read, not a total", () => {
    const chapters = byId({ ...bare, businessName: "Acme", industry: "Widgets" });
    expect(chapters.business?.found).toBe("Your site gave us a name and an industry.");
  });

  it("keeps 'why this matters' about the field, never about the account", () => {
    // These lines are shown beside real customer data, so they must be true
    // of ANY account. A sentence that reads as a verdict on this business
    // would be a measurement we have not made.
    const chapters = buildStoryChapters(bare);
    for (const chapter of chapters) {
      expect(chapter.matters).not.toBeNull();
      expect(chapter.matters).not.toMatch(/\b(score|weak|strong|poor|excellent|%)\b/i);
    }
  });

  it("gives each chapter its own dwell, as a CSS length", () => {
    // The dwell is the scroll distance the NEXT card travels through, so this
    // is what makes the card-by-card stack a transition rather than a jump.
    // One dwell for all of them makes a short chapter a hole in the page and
    // a long one feel hurried.
    //
    // The unit matters as much as the variety: these used to be Tailwind
    // classes (`pb-[40vh]`), and a class this module invents is only as real
    // as the scanner that finds it. A length goes through `style` and cannot
    // be purged, so it is asserted to stay one.
    const dwells = buildStoryChapters(bare).map((c) => c.dwell);
    expect(new Set(dwells).size).toBeGreaterThan(1);
    for (const dwell of dwells) expect(dwell).toMatch(/^[\d.]+(vh|rem|px)$/);
  });

  it("counts an address as a way of reaching the business", () => {
    // Location merged into contact, so a site that publishes ONLY an address
    // still has a contact chapter with something in it. Before the merge
    // that account got "no contact details" beside a visible address.
    const chapters = byId({ ...bare, brand: { location: { addresses: ["1 Test Street"] } } });
    expect(chapters.contact?.empty).toBeNull();
    expect(chapters.contact?.railNote).toBe("1 channel");
    expect(chapters.contact?.found).toContain("1 address");
  });
});
