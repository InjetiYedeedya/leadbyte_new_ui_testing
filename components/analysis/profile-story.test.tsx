import { render, screen, within } from "@testing-library/react";
import { ProfileStory } from "./profile-story";
import { buildStoryChapters } from "@/lib/data/profile-story";
import type { BusinessProfile } from "@/lib/data/types";

/**
 * The Business profile document.
 *
 * jsdom has no layout and no `IntersectionObserver` behaviour, so the rail's
 * active state cannot be asserted here. What IS asserted is everything the
 * presentation must never break: that all six sections are present, that a
 * section with no data says so rather than inventing something, that the edit
 * flow still points at the right form, and that the page carries no progress
 * score of any kind.
 */
const bare: BusinessProfile = {
  businessId: "acct", businessName: "", businessType: "", industry: "",
  websiteUrl: "", description: "", websiteAuditScore: 0, geoVisibilityScore: 0,
};

const full: BusinessProfile = {
  ...bare,
  businessName: "LeadByte",
  businessType: "SaaS & Software",
  industry: "AI automation digital marketing service",
  websiteUrl: "leadbyte.ai",
  description: "Automate. Optimize. Outgrow.",
  brand: {
    competitors: [{ name: "HubSpot" }],
    emails: ["apps@ntimes.ai"],
    socialLinks: [{ platform: "linkedin", url: "https://linkedin.test/leadbyte" }],
    keywords: ["automation"],
    images: [],
    location: { addresses: ["50 Cragwood Rd, South Plainfield, NJ"] },
    brandValues: ["Growth"],
    colors: [{ label: "Primary", hex: "#12126E" }],
  },
};

const noop = () => {};

function story(
  profile: BusinessProfile,
  { editBase, analysedAt }: { editBase?: string; analysedAt?: string } = {},
) {
  return render(
    <ProfileStory
      profile={profile}
      chapters={buildStoryChapters(profile)}
      editBase={editBase}
      analysedAt={analysedAt}
      onRemoveImage={noop}
      completionAction={<a href="/overview/website-audit">Next Website audit</a>}
    />,
  );
}

const sectionFor = (heading: string) =>
  screen.getByRole("heading", { name: heading }).closest("section")!;

