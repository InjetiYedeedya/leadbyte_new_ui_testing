import { fireEvent, render, screen } from "@testing-library/react";
import { AdsListPicker, AudienceChoice } from "./ads-list-picker";

function answer(options: { id: string; name: string }[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        options: options.map((o) => ({ ...o, detail: "", profileId: "", assetSet: "" })),
      }),
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

const CUSTOM = {
  label: "+ Create custom form",
  detail: "We'll create a custom instant form for your leads",
  pick: { id: "custom", name: "Custom Form", detail: "", profileId: "", assetSet: "" },
};

describe("AdsListPicker — an extra option", () => {
  it("comes last, after the account's own forms, and posts its pick", async () => {
    answer([{ id: "f1", name: "Quote form" }]);
    render(
      <AdsListPicker
        platform="meta"
        kind="lead-forms"
        name="leadForm"
        label="Which instant form?"
        multiple={false}
        what="your instant forms"
        empty="None yet."
        extraOption={CUSTOM}
      />,
    );
    await screen.findByText("Quote form");
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    expect(JSON.parse(radios[1]!.value)).toEqual({ id: "custom", name: "Custom Form" });
    expect(screen.getByText("+ Create custom form")).toBeInTheDocument();
  });

  it("is still offered when the account has none", async () => {
    answer([]);
    render(
      <AdsListPicker
        platform="meta"
        kind="lead-forms"
        name="leadForm"
        label="Which instant form?"
        multiple={false}
        what="your instant forms"
        empty="None yet."
        extraOption={CUSTOM}
      />,
    );
    await screen.findByText("None yet.");
    expect((screen.getByRole("radio") as HTMLInputElement).required).toBe(true);
  });
});

describe("AudienceChoice — retargeting", () => {
  it("selects and deselects every audience, and counts them", async () => {
    answer([
      { id: "a1", name: "Buyers" },
      { id: "a2", name: "Visitors" },
    ]);
    render(<AudienceChoice platform="meta" />);
    fireEvent.click(screen.getByLabelText("People who already know you"));
    await screen.findByText("Buyers");
    expect(screen.getByText("0 audiences selected")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Buyers/));
    expect(screen.getByText("1 audience selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText("2 audiences selected")).toBeInTheDocument();
    expect((screen.getAllByRole("checkbox") as HTMLInputElement[]).every((box) => box.checked)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(screen.getByText("0 audiences selected")).toBeInTheDocument();
  });

  it("offers a way back to a new audience when there are none", async () => {
    answer([]);
    render(<AudienceChoice platform="meta" />);
    fireEvent.click(screen.getByLabelText("People who already know you"));
    fireEvent.click(await screen.findByRole("button", { name: "Switch to new audience" }));
    const fresh = screen.getByLabelText("A new audience") as HTMLInputElement;
    expect(fresh.checked).toBe(true);
    expect(document.activeElement).toBe(fresh);
  });
});

describe("AdsListPicker — store locations", () => {
  it("asks for a Business Profile when no location has an id", async () => {
    answer([{ id: "s1", name: "1 Main St" }]);
    render(
      <AdsListPicker
        platform="google"
        kind="store-locations"
        name="storeLocation"
        label="Which stores?"
        multiple
        what="your store locations"
        empty="None."
        requireProfile
        count={{ one: "location", many: "locations" }}
      />,
    );
    expect(await screen.findByText("Connect your Google Business Profile (GMB)")).toBeInTheDocument();
    expect(screen.getByText(/We couldn't find a location ID for your business/)).toBeInTheDocument();
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
  });

  it("offers Select all across the usable locations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          options: [
            { id: "s1", name: "North", detail: "", profileId: "g1", assetSet: "" },
            { id: "s2", name: "South", detail: "", profileId: "g2", assetSet: "" },
          ],
        }),
      })),
    );
    render(
      <AdsListPicker
        platform="google"
        kind="store-locations"
        name="storeLocation"
        label="Which stores?"
        multiple
        what="your store locations"
        empty="None."
        requireProfile
        count={{ one: "location", many: "locations" }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Select all" }));
    expect(screen.getByText("2 locations selected")).toBeInTheDocument();
  });
});
