import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageSections, toneOf, type PickerPage } from "./page-sections";

/**
 * Exit animations keep a node mounted while they play, so anything asserting
 * that something has GONE waits for it. A synchronous `queryBy…` here fails
 * against a component that is behaving correctly.
 *
 * The behaviour worth protecting is the reason this shape replaced a dropdown:
 * every page is visible without opening anything, and reading one costs a
 * single click.
 */

const PAGES: PickerPage[] = [
  { key: "https://site.test/", label: "/", hint: "no issues", content: <p>Home report</p> },
  {
    key: "https://site.test/pricing",
    label: "/pricing",
    hint: "6 issues",
    content: <p>Pricing report</p>,
  },
  {
    key: "https://site.test/about",
    label: "/about",
    hint: "2 issues",
    content: <p>About report</p>,
  },
];

function manyPages(count: number): PickerPage[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `https://site.test/p${i}`,
    label: `/page-${i}`,
    hint: `${i}/100 extractable`,
    content: <p>{`Report ${i}`}</p>,
  }));
}

describe("PageSections", () => {
  it("lists every page without anything being opened", () => {
    render(<PageSections pages={PAGES} />);
    // The whole inventory is on the page — that is the point of the shape.
    expect(screen.getByText("/")).toBeInTheDocument();
    expect(screen.getByText("/pricing")).toBeInTheDocument();
    expect(screen.getByText("/about")).toBeInTheDocument();
    expect(screen.getByText("3 pages analysed")).toBeInTheDocument();
  });

  it("shows the first page's section, so the list is not a wall of closed rows", () => {
    render(<PageSections pages={PAGES} />);
    expect(screen.getByText("Home report")).toBeInTheDocument();
    expect(screen.queryByText("Pricing report")).not.toBeInTheDocument();
  });

  it("opens a page in one click", async () => {
    render(<PageSections pages={PAGES} />);
    await userEvent.click(screen.getByRole("button", { name: /\/pricing/ }));
    expect(await screen.findByText("Pricing report")).toBeInTheDocument();
  });

  it("leaves other pages open — reading two at once is a real thing to want", async () => {
    render(<PageSections pages={PAGES} />);
    await userEvent.click(screen.getByRole("button", { name: /\/pricing/ }));

    expect(await screen.findByText("Pricing report")).toBeInTheDocument();
    expect(screen.getByText("Home report")).toBeInTheDocument();
  });

  it("closes again on a second click", async () => {
    render(<PageSections pages={PAGES} />);
    const row = screen.getByRole("button", { name: /\/pricing/ });

    await userEvent.click(row);
    expect(await screen.findByText("Pricing report")).toBeInTheDocument();

    await userEvent.click(row);
    await waitFor(() => expect(screen.queryByText("Pricing report")).not.toBeInTheDocument());
  });

  it("tells a screen reader which rows are open", async () => {
    render(<PageSections pages={PAGES} />);
    const pricing = screen.getByRole("button", { name: /\/pricing/ });

    expect(pricing).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(pricing);
    expect(pricing).toHaveAttribute("aria-expanded", "true");

    // …and the panel it controls is a labelled region, not an anonymous div.
    const region = screen.getByRole("region", { name: /\/pricing/ });
    expect(within(region).getByText("Pricing report")).toBeInTheDocument();
  });

  it("expands and collapses the whole report from one control", async () => {
    render(<PageSections pages={PAGES} />);

    await userEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(await screen.findByText("Pricing report")).toBeInTheDocument();
    expect(screen.getByText("About report")).toBeInTheDocument();

    // The control now offers the opposite, rather than lying about what it does.
    await userEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    await waitFor(() => expect(screen.queryByText("Home report")).not.toBeInTheDocument());
  });

  it("offers a filter only when the list is long enough to need one", async () => {
    const { unmount } = render(<PageSections pages={PAGES} />);
    expect(screen.queryByLabelText("Filter pages")).not.toBeInTheDocument();
    unmount();

    render(<PageSections pages={manyPages(12)} />);
    expect(screen.getByLabelText("Filter pages")).toBeInTheDocument();
  });

  it("narrows the list as you type, and says so when nothing matches", async () => {
    render(<PageSections pages={manyPages(12)} />);

    await userEvent.type(screen.getByLabelText("Filter pages"), "page-11");
    expect(screen.getByText("/page-11")).toBeInTheDocument();
    expect(screen.queryByText("/page-2")).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Filter pages"));
    await userEvent.type(screen.getByLabelText("Filter pages"), "nothing-like-this");
    expect(screen.getByText(/No page matches/)).toBeInTheDocument();
  });

  it("renders nothing rather than an empty frame when there are no pages", () => {
    const { container } = render(<PageSections pages={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PageSections when printing", () => {
  // The PDF is the report. A reader holding it must not have to know which row
  // happened to be open in the browser when the button was pressed.
  it("renders every page's section, not just the open one", async () => {
    render(<PageSections pages={PAGES} />);
    expect(screen.queryByText("Pricing report")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("beforeprint"));
    });

    expect(screen.getByText("Home report")).toBeInTheDocument();
    expect(screen.getByText("Pricing report")).toBeInTheDocument();
    expect(screen.getByText("About report")).toBeInTheDocument();
  });

  it("prints the whole report even with a filter typed", async () => {
    render(<PageSections pages={manyPages(12)} />);
    await userEvent.type(screen.getByLabelText("Filter pages"), "page-11");
    expect(screen.queryByText("/page-3")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("beforeprint"));
    });

    // A filter is a way of looking, not an edit. All twelve print.
    expect(screen.getByText("/page-3")).toBeInTheDocument();
    expect(screen.getByText("Report 3")).toBeInTheDocument();
  });

  it("puts the report back the way it was afterwards", async () => {
    render(<PageSections pages={PAGES} />);

    act(() => {
      window.dispatchEvent(new Event("beforeprint"));
    });
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });

    await waitFor(() => expect(screen.queryByText("Pricing report")).not.toBeInTheDocument());
    expect(screen.getByText("Home report")).toBeInTheDocument();
  });

  it("forces open a <details> inside a section, which would print as its summary alone", () => {
    render(
      <PageSections
        pages={[
          {
            key: "https://site.test/",
            label: "/",
            hint: "1 issue",
            content: (
              <details>
                <summary>Missing meta description</summary>
                <p>The fix for it</p>
              </details>
            ),
          },
        ]}
      />,
    );

    const detail = screen.getByText("Missing meta description").closest("details")!;
    expect(detail.open).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("beforeprint"));
    });
    expect(detail.open).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(detail.open).toBe(false);
  });
});

describe("PageSections with reduced motion", () => {
  // Someone who has asked their OS for less movement still has to be able to
  // read the report — rows must open, just without the travel.
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("still opens a page", async () => {
    render(<PageSections pages={PAGES} />);
    await userEvent.click(screen.getByRole("button", { name: /\/about/ }));
    expect(await screen.findByText("About report")).toBeInTheDocument();
  });
});

describe("toneOf", () => {
  it("reads a clean page as good and a bad one as critical", () => {
    expect(toneOf("no issues")).toBe("good");
    expect(toneOf("0 issues")).toBe("good");
    expect(toneOf("1 issue")).toBe("warn");
    expect(toneOf("5 issues")).toBe("crit");
  });

  it("reads a score the other way round — less is worse", () => {
    expect(toneOf("88/100 extractable")).toBe("good");
    expect(toneOf("55/100 extractable")).toBe("warn");
    expect(toneOf("12/100 extractable")).toBe("crit");
  });

  it("is neutral about a hint it does not recognise", () => {
    // A wrong colour on a figure is worse than no colour: it states a verdict
    // the report never made.
    expect(toneOf("indexed")).toBe("none");
    expect(toneOf(undefined)).toBe("none");
  });
});