describe("ProfileStory", () => {
  it("shows all six sections", () => {
    story(full);
    for (const heading of [
      "Core business details",
      "How your brand presents itself",
      "Who you are competing with",
      "How people can reach you",
      "What your site is about",
      "Images on your site",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
  });

  it("renders the real extracted values, not placeholders", () => {
    story(full);
    // Scoped: the brand section's preview panel names the business too, which
    // is the point of a brand preview.
    const business = sectionFor("Core business details");
    expect(within(business).getByText("LeadByte")).toBeInTheDocument();
    // ONCE. The reference design also tagged it under the business name, and
    // a value printed twice in one row is read as two different facts.
    expect(within(business).getAllByText("SaaS & Software")).toHaveLength(1);
    expect(screen.getByText("HubSpot")).toBeInTheDocument();
    expect(screen.getByText("apps@ntimes.ai")).toBeInTheDocument();
    expect(screen.getByText(/50 Cragwood Rd/)).toBeInTheDocument();
  });

  it("says what was not found instead of inventing it", () => {
    story(full);
    expect(screen.getByText("No website images detected.")).toBeInTheDocument();
  });

  it("gives an account with nothing extracted a page of honest empties", () => {
    story(bare);
    expect(screen.getByText("No competitors identified yet.")).toBeInTheDocument();
    expect(
      screen.getByText("No contact details or address were published on the site."),
    ).toBeInTheDocument();
    expect(screen.getByText("Visual identity hasn't been extracted yet.")).toBeInTheDocument();
  });

  it("keeps each section's Edit pointed at its own form", () => {
    story(full, { editBase: "/overview/business-profile" });
    const targets = screen
      .getAllByRole("link", { name: "Edit" })
      .map((l) => l.getAttribute("href"));
    expect(targets).toContain("/overview/business-profile?edit=business");
    expect(targets).toContain("/overview/business-profile?edit=brand");
    expect(targets).toContain("/overview/business-profile?edit=competitors");
    expect(targets).toContain("/overview/business-profile?edit=contact");
  });

  it("offers no Edit at all while the form is already open", () => {
    story(full);
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
  });

  it("links a social profile to the url the crawl found, never a guessed one", () => {
    story(full);
    const link = screen.getByRole("link", { name: /LinkedIn/ });
    expect(link).toHaveAttribute("href", "https://linkedin.test/leadbyte");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("gives the rail one navigable entry per section and nothing else", () => {
    story(full);
    const rail = screen.getByRole("navigation", { name: "Profile sections" });
    const links = within(rail).getAllByRole("link");
    expect(links).toHaveLength(6);
    expect(links[0]).toHaveAttribute("href", "#chapter-business");
  });

  it("carries no review score anywhere on the page", () => {
    // The rail is a table of contents, not a scoreboard. A count here was
    // removed on 2026-09-22 along with the per-section review control it fed.
    story(full);
    expect(screen.queryByText(/\d\s*(of|\/)\s*6/)).toBeNull();
    expect(screen.queryByText(/reviewed/i)).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("button", { name: /looks right/i })).toBeNull();
  });

  it("states the source once per section, with no confidence attached", () => {
    story(full);
    // One compact line per section, not a three-block column repeated six
    // times, and never a confidence, which the analysis does not report.
    expect(screen.getAllByText(/^Source: Website crawl/)).toHaveLength(6);
    expect(screen.queryByText(/confidence/i)).toBeNull();
    expect(screen.queryByText(/Source: Website crawl ·/)).not.toBeInTheDocument();
  });

  it("shows the analysis date only when the payload carried one", () => {
    // Its own item in the footer rather than glued to the source with a
    // separator: two facts about the same reading, and only one of them can
    // be missing.
    const { unmount } = story(full);
    expect(screen.queryByText(/^Updated /)).toBeNull();
    unmount();

    story(full, { analysedAt: "18 Sep 2026" });
    expect(screen.getAllByText("Updated 18 Sep 2026")).toHaveLength(6);
  });

  it("keeps 'why this matters' behind a disclosure rather than in every section", () => {
    story(full);
    const explainers = screen.getAllByText("Why this matters");
    expect(explainers).toHaveLength(6);
    for (const explainer of explainers) expect(explainer.closest("details")).not.toBeNull();
  });

  it("ends with a continuation that carries no count", () => {
    story(full);
    expect(screen.getByRole("heading", { name: "Profile ready" })).toBeInTheDocument();
    expect(
      screen.getByText("Your business information is ready for the next step."),
    ).toBeInTheDocument();
  });

  it("shows the address inside the contact section, not a section of its own", () => {
    story(full);
    const contact = sectionFor("How people can reach you");
    expect(within(contact).getByText(/50 Cragwood Rd/)).toBeInTheDocument();
    expect(within(contact).getByText("apps@ntimes.ai")).toBeInTheDocument();
  });

  it("offers a Remove on every image, and invents no verdict about any of them", () => {
    // The pipeline copies extracted images into our own S3 bucket, so their
    // host says nothing about whose image it is. A "possible mismatch" flag
    // built on that fired on every image including the customer's own logo.
    const withImages: BusinessProfile = {
      ...full,
      brand: {
        ...full.brand,
        images: [
          "https://email-templates-1.s3.amazonaws.com/leadbyte-logo.png",
          "https://email-templates-1.s3.amazonaws.com/chefgaa-logo.png",
        ],
      },
    };
    story(withImages);
    const images = sectionFor("Images on your site");
    expect(within(images).getAllByRole("button", { name: "Remove" })).toHaveLength(2);
    expect(within(images).queryByText(/mismatch|Hosted on|another domain/i)).toBeNull();
  });

  it("clamps a long crawled description behind a disclosure", () => {
    const wordy: BusinessProfile = {
      ...full,
      description: "LeadByte automates marketing. ".repeat(20),
    };
    story(wordy);
    expect(screen.getByText("View full description")).toBeInTheDocument();
    // ONE copy of the text in the DOM: a second, hidden full copy would be
    // read twice by a screen reader and printed twice into the PDF.
    expect(screen.getAllByText(/LeadByte automates marketing\./)).toHaveLength(1);
  });

  it("leaves a short description alone", () => {
    story(full);
    expect(screen.getByText("Automate. Optimize. Outgrow.")).toBeInTheDocument();
    expect(screen.queryByText("View full description")).toBeNull();
  });
});
