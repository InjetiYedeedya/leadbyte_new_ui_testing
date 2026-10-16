import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The subdomain choice, and the three rules the integration contract puts on
 * it. All three are the kind that look like oversights if you only read the
 * JSX, so they are pinned here.
 */

/** What the Server Action was actually handed, which is the only thing that matters. */
const submitted: FormData[] = [];

vi.mock("@/app/(app)/agents/aeo/actions", () => ({
  confirmAeoSelectionAction: vi.fn(async (formData: FormData) => {
    submitted.push(formData);
  }),
}));

const { AeoSubdomainPicker } = await import("./aeo-subdomain-picker");

beforeAll(() => {
  // `useScrollLock` puts the reader back where they were on release, and jsdom
  // has no scrolling to put them back to.
  window.scrollTo = () => {};
  // jsdom implements neither, and `showModal()` is what gives a <dialog> the
  // top layer, the backdrop and the focus trap — so the component is right to
  // call it and the environment is what needs the stub.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

const SUBDOMAINS = ["blog.example.com", "app.example.com"];

function picker(autoOpen = true) {
  return render(
    <AeoSubdomainPicker domain="example.com" subdomains={SUBDOMAINS} autoOpen={autoOpen} />,
  );
}

describe("AeoSubdomainPicker", () => {
  it("offers only the subdomains — never the main site", () => {
    // The service audits the main domain unconditionally. A checkbox for it
    // would imply it could be left out, which is not a choice anyone has.
    picker();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.map((b) => b.getAttribute("value"))).toEqual(SUBDOMAINS);
    expect(screen.queryByRole("checkbox", { name: "example.com" })).toBeNull();
  });

  it("pre-checks nothing, so the default is the main site alone", () => {
    picker();
    for (const box of screen.getAllByRole("checkbox")) {
      expect(box).not.toBeChecked();
    }
  });

  it("keeps the confirm enabled with nothing selected", async () => {
    // An empty selection is a real answer — "audit just the main site" — which
    // is why there is no separate skip button. Disabling this would turn a
    // valid choice into an unfinished form.
    picker();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Run audit" })).toBeEnabled();
  });

  it("says what picking nothing will do, and what picking something will do", async () => {
    const user = userEvent.setup();
    picker();
    expect(screen.getByText(/we'll audit example\.com on its own/i)).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "blog.example.com" }));
    // Two: the one just picked, plus the main domain that always runs.
    expect(screen.getByText("2 sites will be audited, each on its own.")).toBeInTheDocument();
  });

  it("sends the picked hosts to the Server Action, under one name", async () => {
    const user = userEvent.setup();
    picker();

    await user.click(screen.getByRole("checkbox", { name: "blog.example.com" }));
    await user.click(screen.getByRole("checkbox", { name: "app.example.com" }));
    await user.click(screen.getByRole("button", { name: "Run audit" }));

    const form = submitted.at(-1)!;
    // Comma-joined into one hidden field: hostnames cannot contain a comma,
    // and one field keeps the dialog's state and the posted value from ever
    // disagreeing. The checkboxes deliberately carry a DIFFERENT name — two
    // inputs sharing one would post two values, and DOM order would pick the
    // winner.
    expect(form.get("selected")).toBe("blog.example.com,app.example.com");
    expect(form.getAll("selected")).toHaveLength(1);
  });

  it("sends an empty selection when nothing is ticked, rather than nothing at all", async () => {
    const user = userEvent.setup();
    picker();

    await user.click(screen.getByRole("checkbox", { name: "blog.example.com" }));
    await user.click(screen.getByRole("checkbox", { name: "blog.example.com" }));
    await user.click(screen.getByRole("button", { name: "Run audit" }));

    // An empty string, present. The action reads that as "just the main site",
    // which is a decision — a missing field would be an accident.
    expect(submitted.at(-1)!.get("selected")).toBe("");
  });
});
