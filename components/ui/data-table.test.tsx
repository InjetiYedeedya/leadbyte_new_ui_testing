import { describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable, type Column } from "./data-table";

interface Campaign {
  id: string;
  name: string;
  spend: number;
}

const COLUMNS: Column<Campaign>[] = [
  { key: "name", header: "Campaign", cell: (r) => r.name, sortValue: (r) => r.name },
  {
    key: "spend",
    header: "Spend",
    cell: (r) => r.spend.toLocaleString(),
    sortValue: (r) => r.spend,
    numeric: true,
  },
  { key: "static", header: "Notes", cell: () => "—" },
];

const ROWS: Campaign[] = [
  { id: "a", name: "Brand Search", spend: 500 },
  { id: "b", name: "Retargeting", spend: 1500 },
  { id: "c", name: "Awareness", spend: 100 },
];

function setup(props: Partial<React.ComponentProps<typeof DataTable<Campaign>>> = {}) {
  return render(
    <DataTable rows={ROWS} columns={COLUMNS} rowKey={(r) => r.id} {...props} />,
  );
}

/** Body cell text, first column, in render order. */
function names(): string[] {
  const body = screen.getAllByRole("rowgroup")[1]!;
  return within(body)
    .getAllByRole("row")
    .map((row) => within(row).getAllByRole("cell")[0]!.textContent!.trim());
}

