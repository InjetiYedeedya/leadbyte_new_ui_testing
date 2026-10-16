import { fireEvent, render, screen } from "@testing-library/react";
import { SourceExplorer } from "./source-explorer";

describe("SourceExplorer", () => {
  const sources = [
    { id: "analytics", label: "Website traffic", summary: "Website detail", chart: <p>Traffic chart</p>, table: <input aria-label="Filter pages" /> },
    { id: "search", label: "Search visibility", summary: "Search detail", chart: <p>Search chart</p>, table: <p>Query rows</p> },
  ];

  function openAt(id: string) {
    return render(<SourceExplorer sources={sources} initialSourceId={id} />);
  }

  /**
   * The channel card that linked here names its source in `?source=`, and the
   * page resolves it. Opening on the wrong channel would mean clicking
   * "Explore search" and landing on website traffic.
   */
  it("opens on the source the page was asked for", () => {
    openAt("search");
    expect(screen.getByRole("tab", { name: "Search visibility" }).getAttribute("aria-selected")).toBe("true");
  });

  it("falls back to the first source when asked for one that is not there", () => {
    render(<SourceExplorer sources={sources} initialSourceId="nothing" />);
    expect(screen.getByRole("tab", { name: "Website traffic" }).getAttribute("aria-selected")).toBe("true");
  });

  it("retains table inputs when switching sources and display modes", () => {
    openAt("analytics");
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Filter pages" }), { target: { value: "pricing" } });
    fireEvent.click(screen.getByRole("tab", { name: "Search visibility" }));
    expect(screen.getByText("Query rows").closest("[hidden]")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Website traffic" }));
    expect((screen.getByRole("textbox", { name: "Filter pages" }) as HTMLInputElement).value).toBe("pricing");
    fireEvent.click(screen.getByRole("button", { name: "Chart" }));
    expect(screen.getByText("Traffic chart").closest("[hidden]")).toBeNull();
  });

  it("moves keyboard focus with source selection", () => {
    openAt("analytics");
    const first = screen.getByRole("tab", { name: "Website traffic" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Search visibility" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Search visibility" }));
  });
});
