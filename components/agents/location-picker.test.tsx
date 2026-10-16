import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LocationPicker, splitPostcodes } from "./location-picker";
import { decodePicks, type LocationPick } from "@/lib/data/location-picks";

const US = "United States";

function answer(url: string): unknown {
  const params = new URL(url, "http://x").searchParams;
  switch (params.get("kind")) {
    case "states":
      return { options: ["California", "New York", "Texas"] };
    case "cities":
      return { options: params.get("state") === "California" ? ["Los Angeles", "San Diego"] : ["Dallas", "Austin"] };
    case "postcode": {
      const code = params.get("code");
      if (code === "99999") return { status: "invalid" };
      if (code === "90210") return { status: "valid", state: "California", city: "Beverly Hills" };
      if (code === "10001") return { status: "valid", state: "New York", city: "New York" };
      return { status: "unknown" };
    }
    default:
      return { options: [] };
  }
}

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
    new Response(JSON.stringify(answer(String(input))), { status: 200 }),
  );
});
afterEach(() => vi.restoreAllMocks());

function setup(props: Partial<Parameters<typeof LocationPicker>[0]> = {}) {
  const { container } = render(
    <form>
      <LocationPicker name="locationPicks" countries={["Canada", US]} {...props} />
    </form>,
  );
  const form = container.querySelector("form")!;
  const posted = () => decodePicks(new FormData(form).get("locationPicks"));
  return { form, posted };
}

const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));
const count = () => screen.getByText(/^Selected locations:/).textContent;

async function pickStates(...names: string[]) {
  tab("State");
  fireEvent.change(screen.getByRole("combobox", { name: "Country" }), { target: { value: US } });
  for (const name of names) fireEvent.click(await screen.findByRole("checkbox", { name }));
}

describe("LocationPicker", () => {
  it("adds several states, and switching tabs keeps them", async () => {
    const { posted } = setup();
    await pickStates("New York", "California", "Texas");
    tab("Country");
    tab("City");
    expect(count()).toBe("Selected locations: 3");
    expect(posted().map((pick) => pick.state)).toEqual(["New York", "California", "Texas"]);
  });

  it("mixes countries, states, cities and ZIP codes in one campaign", async () => {
    const { posted } = setup();
    fireEvent.click(screen.getByRole("checkbox", { name: US }));
    await pickStates("Texas");

    tab("City");
    fireEvent.change(await screen.findByRole("combobox", { name: "State" }), { target: { value: "California" } });
    fireEvent.click(await screen.findByRole("checkbox", { name: "Los Angeles" }));

    tab("ZIP Code");
    fireEvent.change(screen.getByRole("textbox", { name: "ZIP or postcodes" }), { target: { value: "90210, 10001" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(count()).toBe("Selected locations: 5"));
    expect(posted()).toEqual<LocationPick[]>([
      { type: "country", country: US },
      { type: "state", country: US, state: "Texas" },
      { type: "city", country: US, state: "California", city: "Los Angeles" },
      { type: "zip", country: US, zip: "90210", state: "California", city: "Beverly Hills" },
      { type: "zip", country: US, zip: "10001", state: "New York", city: "New York" },
    ]);
  });

  it("never adds the same place twice", async () => {
    const { posted } = setup({ initialPicks: [{ type: "state", country: US, state: "California" }] });
    tab("State");
    fireEvent.change(screen.getByRole("combobox", { name: "Country" }), { target: { value: US } });
    // Already picked, so it shows as ticked.
    expect(await screen.findByRole("checkbox", { name: "California" })).toBeChecked();

    tab("ZIP Code");
    const box = screen.getByRole("textbox", { name: "ZIP or postcodes" });
    fireEvent.change(box, { target: { value: "10001" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(count()).toBe("Selected locations: 2"));
    fireEvent.change(box, { target: { value: "10001" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(box).toHaveValue(""));
    expect(posted()).toHaveLength(2);
  });

  it("names an invalid postcode, keeps it in the box, and keeps every other pick", async () => {
    const { posted } = setup({ initialPicks: [{ type: "state", country: US, state: "Texas" }] });
    tab("ZIP Code");
    fireEvent.change(screen.getByRole("combobox", { name: "Country" }), { target: { value: US } });
    const box = screen.getByRole("textbox", { name: "ZIP or postcodes" });
    fireEvent.change(box, { target: { value: "99999, 90210" } });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(await screen.findByRole("alert")).toHaveTextContent("99999 isn't a postcode in United States");
    expect(box).toHaveValue("99999");
    expect(posted().map((pick) => pick.state ?? pick.zip)).toEqual(["Texas", "California"]);
  });

  it("adds a code no service could check, and says so on its chip", async () => {
    setup();
    tab("ZIP Code");
    fireEvent.change(screen.getByRole("combobox", { name: "Country" }), { target: { value: "Canada" } });
    fireEvent.change(screen.getByRole("textbox", { name: "ZIP or postcodes" }), { target: { value: "M5V 3L9" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("· not checked")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "ZIP codes" })).toHaveTextContent("M5V 3L9 · Canada");
  });

  it("removes one chip, and asks before clearing everything", async () => {
    const { posted } = setup({
      initialPicks: [
        { type: "state", country: US, state: "Texas" },
        { type: "city", country: US, state: "California", city: "Los Angeles" },
        { type: "zip", country: US, zip: "10001" },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove Texas, United States" }));
    expect(count()).toBe("Selected locations: 2");

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByText("Remove all 2 locations?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(posted()).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove all" }));
    expect(posted()).toEqual([]);
    expect(screen.getByText("Nothing added yet.")).toBeInTheDocument();
  });

  it("groups the selected places by level", () => {
    setup({
      initialPicks: [
        { type: "city", country: US, state: "California", city: "Los Angeles" },
        { type: "state", country: US, state: "Texas" },
      ],
    });
    expect(within(screen.getByRole("list", { name: "States" })).getByText("Texas, United States")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Cities" })).getByText("Los Angeles, California")).toBeInTheDocument();
  });

  it("offers only the levels it is given", () => {
    setup({ levels: ["state", "city"] });
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["State", "City"]);
  });

  it("stops an empty submit with a real message", () => {
    const { form } = setup();
    expect(form.checkValidity()).toBe(false);
  });

  it("reloads picks a restored draft wrote into the hidden input", () => {
    const { form, posted } = setup();
    const hidden = form.querySelector<HTMLInputElement>('input[name="locationPicks"]')!;
    act(() => {
      hidden.value = JSON.stringify([{ type: "country", country: "Canada" }]);
      hidden.dispatchEvent(new Event("input"));
    });
    expect(count()).toBe("Selected locations: 1");
    expect(posted()).toEqual([{ type: "country", country: "Canada" }]);
  });
});

describe("splitPostcodes", () => {
  it("splits on commas and new lines, and on spaces only between all-digit codes", () => {
    expect(splitPostcodes("10001, 90210;75201\n60601")).toEqual(["10001", "90210", "75201", "60601"]);
    expect(splitPostcodes("10001 90210")).toEqual(["10001", "90210"]);
    expect(splitPostcodes("sw1a 1aa, M5V  3L9")).toEqual(["SW1A 1AA", "M5V 3L9"]);
    expect(splitPostcodes("10001, 10001,  ")).toEqual(["10001"]);
  });
});
