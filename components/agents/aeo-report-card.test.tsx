import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, vi } from "vitest";

// jsdom has no <dialog> behaviour; the "Approve all" confirmation needs just
// enough of one to open and close. The same stub confirm-submit.test uses.
beforeAll(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
import { AeoBlockedCard, AeoErrorCard, AeoReportCard } from "./aeo-report-card";
import { parseAeoJob } from "@/lib/data/aeo-audit";

/**
 * The finished report, rendered from a real payload.
 *
 * The values below were captured from an actual run against leadbyte.ai (job
 * `38790a5d0e43`, 2026-09-22) rather than invented, because the things most
 * worth pinning here are the ones a made-up fixture would get wrong: ten areas
 * instead of the nine the integration brief documents, fractional scores
 * beside whole ones, and areas that score full marks and send an empty
 * `improvement`.
 *
 * The Layer 2 and 3 values (`fixes`, `deployment`, `surfaces`) are from a
 * later run of the same site (job `65d5d6dc7d96`, 2026-09-23), trimmed to four
 * fixes that cover every shape the screen treats differently: a ready head
 * tag, held body copy, the site-wide sitemap, and a rewritten heading.
 */
const DONE = {
  id: "38790a5d0e43",
  state: "done",
  stage: "",
  error: "",
  vendor: "",
  url: "https://leadbyte.ai",
  result: {
    domain: "leadbyte.ai",
    url: "https://leadbyte.ai",
    brand: "LeadByte",
    platform: "Vite",
    score: 78,
    ceiling: 100,
    pages_audited: 19,
    pages_found: 19,
    blocked_pages: 0,
    discovery_source: "sitemap",
    gap_count: 7,
    areas: [
      { key: "ssr", label: "Server rendering", earned: 14.5, weight: 15, page_count: 19, worst_page: "/", reason: "Most of the homepage's core prose is present in the no-JS HTML.", evidence: "no_js_word_count: 576; rendered_word_count: 813", improvement: "Move the detailed service descriptions into the server-rendered HTML." },
      { key: "robots", label: "robots.txt", earned: 10, weight: 10, page_count: 0, worst_page: "", reason: "Named AI crawlers are explicitly allowed.", evidence: "User-agent: GPTBot\nAllow: /", improvement: "" },
      { key: "meta", label: "Meta tags", earned: 2, weight: 10, page_count: 19, worst_page: "/", reason: "The description, canonical, Open Graph tags and Twitter card are absent.", evidence: '"meta_description": null; "canonical": null', improvement: "Add a unique homepage meta description and self-referential canonical." },
      { key: "ai_visibility", label: "AI visibility", earned: 5, weight: 5, page_count: 0, worst_page: "", reason: "", evidence: "", improvement: "" },
    ],
    pages: [
      { url: "https://leadbyte.ai/", path: "/", score: 58 },
      { url: "https://leadbyte.ai/agents/custom-ai-workflows", path: "/agents/custom-ai-workflows", score: 65 },
      { url: "https://leadbyte.ai/pricing", path: "/pricing", score: 74 },
    ],
    gaps: [
      { key: "meta", title: "Meta tags", points: 8, effort: "low", severity: "medium", where: "19 pages", check_id: "meta_tags", evidence: "", pages: [], improvement: "Add a page-specific meta description and self-referential canonical.", ships_via: ["manual", "source_pr"] },
      { key: "freshness", title: "Freshness", points: 2.8, effort: "high", severity: "low", where: "17 pages", check_id: "freshness", evidence: "", pages: [], improvement: "", ships_via: [] },
    ],
    competitors: [{ name: "Iverton AI", url: "ivertonai.com", why: "An all-in-one AI marketing automation platform." }],
    fixes: [
      { id: "https://leadbyte.ai/:head:description", action: "Add a description summarising this page", rationale: "Description taken from the page's own opening sentence.", where: "/", kind: "head_meta", fix_type: "generate_meta_description", needs_approval: false, approved: false, preview: "automate optimize outgrow, AI-powered solutions that handle the busywork, so you can focus on what scales.", language: "text", ships_via: ["source_pr", "manual"] },
      { id: "https://leadbyte.ai/:body:answer", action: "Open the page with a short, direct answer to what it is", rationale: "Answer block summarising the page for answer engines.", where: "/", kind: "body", fix_type: "generate_answer_block", needs_approval: true, approved: false, preview: "LeadByte is an AI-powered marketing automation platform.", language: "text", ships_via: ["source_pr", "manual"] },
      { id: "leadbyte.ai:root:sitemap.xml", action: "Publish sitemap.xml listing 19 page(s)", rationale: "Generated sitemap.xml from the site's own inventory and metadata.", where: "whole site", kind: "root_file", fix_type: "generate_sitemap", needs_approval: false, approved: false, preview: '<?xml version="1.0" encoding="UTF-8"?>\n<urlset>…</urlset>', language: "xml", ships_via: ["source_pr", "edge", "manual"] },
      { id: "https://leadbyte.ai/agents/custom-ai-workflows:body:heading:6620816", action: "Rewrite a vague heading as the question it answers", rationale: "Heading rewritten as a question: 'Features'", where: "/agents/custom-ai-workflows", kind: "body", fix_type: "rewrite_heading", needs_approval: true, approved: false, preview: '{"from": "Features", "to": "What features are included?"}', language: "text", ships_via: ["manual"] },
    ],
    deployment: {
      surface: "manual",
      achievable: 96,
      ships: 70,
      held_back: 64,
      pull_request_url: "",
      files_changed: 0,
      can_push: false,
      head_location: "the page's HTML, immediately before the closing head tag",
      root_file_location: "the site root (or the build's public/ directory)",
      body_location: "the page's HTML, where the content belongs",
      platform_notes: ["Generated by a build step or a site builder, so edits belong in the source that produces the HTML — a change made to the output alone is lost on the next publish."],
    },
    surfaces: [
      { id: "source_pr", label: "GitHub pull request", available: true, note: "", achievable: 96, gain: 19, unreachable: 4, unreachable_areas: ["Freshness", "AI visibility", "Server rendering"] },
      { id: "plugin", label: "WordPress plugin", available: false, note: "this site is not WordPress", achievable: 0, gain: 0, unreachable: 0, unreachable_areas: [] },
      { id: "edge", label: "Cloudflare Worker", available: true, note: "", achievable: 85, gain: 8, unreachable: 15, unreachable_areas: ["Meta tags", "Content structure", "Freshness"] },
      { id: "manual", label: "Copy-paste pack", available: true, note: "", achievable: 96, gain: 19, unreachable: 4, unreachable_areas: ["Freshness", "AI visibility", "Server rendering"] },
    ],
    // The service's own counts, deliberately out of step with the four fixes
    // above: the screen counts the list it renders, not these.
    auto_count: 70,
    pending_count: 64,
  },
};

/** The same audit before Layer 2 ran: no fixes, no routes. */
const DONE_WITHOUT_FIXES = {
  ...DONE,
  result: { ...DONE.result, fixes: [], deployment: null, surfaces: [] },
};

describe("AeoReportCard", () => {
  it("leads with the score, out of the ceiling the service sent", () => {
    render(<AeoReportCard job={parseAeoJob(DONE)} />);
    expect(screen.getByText("AEO score")).toBeInTheDocument();
    expect(screen.getByText("78")).toBeInTheDocument();
    expect(screen.getAllByText("/100").length).toBeGreaterThan(0);
  });

  it("renders every area the payload carried, not a fixed nine", () => {
    render(<AeoReportCard job={parseAeoJob(DONE)} />);
    for (const label of ["Server rendering", "robots.txt", "Meta tags", "AI visibility"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // Fractional and whole scores side by side, each spelled once.
    expect(screen.getByText("14.5/15")).toBeInTheDocument();
    expect(screen.getByText("2/10")).toBeInTheDocument();
    expect(screen.getByText("10/10")).toBeInTheDocument();
  });

  it("says nothing about how to fix an area that scored full marks", () => {
    // robots.txt and AI visibility both send an empty `improvement`. A "How to
    // fix" heading over nothing is the failure this guards.
    render(<AeoReportCard job={parseAeoJob(DONE)} />);
    expect(screen.getAllByText(/How to fix\./)).toHaveLength(2);
  });

  it("ranks the gaps with what each is worth and what it costs", () => {
    render(<AeoReportCard job={parseAeoJob(DONE)} />);
    expect(screen.getByText("8 points · low effort · 19 pages")).toBeInTheDocument();
    expect(screen.getByText("2.8 points · high effort · 17 pages")).toBeInTheDocument();
  });

  it("does not say 19 of 19 pages", () => {
    // Two numbers that agree invite the reader to look for the missing ones.
    render(<AeoReportCard job={parseAeoJob(DONE)} />);
    expect(screen.getByText("19 pages audited")).toBeInTheDocument();
    expect(screen.queryByText(/19 of 19/)).toBeNull();
  });

  it("keeps competitors behind a disclosure, and never calls them a finding", () => {
    render(<AeoReportCard job={parseAeoJob(DONE)} />);
    const summary = screen.getByText("Who else answers these questions");
    expect(summary.closest("details")).not.toBeNull();
    expect(screen.getByText(/Nothing here is scored or ranked/)).toBeInTheDocument();
  });
});

describe("the fixes, and the routes to the site", () => {
  it("puts the score the fixes could reach beside the current one", () => {
    render(<AeoReportCard job={parseAeoJob(DONE)} />);
    expect(screen.getByText("With these fixes")).toBeInTheDocument();
    expect(screen.getAllByText("96").length).toBeGreaterThan(0);
  });

  it("counts the fixes it lists, not the service's own totals", () => {
    // auto_count says 70. Four fixes are listed, and the sentence has to
    // agree with the list beneath it.
    render(<AeoReportCard job={parseAeoJob(DONE)} />);
    expect(
      screen.getByText(
        "We wrote 4 fixes for this site. 2 are ready to use. 2 change what your pages say, so they need a person to approve them first.",
      ),
    ).toBeInTheDocument();
  });

  it("says in words that nothing has been changed on the site", () => {
    render(<AeoReportCard job={parseAeoJob(DONE)} />);
    expect(screen.getByText(/Nothing has been changed on your site yet/)).toBeInTheDocument();
    expect(screen.queryByText("View the pull request")).toBeNull();
  });

  it("offers no approve button when the page passes no approve action", () => {
    render(<AeoReportCard job={parseAeoJob(DONE)} />);
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
  });

  it("lists every route with what it could reach, and why one is unavailable", () => {
    render(<AeoReportCard job={parseAeoJob(DONE)} />);
    for (const label of ["GitHub pull request", "Cloudflare Worker", "Copy-paste pack", "WordPress plugin"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("Not available: this site is not WordPress")).toBeInTheDocument();
    expect(
      screen.getAllByText("+19 points · can't help with Freshness, AI visibility, Server rendering"),
    ).toHaveLength(2);
    // The service's pick, and only that one.
    expect(screen.getByText("Suggested").closest("li")).toHaveTextContent("Copy-paste pack");
  });

  it("opens the worst page onto its own fixes, each saying whether it is ready", () => {
    render(<AeoReportCard job={parseAeoJob(DONE)} />);
    expect(screen.getByText("Add a description summarising this page")).toBeInTheDocument();
    expect(
      screen.getByText("Open the page with a short, direct answer to what it is"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Needs approval").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Goes in the page's HTML, immediately before the closing head tag"),
    ).toBeInTheDocument();
  });

  it("shows a rewritten heading as before and after, not as JSON", async () => {
    const user = userEvent.setup();
    render(<AeoReportCard job={parseAeoJob(DONE)} />);
    await user.click(screen.getByRole("button", { name: /\/agents\/custom-ai-workflows/ }));
    expect(screen.getByText(/What features are included\?/)).toBeInTheDocument();
    expect(screen.queryByText(/"from"/)).toBeNull();
  });

  it("gives the site-wide sitemap a row of its own rather than dropping it", async () => {
    const user = userEvent.setup();
    render(<AeoReportCard job={parseAeoJob(DONE)} />);
    await user.click(screen.getByRole("button", { name: /Whole site/ }));
    expect(screen.getByText("Publish sitemap.xml listing 19 page(s)")).toBeInTheDocument();
  });

  it("says which gaps have no fix we could write", () => {
    // Freshness arrives with `ships_via: []`; Meta tags does not.
    render(<AeoReportCard job={parseAeoJob(DONE)} />);
    expect(screen.getAllByText(/We couldn't write a fix for this one/)).toHaveLength(1);
  });

  it("before any fixes exist, shows the plain report and nothing about them", () => {
    render(<AeoReportCard job={parseAeoJob(DONE_WITHOUT_FIXES)} />);
    expect(screen.getByText("Every page we audited")).toBeInTheDocument();
    expect(screen.queryByText("With these fixes")).toBeNull();
    expect(screen.queryByText("Putting the fixes on your site")).toBeNull();
    expect(screen.queryByText(/We couldn't write a fix/)).toBeNull();
  });
});

/**
 * zippygo.ai (job 56ae6f5d777b, 2026-09-24), trimmed: a JavaScript-only site.
 * Pages were found by rendering it, the AI visibility reason carries Markdown
 * links, every held fix ships by pull request alone, and the suggested route
 * (copy-paste, 73) reaches lower than the pull request (77).
 */
const SPA = {
  id: "56ae6f5d777b",
  state: "done",
  url: "zippygo.ai",
  result: {
    domain: "zippygo.ai",
    url: "https://zippygo.ai",
    platform: "React SPA",
    logo: null,
    score: 50,
    ceiling: 100,
    pages_audited: 10,
    pages_found: 10,
    discovery_source: "rendered-crawl",
    coverage_note: "No sitemap exists, and the raw HTML has no links to follow — the navigation is built by JavaScript.",
    gap_count: 8,
    areas: [
      { key: "ai_visibility", label: "AI visibility", earned: 0, weight: 5, reason: "Entity collision: ZippyGo Logistics, a Pune-based Indian third-party logistics company, shares the name. ([zippygo.co.in](https://zippygo.co.in/about-us?utm_source=openai)).", evidence: "", improvement: "Strengthen entity disambiguation.", worst_page: "", page_count: 0 },
    ],
    pages: [{ url: "https://zippygo.ai/", path: "/", score: 54 }],
    gaps: [],
    fixes: [
      { id: "https://zippygo.ai/:head:description", action: "Add a description summarising this page", rationale: "Description taken from the page's own opening sentence.", where: "/", kind: "head_meta", fix_type: "generate_meta_description", needs_approval: false, approved: false, preview: "Talk to ZippyGo like you would to a travel assistant.", language: "text", ships_via: ["source_pr", "manual"] },
      { id: "https://zippygo.ai/:body:faq-html", action: "Add a visible FAQ section, with matching structured data", rationale: "Visible FAQ with 6 pairs, drawn from the page's content.", where: "/", kind: "body", fix_type: "generate_faq", needs_approval: true, approved: false, preview: "<section class=\"faq\">…</section>", language: "html", ships_via: ["source_pr"] },
    ],
    deployment: {
      surface: "manual",
      achievable: 73,
      pull_request_url: "",
      files_changed: 0,
      head_location: "public/index.html, before the closing head tag",
      root_file_location: "public/",
      body_location: "",
      platform_notes: ["Site-wide artifacts only. Every route serves the same index.html, so per-page schema and meta cannot be delivered this way — they need server rendering or an edge rewrite."],
    },
    surfaces: [
      { id: "source_pr", label: "GitHub pull request", available: true, note: "", achievable: 77, gain: 27, unreachable_areas: ["Server rendering", "AI visibility", "Freshness"] },
      { id: "manual", label: "Copy-paste pack", available: true, note: "", achievable: 73, gain: 23, unreachable_areas: ["Server rendering", "AI visibility", "Content structure"] },
    ],
  },
};

describe("a JavaScript-only site", () => {
  it("says how the pages were found in words, not the service's code", () => {
    render(<AeoReportCard job={parseAeoJob(SPA)} />);
    expect(screen.getByText("Pages found by loading the site in a browser")).toBeInTheDocument();
    expect(screen.queryByText(/rendered-crawl/)).toBeNull();
  });

  it("shows no Markdown link syntax in the prose", () => {
    const { container } = render(<AeoReportCard job={parseAeoJob(SPA)} />);
    expect(container.textContent).not.toContain("](http");
    expect(screen.getByText(/shares the name\. \(zippygo\.co\.in\)\./)).toBeInTheDocument();
  });

  it("says a held fix can only go out by pull request", () => {
    render(<AeoReportCard job={parseAeoJob(SPA)} />);
    expect(screen.getAllByText("Only through a GitHub pull request")).toHaveLength(1);
  });

  it("names the route the headline figure is for", () => {
    render(<AeoReportCard job={parseAeoJob(SPA)} />);
    expect(screen.getByText("With these fixes").parentElement).toHaveTextContent("by Copy-paste pack");
  });
});

describe("while the fixes are still being written", () => {
  it("shows the report straight away and says only the fixes are still coming", () => {
    render(<AeoReportCard job={parseAeoJob({ ...DONE, state: "running" })} writing />);
    expect(screen.getByText("AEO score")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "The score is final. We're still writing the fixes",
    );
    expect(screen.getByText(/More are still being written\./)).toBeInTheDocument();
  });

  it("says the fixes are coming before the first one lands", () => {
    render(<AeoReportCard job={parseAeoJob({ ...DONE_WITHOUT_FIXES, state: "running" })} writing />);
    expect(screen.getByText("We're still writing the fixes for this site.")).toBeInTheDocument();
  });

  it("offers no approval while fixes are still arriving", () => {
    render(<AeoReportCard job={parseAeoJob({ ...DONE, state: "running" })} writing approve={vi.fn()} />);
    expect(screen.queryByText("Waiting for your approval")).toBeNull();
  });
});

describe("approving held fixes", () => {
  const WITH_ROUTES = {
    ...DONE,
    result: { ...DONE.result, pending_ships_via: ["manual", "source_pr"] },
  };

  it("lists every held fix with a checkbox, and none of the ready ones", () => {
    render(<AeoReportCard job={parseAeoJob(WITH_ROUTES)} approve={vi.fn()} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.map((b) => (b as HTMLInputElement).value)).toEqual([
      "https://leadbyte.ai/:body:answer",
      "https://leadbyte.ai/agents/custom-ai-workflows:body:heading:6620816",
    ]);
    // Unticked by default: approving copy is a choice, not a default.
    expect(boxes.every((b) => !(b as HTMLInputElement).checked)).toBe(true);
  });

  it("says what approving does, and that it does not change the site", () => {
    render(<AeoReportCard job={parseAeoJob(WITH_ROUTES)} approve={vi.fn()} />);
    expect(
      screen.getByText(/Once approved, they can go out through a Copy-paste pack or GitHub pull request\./),
    ).toBeInTheDocument();
  });

  it("sends the ticked ids and the job to the action", async () => {
    const user = userEvent.setup();
    const approve = vi.fn(async (_: FormData) => {});
    render(<AeoReportCard job={parseAeoJob(WITH_ROUTES)} approve={approve} />);
    await user.click(screen.getByRole("checkbox", { name: /Rewrite a vague heading/ }));
    await user.click(screen.getByRole("button", { name: "Approve ticked fixes" }));
    await vi.waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
    const sent = approve.mock.calls[0]![0];
    expect(sent.get("jobId")).toBe("38790a5d0e43");
    expect(sent.getAll("artifact")).toEqual([
      "https://leadbyte.ai/agents/custom-ai-workflows:body:heading:6620816",
    ]);
  });

  it("asks before approving everything, and posts no ids for it", async () => {
    const user = userEvent.setup();
    const approve = vi.fn(async (_: FormData) => {});
    render(<AeoReportCard job={parseAeoJob(WITH_ROUTES)} approve={approve} />);
    await user.click(screen.getByRole("button", { name: "Approve all 2" }));
    // Nothing is sent on the first click — it only opens the question.
    expect(approve).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Approving does not change your site by itself.");
    await user.click(within(dialog).getByRole("button", { name: "Approve all 2" }));
    await vi.waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
    const sent = approve.mock.calls[0]![0];
    expect(sent.get("scope")).toBe("all");
    expect(sent.getAll("artifact")).toEqual([]);
  });

  it("disappears once nothing is held", () => {
    const allDone = {
      ...DONE,
      result: {
        ...DONE.result,
        fixes: DONE.result.fixes.map((f) => ({ ...f, approved: true })),
      },
    };
    render(<AeoReportCard job={parseAeoJob(allDone)} approve={vi.fn()} />);
    expect(screen.queryByText("Waiting for your approval")).toBeNull();
    expect(screen.queryAllByText("Needs approval")).toHaveLength(0);
  });
});

describe("the two endings that are not a low score", () => {
  it("names the wall, records no score, and offers no retry", () => {
    // Polling again cannot change a bot wall — it is a property of the site.
    const job = parseAeoJob({
      id: "a",
      state: "blocked",
      vendor: "AWS_WAF",
      url: "https://walled.test",
      error: "a bot wall answered instead of the page — no score was recorded",
      result: null,
    });
    const { container } = render(<AeoBlockedCard job={job} />);
    expect(screen.getByText(/AWS_WAF/)).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
    expect(within(container).queryByRole("button")).toBeNull();
  });

  it("states an error plainly and offers the one thing that might help", () => {
    const job = parseAeoJob({
      id: "a",
      state: "error",
      url: "https://gone.test",
      error: "SiteUnreachableError: name not resolved",
      result: null,
    });
    render(<AeoErrorCard job={job} retry={<button type="button">Try again</button>} />);
    expect(screen.getByText(/SiteUnreachableError/)).toBeInTheDocument();
    expect(screen.getByText(/No score was recorded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
