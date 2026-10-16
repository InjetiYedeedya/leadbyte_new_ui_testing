import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeadBoard } from "./lead-board";
import { buildPipeline, mapLeads } from "@/lib/data/dashboard/lead-pipeline";

/**
 * The pipeline bars and score chips are filters on the table below them. What
 * has to hold: pressing one says so (`aria-pressed`), narrows the table, and
 * the count line says how far; pressing it again clears it.
 */

const LEADS = mapLeads([
  { lead_email: "ann@x.com", lead_name: "Ann", send_mail: true, score: 90, mails: [{}, {}], lead_status: "Qualified" },
  { lead_email: "bo@x.com", lead_name: "Bo", send_mail: "yes", score: 50, last_reply_at: "2026-09-20T10:00:00Z", last_reply_text: "Tell me more" },
  { lead_email: "cy@x.com", lead_name: "Cy", score: 10 },
]);
const PIPELINE = buildPipeline(LEADS, []);

function bodyNames(): string[] {
  const table = screen.getByRole("table");
  const body = within(table).getAllByRole("rowgroup")[1]!;
  return within(body)
    .getAllByRole("row")
    .map((row) => within(row).getAllByRole("cell")[0]!.textContent ?? "");
}

beforeAll(() => {
  // jsdom has no scrollTo; the scroll lock calls it on release.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

describe("LeadBoard filters", () => {
  it("toggles a pipeline stage on and off", async () => {
    render(<LeadBoard leads={LEADS} pipeline={PIPELINE} />);
    const contacted = screen.getByRole("button", { name: /^Contacted/ });
    const all = screen.getByRole("button", { name: /^All leads/ });

    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(contacted).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("3 total")).toBeInTheDocument();

    await userEvent.click(contacted);
    expect(contacted).toHaveAttribute("aria-pressed", "true");
    expect(all).toHaveAttribute("aria-pressed", "false");
    expect(bodyNames().sort()).toEqual(["Ann", "Bo"]);
    expect(screen.getByText("2 of 3 match your filters")).toBeInTheDocument();

    await userEvent.click(contacted);
    expect(contacted).toHaveAttribute("aria-pressed", "false");
    expect(bodyNames()).toHaveLength(3);
  });

  it("filters by a score chip, and says when nothing matches", async () => {
    render(<LeadBoard leads={LEADS} pipeline={PIPELINE} />);
    await userEvent.click(screen.getByRole("button", { name: /^Hot/ }));
    expect(bodyNames()).toEqual(["Ann"]);

    await userEvent.type(screen.getByRole("searchbox", { name: "Search leads" }), "nobody");
    expect(screen.getByText("No leads match these filters.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(bodyNames()).toHaveLength(3);
  });

  it("counts the panel's filters on the Filters button", async () => {
    render(<LeadBoard leads={LEADS} pipeline={PIPELINE} />);
    const toggle = screen.getByRole("button", { name: /^Filters/ });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Reply" }), "replied");
    expect(bodyNames()).toEqual(["Bo"]);
    expect(toggle).toHaveTextContent("1 active");
  });

  it("never prints the mails field, only its count", () => {
    render(<LeadBoard leads={LEADS} pipeline={PIPELINE} />);
    const ann = screen.getByText("Ann").closest("tr")!;
    expect(within(ann).getByText("2")).toBeInTheDocument();
    expect(ann.textContent).not.toContain("[object");
  });
});

describe("LeadBoard drawer", () => {
  it("opens from View, and closes back to the button that opened it", async () => {
    render(<LeadBoard leads={LEADS} pipeline={PIPELINE} />);
    const view = screen.getByRole("button", { name: "View Bo" });
    await userEvent.click(view);

    const dialog = document.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(within(dialog).getByText("Tell me more")).toBeInTheDocument();

    await act(async () => {
      dialog.close();
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(document.activeElement).toBe(view);
  });
});
