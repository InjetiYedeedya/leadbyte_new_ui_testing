import { act, fireEvent, render, screen } from "@testing-library/react";
import { FormDraft } from "./form-draft";
import { draftKeyFor } from "@/lib/data/form-draft-key";
import { LocationPicker } from "./location-picker";

const KEY = draftKeyFor("google-ads", "a@b.com");

function Form() {
  return (
    <form>
      <FormDraft draftKey={KEY} />
      <label>
        Business name <input name="businessName" defaultValue="" />
      </label>
      <label>
        Password <input name="wpPassword" defaultValue="" />
      </label>
      <label>
        <input type="checkbox" name="ages" value="18-24" /> 18-24
      </label>
    </form>
  );
}

describe("FormDraft", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("keeps answers as they are typed — never a password — and brings them back", async () => {
    const first = render(<Form />);
    fireEvent.input(screen.getByLabelText("Business name"), { target: { value: "LeadByte" } });
    fireEvent.input(screen.getByLabelText("Password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByLabelText("18-24"));
    await act(() => vi.advanceTimersByTimeAsync(600));
    const saved = window.localStorage.getItem(KEY) ?? "";
    expect(saved).toContain("LeadByte");
    expect(saved).not.toContain("secret");
    first.unmount();

    render(<Form />);
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect((screen.getByLabelText("Business name") as HTMLInputElement).value).toBe("LeadByte");
    expect(screen.getByLabelText("18-24")).toBeChecked();
    expect(screen.getByText(/We kept your unsent answers/)).toBeInTheDocument();
  });

  it("drops the budget type from a draft saved before it stopped being pre-picked", async () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ savedAt: Date.now(), entries: [["businessName", "Old"], ["budgetType", "daily"]] }),
    );
    render(
      <form>
        <FormDraft draftKey={KEY} />
        <label>
          Business name <input name="businessName" defaultValue="" />
        </label>
        <label>
          Budget type
          <select name="budgetType" defaultValue="">
            <option value="" disabled>
              Select type
            </option>
            <option value="daily">Daily budget</option>
          </select>
        </label>
      </form>,
    );
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect((screen.getByLabelText("Business name") as HTMLInputElement).value).toBe("Old");
    expect((screen.getByLabelText("Budget type") as HTMLSelectElement).value).toBe("");
  });

  it("asks before clearing", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), entries: [["businessName", "X"]] }));
    render(<Form />);
    fireEvent.click(screen.getByRole("button", { name: "Clear data" }));
    expect(screen.getByText("Clear every answer?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
  });

  it("keys the draft by account, so two people on one browser never share one", () => {
    expect(draftKeyFor("google-ads", "a@b.com")).not.toBe(draftKeyFor("google-ads", "c@d.com"));
    expect(draftKeyFor("google-ads", "a@b.com")).not.toContain("a@b.com");
  });

  it("keeps the location picker's places, and leaves other hidden inputs alone", async () => {
    const places = JSON.stringify([{ type: "state", country: "United States", state: "Texas" }]);
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ savedAt: Date.now(), entries: [["locationPicks", places], ["pageOwned", "old"]] }),
    );
    render(
      <form>
        <FormDraft draftKey={KEY} />
        <input type="hidden" name="pageOwned" defaultValue="current" />
        <LocationPicker name="locationPicks" countries={["United States"]} />
      </form>,
    );
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(screen.getByText("Selected locations: 1")).toBeInTheDocument();
    expect((document.querySelector('input[name="pageOwned"]') as HTMLInputElement).value).toBe("current");
  });

  it("saves when a place is removed, which fires no form event of its own", async () => {
    render(
      <form>
        <FormDraft draftKey={KEY} />
        <LocationPicker
          name="locationPicks"
          countries={["United States"]}
          initialPicks={[
            { type: "state", country: "United States", state: "Texas" },
            { type: "state", country: "United States", state: "Ohio" },
          ]}
        />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Texas, United States" }));
    await act(() => vi.advanceTimersByTimeAsync(600));
    const saved = window.localStorage.getItem(KEY) ?? "";
    expect(saved).toContain("Ohio");
    expect(saved).not.toContain("Texas");
  });
});