describe("DataTable", () => {
  it("renders every row", () => {
    setup();
    expect(names()).toEqual(["Brand Search", "Retargeting", "Awareness"]);
  });

  it("sorts numerically, not lexically", async () => {
    setup();
    // Lexical sort would put 100 before 500 before 1500 as strings: "100",
    // "1500", "500". Numeric order is what a spend column must show.
    await userEvent.click(screen.getByRole("button", { name: /Spend/ }));
    expect(names()).toEqual(["Retargeting", "Brand Search", "Awareness"]);
  });

  it("reverses on a second click of the same column", async () => {
    setup();
    const header = screen.getByRole("button", { name: /Spend/ });
    await userEvent.click(header);
    await userEvent.click(header);
    expect(names()).toEqual(["Awareness", "Brand Search", "Retargeting"]);
  });

  it("defaults numeric columns to descending and text columns to ascending", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Spend/ }));
    expect(names()[0]).toBe("Retargeting"); // highest first
    await userEvent.click(screen.getByRole("button", { name: /Campaign/ }));
    expect(names()[0]).toBe("Awareness"); // A-Z
  });

  it("exposes sort state to assistive tech", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Spend/ }));
    expect(screen.getByRole("columnheader", { name: /Spend/ })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
  });

  it("does not make a column without sortValue clickable", () => {
    setup();
    expect(screen.queryByRole("button", { name: /Notes/ })).not.toBeInTheDocument();
  });

  it("does not mutate the caller's array", async () => {
    const rows = [...ROWS];
    render(<DataTable rows={rows} columns={COLUMNS} rowKey={(r) => r.id} />);
    await userEvent.click(screen.getByRole("button", { name: /Spend/ }));
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("filters on the searchable text", async () => {
    setup({ searchText: (r) => r.name });
    await userEvent.type(screen.getByRole("searchbox"), "retarg");
    expect(names()).toEqual(["Retargeting"]);
  });

  it("says so when a filter matches nothing", async () => {
    setup({ searchText: (r) => r.name });
    await userEvent.type(screen.getByRole("searchbox"), "zzzz");
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
  });

  it("shows the filtered count against the total", async () => {
    setup({ searchText: (r) => r.name });
    expect(screen.getByText("3 rows")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("searchbox"), "retarg");
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  it("paginates and moves between pages", async () => {
    setup({ pageSize: 2 });
    expect(names()).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(names()).toEqual(["Awareness"]);
  });

  /**
   * The label names the rows on screen rather than the page's ordinal. "Page 2
   * of 2" left working out which rows those were to the reader, on a control
   * whose only job is to say where in the list they are.
   */
  it("names the range of rows on screen, not the page number", async () => {
    setup({ pageSize: 2 });
    expect(screen.getByText("1–2 of 3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("3–3 of 3")).toBeInTheDocument();
  });

  it("counts the range against the filtered rows, not the original list", async () => {
    // Its own rows: the shared fixture has three, all containing "a", so no
    // filter over it can leave more than one page to count.
    render(
      <DataTable
        rows={[
          { id: "a", name: "Search brand", spend: 1 },
          { id: "b", name: "Search generic", spend: 2 },
          { id: "c", name: "Search competitor", spend: 3 },
          { id: "d", name: "Display remarketing", spend: 4 },
          { id: "e", name: "Display prospecting", spend: 5 },
        ]}
        columns={COLUMNS}
        rowKey={(r) => r.id}
        pageSize={2}
        searchText={(r) => r.name}
      />,
    );

    expect(screen.getByText("1–2 of 5")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("searchbox"), "Search");
    expect(screen.getByText("1–2 of 3")).toBeInTheDocument();
  });

  it("does not strand the reader on a page that no longer exists", async () => {
    // On page 2, then a filter shrinks the result to one page.
    setup({ pageSize: 2, searchText: (r) => r.name });
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.type(screen.getByRole("searchbox"), "brand");
    expect(names()).toEqual(["Brand Search"]);
  });

  describe("the page-size selector", () => {
    /** 30 rows so a 25-row default leaves something for a larger size to reveal. */
    const MANY = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      name: `Campaign ${String(i).padStart(2, "0")}`,
      spend: i,
    }));

    function many(props: Partial<React.ComponentProps<typeof DataTable<Campaign>>> = {}) {
      return render(
        <DataTable rows={MANY} columns={COLUMNS} rowKey={(r) => r.id} {...props} />,
      );
    }

    it("offers larger sizes when there are more rows than fit", () => {
      many();
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    it("shows more rows when a larger size is chosen", async () => {
      many();
      expect(names()).toHaveLength(25);
      await userEvent.selectOptions(screen.getByRole("combobox"), "50");
      expect(names()).toHaveLength(30);
    });

    it("keeps the selector reachable after a size that fits everything", async () => {
      // The bug this pins: with 30 rows at 50-per-page there is one page, and
      // gating the footer on "more than one page" hid the selector too — so
      // the size could not be changed back.
      many();
      await userEvent.selectOptions(screen.getByRole("combobox"), "50");
      expect(screen.getByRole("combobox")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    });

    it("returns to the first page, so a shrinking view is never blank", async () => {
      // Page 2 of a 25-row view does not exist in a 50-row one, and landing on
      // an empty page reads as the control having eaten the data.
      many();
      await userEvent.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.getByText("26–30 of 30")).toBeInTheDocument();

      await userEvent.selectOptions(screen.getByRole("combobox"), "50");
      expect(screen.getByText("1–30 of 30")).toBeInTheDocument();
    });

    /** A selector whose every option shows the same rows is a control that does nothing. */
    it("is hidden when no offered size would show more", () => {
      setup({ pageSize: 2 });
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("can be turned off entirely", () => {
      many({ pageSizes: [] });
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });
  });

  it("hides pagination when everything fits", () => {
    setup({ pageSize: 50 });
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("renders the empty slot instead of an empty table", () => {
    render(
      <DataTable rows={[]} columns={COLUMNS} rowKey={(r) => r.id} empty={<p>No campaigns</p>} />,
    );
    expect(screen.getByText("No campaigns")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("calls back with the row that was clicked, after sorting", async () => {
    const onRowClick = vi.fn();
    setup({ onRowClick });
    await userEvent.click(screen.getByRole("button", { name: /Spend/ }));
    const body = screen.getAllByRole("rowgroup")[1]!;
    await userEvent.click(within(body).getAllByRole("row")[0]!);
    expect(onRowClick).toHaveBeenCalledWith(ROWS[1]); // Retargeting, highest spend
  });

  /**
   * A clickable row opens the campaign drawer, and for a while it did so on a
   * mouse click only: a bare `<tr onClick>` takes no focus and answers no key,
   * so a keyboard user could not open a campaign at all.
   */
  it("opens a row from the keyboard, with Enter and with Space", async () => {
    const onRowClick = vi.fn();
    setup({ onRowClick });
    const body = screen.getAllByRole("rowgroup")[1]!;
    const first = within(body).getAllByRole("row")[0]!;

    expect(first).toHaveAttribute("tabindex", "0");

    first.focus();
    expect(first).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenCalledTimes(1);

    await userEvent.keyboard(" ");
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it("says what Enter will do, and keeps the row a row", async () => {
    const onRowClick = vi.fn();
    setup({ onRowClick });
    const body = screen.getAllByRole("rowgroup")[1]!;
    const first = within(body).getAllByRole("row")[0]!;
    // `role="button"` here would hide the cells, which are most of what the
    // row is; the popup hint carries the behaviour instead.
    expect(first).toHaveAttribute("aria-haspopup", "dialog");
    expect(first).not.toHaveAttribute("role", "button");
  });

  it("leaves a table with no row action untouchable by the keyboard", () => {
    setup({});
    const body = screen.getAllByRole("rowgroup")[1]!;
    const first = within(body).getAllByRole("row")[0]!;
    expect(first).not.toHaveAttribute("tabindex");
    expect(first).not.toHaveAttribute("aria-haspopup");
  });
});

describe("DataTable when printing", () => {
  const MANY: Campaign[] = Array.from({ length: 30 }, (_, i) => ({
    id: `r${i}`,
    name: `Campaign ${i}`,
    spend: i * 10,
  }));

  it("prints every row, not just the page the reader had reached", () => {
    render(
      <DataTable rows={MANY} columns={COLUMNS} rowKey={(r) => r.id} pageSize={25} />,
    );
    // On screen: one page of 25.
    expect(screen.queryByText("Campaign 27")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("beforeprint"));
    });

    // On paper: all 30, because a PDF has no "next page" button.
    expect(screen.getByText("Campaign 0")).toBeInTheDocument();
    expect(screen.getByText("Campaign 27")).toBeInTheDocument();
  });

  it("goes back to one page afterwards", () => {
    render(
      <DataTable rows={MANY} columns={COLUMNS} rowKey={(r) => r.id} pageSize={25} />,
    );

    act(() => {
      window.dispatchEvent(new Event("beforeprint"));
    });
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });

    expect(screen.queryByText("Campaign 27")).not.toBeInTheDocument();
  });
});

describe("DataTable expandable rows", () => {
  const expandable = {
    render: (row: Campaign) => <p>Detail for {row.name}</p>,
    rowLabel: (row: Campaign) => row.name,
  };

  it("opens a row's detail in place, and only one at a time", async () => {
    const user = userEvent.setup();
    setup({ expandable });

    expect(screen.queryByText("Detail for Brand Search")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View details for Brand Search" }));
    expect(screen.getByText("Detail for Brand Search")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hide details for Brand Search" }),
    ).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: "View details for Retargeting" }));
    expect(screen.getByText("Detail for Retargeting")).toBeInTheDocument();
    expect(screen.queryByText("Detail for Brand Search")).not.toBeInTheDocument();
  });

  it("closes again from the same button", async () => {
    const user = userEvent.setup();
    setup({ expandable });

    await user.click(screen.getByRole("button", { name: "View details for Awareness" }));
    await user.click(screen.getByRole("button", { name: "Hide details for Awareness" }));
    expect(screen.queryByText("Detail for Awareness")).not.toBeInTheDocument();
  });

  it("adds no button column when it is not asked for", () => {
    setup();
    expect(screen.queryByRole("columnheader", { name: "Details" })).not.toBeInTheDocument();
  });
});
