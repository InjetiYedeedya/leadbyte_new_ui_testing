import {
  formatLocations,
  readLocations,
  type CampaignLocation,
} from "@/lib/data/campaign-locations";

/** The four places the captured live body targeted, in the order they were added. */
const CAPTURED: CampaignLocation[] = [
  { country: "India", state: "Tamil Nadu", city: "Kanchipuram", zip: "" },
  { country: "India", state: "Tamil Nadu", city: "Alagāpuram", zip: "" },
  { country: "India", state: "Andhra Pradesh", city: "Anantapur", zip: "" },
  { country: "India", state: "Karnataka", city: "Gulbarga", zip: "" },
];

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.append(name, value);
  return data;
}

describe("formatLocations", () => {
  it("reproduces the captured live strings", () => {
    expect(formatLocations(CAPTURED)).toEqual({
      location:
        "Kanchipuram, Alagāpuram > Tamil Nadu > India | Anantapur > Andhra Pradesh > India | Gulbarga > Karnataka > India",
      country: "India",
      state: "Tamil Nadu, Andhra Pradesh, Karnataka",
      city: "Kanchipuram, Alagāpuram, Anantapur, Gulbarga",
    });
  });

  it("groups two cities of one state together, wherever they were added", () => {
    // Same four places, with the Tamil Nadu pair split apart in the form. They
    // still belong to one state, so they still read as one group.
    const shuffled: CampaignLocation[] = [
      { country: "India", state: "Tamil Nadu", city: "Kanchipuram", zip: "" },
      { country: "India", state: "Karnataka", city: "Gulbarga", zip: "" },
      { country: "India", state: "Tamil Nadu", city: "Alagāpuram", zip: "" },
    ];

    expect(formatLocations(shuffled).location).toBe(
      "Kanchipuram, Alagāpuram > Tamil Nadu > India | Gulbarga > Karnataka > India",
    );
  });

  it("de-duplicates the flat lists without collapsing the display", () => {
    const twice: CampaignLocation[] = [
      { country: "India", state: "Tamil Nadu", city: "Salem", zip: "" },
      { country: "India", state: "Tamil Nadu", city: "Salem", zip: "" },
    ];

    expect(formatLocations(twice)).toEqual({
      location: "Salem > Tamil Nadu > India",
      country: "India",
      state: "Tamil Nadu",
      city: "Salem",
    });
  });

  it("writes one place as the whole address, narrowest first", () => {
    expect(formatLocations([{ country: "United States", state: "New Jersey", city: "Newark", zip: "" }])).toEqual({
      location: "Newark > New Jersey > United States",
      country: "United States",
      state: "New Jersey",
      city: "Newark",
    });
  });

  it("stops at the level that was actually answered", () => {
    // Targeting a whole country is a real choice, not a half-filled form.
    expect(formatLocations([{ country: "India", state: "", city: "", zip: "" }])).toEqual({
      location: "India",
      country: "India",
      state: "Not provided",
      city: "Not provided",
    });
  });

  it("spells out an empty list rather than sending blanks", () => {
    expect(formatLocations([])).toEqual({
      location: "Not provided",
      country: "Not provided",
      state: "Not provided",
      city: "Not provided",
    });
  });
});

describe("readLocations", () => {
  it("reads the cascades the form posted, in index order", () => {
    const data = form({
      "location:0_country": "India",
      "location:0_state": "Tamil Nadu",
      "location:0_city": "Kanchipuram",
      "location:1_country": "India",
      "location:1_state": "Karnataka",
      "location:1_city": "Gulbarga",
    });

    expect(readLocations(data)).toEqual([
      { country: "India", state: "Tamil Nadu", city: "Kanchipuram", zip: "" },
      { country: "India", state: "Karnataka", city: "Gulbarga", zip: "" },
    ]);
  });

  it("keeps ten cascades in numeric order, not alphabetical", () => {
    const data = new FormData();
    for (let i = 0; i < 11; i++) data.append(`location:${i}_country`, `C${i}`);

    expect(readLocations(data).map((l) => l.country)).toEqual([
      "C0", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10",
    ]);
  });

  it("closes the gap a removed cascade leaves behind", () => {
    const data = form({
      "location:0_country": "India",
      "location:2_country": "France",
    });

    expect(readLocations(data)).toEqual([
      { country: "India", state: "", city: "", zip: "" },
      { country: "France", state: "", city: "", zip: "" },
    ]);
  });

  it("drops a cascade with no country, however far down it was filled", () => {
    // A state without its country is not a place we can target, and sending it
    // would put a campaign somewhere nobody chose.
    const data = form({
      "location:0_country": "",
      "location:0_state": "Tamil Nadu",
      "location:0_city": "Salem",
    });

    expect(readLocations(data)).toEqual([]);
  });

  it("trims what was typed into a text-box fallback", () => {
    const data = form({
      "location:0_country": "  India  ",
      "location:0_city": " Salem ",
    });

    expect(readLocations(data)).toEqual([{ country: "India", state: "", city: "Salem", zip: "" }]);
  });

  it("finds nothing in a form that has no location inputs", () => {
    expect(readLocations(form({ businessName: "Zippygo" }))).toEqual([]);
  });
});
