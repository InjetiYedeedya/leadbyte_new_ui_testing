import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocationTargets } from "./location-targets";

const COUNTRIES = ["India", "United States"];

const LISTS: Record<string, string[]> = {
  states: ["Kerala", "New Jersey"],
  cities: ["Camden", "Newark"],
};

/** Every location row on screen, in the order the form will post them. */
const rows = () => screen.getAllByRole("group", { name: /^Location \d/ });

const fieldIn = (row: HTMLElement, name: RegExp) =>
  within(row).getByLabelText(name, { selector: "select,input:not([type=radio])" });

const maybeFieldIn = (row: HTMLElement, name: RegExp) =>
  within(row).queryByLabelText(name, { selector: "select,input:not([type=radio])" });

/** Choose how precise this place should be, the way a customer would. */
const chooseDepth = async (
  user: ReturnType<typeof userEvent.setup>,
  row: HTMLElement,
  label: string,
) => user.click(within(row).getByRole("radio", { name: label }));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const kind = new URL(url, "http://x").searchParams.get("kind") ?? "";
      return { ok: true, json: async () => ({ options: LISTS[kind] ?? [] }) };
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LocationTargets", () => {
  /**
   * A country is the least assumption about a campaign nobody has described
   * yet — and the levels under it are the ones that must NOT be asked for
   * until someone says they want them.
   */
  it("starts with one place, targeted at a whole country", () => {
    render(<LocationTargets countries={COUNTRIES} />);

    expect(rows()).toHaveLength(1);
    expect(fieldIn(rows()[0]!, /^Country/)).toHaveAttribute("name", "location:0_country");
    expect(maybeFieldIn(rows()[0]!, /^State or region/)).toBeNull();
    expect(maybeFieldIn(rows()[0]!, /^City/)).toBeNull();
  });

  it("opens each level only when that precision is chosen", async () => {
    const user = userEvent.setup();
    render(<LocationTargets countries={COUNTRIES} />);

    await chooseDepth(user, rows()[0]!, "State");
    expect(fieldIn(rows()[0]!, /^State or region/)).toHaveAttribute("name", "location:0_state");
    expect(maybeFieldIn(rows()[0]!, /^City/)).toBeNull();

    await chooseDepth(user, rows()[0]!, "City");
    expect(fieldIn(rows()[0]!, /^City/)).toHaveAttribute("name", "location:0_city");
  });

  /**
   * The n8n payload has four location labels and none of them is a postcode,
   * so offering one on those forms collects an answer we then drop.
   */
  it("does not offer a postcode unless the request can carry one", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<LocationTargets countries={COUNTRIES} />);

    expect(within(rows()[0]!).queryByRole("radio", { name: "Zip code" })).toBeNull();
    unmount();

    render(<LocationTargets countries={COUNTRIES} withPostcode />);
    await chooseDepth(user, rows()[0]!, "Zip code");
    expect(fieldIn(rows()[0]!, /postal or zip/i)).toHaveAttribute("name", "location:0_zip");
  });

  /**
   * The postcode REPLACES the state and city in the request, so a row that was
   * never set to postcode precision must post no postcode at all — otherwise a
   * stray keystroke silently narrows a city campaign to one street.
   */
  it("posts no postcode from a row targeted at a city", async () => {
    const user = userEvent.setup();
    render(<LocationTargets countries={COUNTRIES} withPostcode />);

    await chooseDepth(user, rows()[0]!, "Zip code");
    expect(fieldIn(rows()[0]!, /postal or zip/i)).toBeInTheDocument();

    await chooseDepth(user, rows()[0]!, "City");
    expect(maybeFieldIn(rows()[0]!, /postal or zip/i)).toBeNull();
  });

  /** Each row is its own campaign decision — one country, one postcode. */
  it("lets each place be targeted at its own precision", async () => {
    const user = userEvent.setup();
    render(<LocationTargets countries={COUNTRIES} />);

    await user.click(screen.getByRole("button", { name: /add another location/i }));
    await chooseDepth(user, rows()[1]!, "City");

    expect(maybeFieldIn(rows()[0]!, /^City/)).toBeNull();
    expect(fieldIn(rows()[1]!, /^City/)).toHaveAttribute("name", "location:1_city");
  });

  it("adds another place, named for its position", async () => {
    const user = userEvent.setup();
    render(<LocationTargets countries={COUNTRIES} />);

    await user.click(screen.getByRole("button", { name: /add another location/i }));

    expect(rows()).toHaveLength(2);
    expect(fieldIn(rows()[1]!, /^Country/)).toHaveAttribute("name", "location:1_country");
  });

  it("keeps each place's own answers when another is added", async () => {
    const user = userEvent.setup();
    render(<LocationTargets countries={COUNTRIES} />);

    await user.selectOptions(fieldIn(rows()[0]!, /^Country/), "India");
    await user.click(screen.getByRole("button", { name: /add another location/i }));

    // The first row's answer belongs to the first row, not to the control.
    expect(fieldIn(rows()[0]!, /^Country/)).toHaveValue("India");
    expect(fieldIn(rows()[1]!, /^Country/)).toHaveValue("");
  });

  it("narrows each place independently", async () => {
    const user = userEvent.setup();
    render(<LocationTargets countries={COUNTRIES} />);

    await user.click(screen.getByRole("button", { name: /add another location/i }));
    await chooseDepth(user, rows()[0]!, "State");
    await chooseDepth(user, rows()[1]!, "State");
    await user.selectOptions(fieldIn(rows()[1]!, /^Country/), "United States");

    await waitFor(() =>
      expect(within(rows()[1]!).getByRole("option", { name: "New Jersey" })).toBeInTheDocument(),
    );
    // Row one was never given a country, so it still has no states to offer.
    expect(within(rows()[0]!).queryByRole("option", { name: "New Jersey" })).toBeNull();
  });

  it("renumbers the survivors when a place is removed", async () => {
    const user = userEvent.setup();
    render(<LocationTargets countries={COUNTRIES} />);

    await user.click(screen.getByRole("button", { name: /add another location/i }));
    await user.selectOptions(fieldIn(rows()[1]!, /^Country/), "India");
    await user.click(within(rows()[0]!).getByRole("button", { name: /remove/i }));

    expect(rows()).toHaveLength(1);
    // The second row's answers survived and it now posts as location:0.
    expect(fieldIn(rows()[0]!, /^Country/)).toHaveValue("India");
    expect(fieldIn(rows()[0]!, /^Country/)).toHaveAttribute("name", "location:0_country");
  });

  it("will not let the last place be removed", () => {
    render(<LocationTargets countries={COUNTRIES} />);

    // A campaign has to run somewhere, so there is nothing to press.
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
  });

  it("falls back to a text box when the country list could not be fetched", () => {
    render(<LocationTargets countries={[]} />);

    expect(fieldIn(rows()[0]!, /^Country/).tagName).toBe("INPUT");
  });
});
