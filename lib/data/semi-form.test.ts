import { DIAL_SUFFIX, PHONE_PROBLEM, SEMI_FIELD_PREFIX, adjustSemiFields, isAgeField, isPhoneField, isUrlField, holdDropdownsToOptions, adTypeFromAnswers, dateRangeFields, semiFormProblems, expandLocationAnswers, missingSemiAnswers, parseSemiFields, readSemiAnswers, withLocationField } from "@/lib/data/semi-form";
import type { SemiField as SemiFieldFixture } from "@/lib/data/semi-form";

/** The live reply, copied from a probe of `/api/webhook/google-ads-semi`. */
const LIVE = {
  success: true,
  output: [
    {
      fieldLabel: "Status",
      fieldType: "dropdown",
      placeholder: "Select status",
      defaultValue: "PAUSED",
      requiredField: true,
      fieldOptions: { values: ["ENABLED", "PAUSED"] },
    },
    {
      fieldLabel: "Daily Budget (USD)",
      fieldType: "number",
      placeholder: "Enter daily budget",
      defaultValue: "",
      requiredField: true,
    },
    {
      fieldLabel: "Start Date",
      fieldType: "date",
      placeholder: "YYYY-MM-DD",
      defaultValue: "2026-09-05",
      requiredField: true,
    },
    {
      fieldLabel: "Seed Keywords",
      fieldType: "textarea",
      placeholder: "Enter seed keywords",
      defaultValue: "",
      requiredField: true,
    },
  ],
};

describe("parseSemiFields", () => {
  const fields = parseSemiFields(LIVE);

  it("reads every field the agent asked for", () => {
    expect(fields).toHaveLength(4);
    expect(fields.map((f) => f.type)).toEqual(["dropdown", "number", "date", "textarea"]);
  });

  it("keeps a dropdown's options and its default", () => {
    const status = fields[0]!;
    expect(status.options).toEqual(["ENABLED", "PAUSED"]);
    // PAUSED by default, which is the agent being careful — a campaign that
    // starts paused spends nothing until someone looks at it.
    expect(status.defaultValue).toBe("PAUSED");
  });

  it("keeps the label verbatim, brackets and all", () => {
    // "Daily Budget (USD)" is the key the answer goes back under. Slugifying it
    // would mean un-slugifying on the way out, and that mapping is not ours.
    expect(fields[1]!.label).toBe("Daily Budget (USD)");
  });

  it("falls back to text for a type we do not recognise", () => {
    // A field the agent is waiting for must be askable even if its rendering
    // hint is unfamiliar.
    const odd = parseSemiFields({ output: [{ fieldLabel: "Odd", fieldType: "colour-picker" }] });
    expect(odd[0]!.type).toBe("text");
  });

  it("treats anything but an explicit false as required", () => {
    expect(parseSemiFields({ output: [{ fieldLabel: "A" }] })[0]!.required).toBe(true);
    expect(
      parseSemiFields({ output: [{ fieldLabel: "A", requiredField: false }] })[0]!.required,
    ).toBe(false);
  });

  it("drops a field with no label, which has no key to answer under", () => {
    expect(parseSemiFields({ output: [{ fieldType: "text" }] })).toEqual([]);
  });

  it("returns nothing for an unreadable reply rather than throwing", () => {
    expect(parseSemiFields(null)).toEqual([]);
    expect(parseSemiFields({ success: false })).toEqual([]);
  });
});

describe("readSemiAnswers", () => {
  const fields = parseSemiFields(LIVE);

  it("collects answers under the agent's own labels", () => {
    const form = new FormData();
    form.append(`${SEMI_FIELD_PREFIX}Status`, "ENABLED");
    form.append(`${SEMI_FIELD_PREFIX}Daily Budget (USD)`, "30");

    const answers = readSemiAnswers(fields, form);
    expect(answers["Status"]).toBe("ENABLED");
    expect(answers["Daily Budget (USD)"]).toBe("30");
  });

  /**
   * REGRESSION. The location cascade posts the country, state, city and
   * postcode as companion inputs beside its schema field. Reading only the
   * schema labels dropped all four, so `expandLocationAnswers` saw a kind of
   * place and no place, and the campaign went out targeting nothing.
   */
  it("collects the companion inputs a control posts beside its field", () => {
    const form = new FormData();
    form.append(`${SEMI_FIELD_PREFIX}Status`, "ENABLED");
    form.append(`${SEMI_FIELD_PREFIX}Status_country`, "United States");
    form.append(`${SEMI_FIELD_PREFIX}Status_city`, "Newark");

    const answers = readSemiAnswers(fields, form);
    expect(answers["Status_country"]).toBe("United States");
    expect(answers["Status_city"]).toBe("Newark");
  });

  it("leaves out a companion nobody filled in, rather than adding a blank", () => {
    const form = new FormData();
    form.append(`${SEMI_FIELD_PREFIX}Status`, "ENABLED");
    form.append(`${SEMI_FIELD_PREFIX}Status_zip`, "");

    expect("Status_zip" in readSemiAnswers(fields, form)).toBe(false);
  });

  it("names every required field left blank", () => {
    const missing = missingSemiAnswers(fields, { Status: "ENABLED" });
    expect(missing).toEqual(["Daily Budget (USD)", "Start Date", "Seed Keywords"]);
  });

  it("is satisfied when every required field has an answer", () => {
    expect(
      missingSemiAnswers(fields, {
        Status: "PAUSED",
        "Daily Budget (USD)": "30",
        "Start Date": "2026-09-05",
        "Seed Keywords": "flights, cheap flights",
      }),
    ).toEqual([]);
  });
});


describe("the wrapper n8n actually sends", () => {
  /**
   * The probe returned `{ output: [...] }`; the live app's own capture is
   * `[{ output: [...] }]` — an array wrapping the object. Both are the same
   * reply, and reading only one of them yields an empty form for a campaign the
   * agent is waiting on.
   */
  const WRAPPED = [
    {
      output: [
        {
          fieldLabel: "Daily Budget (USD)",
          fieldType: "number",
          placeholder: "Enter daily budget",
          // A NUMBER, not a string, unlike every other default.
          defaultValue: 20,
          requiredField: true,
        },
        {
          fieldLabel: "App Store",
          fieldType: "dropdown",
          defaultValue: "",
          requiredField: true,
          fieldOptions: { values: ["GOOGLE_APP_STORE", "APPLE_APP_STORE"] },
        },
      ],
    },
  ];

  it("reads the array-wrapped form", () => {
    const fields = parseSemiFields(WRAPPED);
    expect(fields).toHaveLength(2);
    expect(fields[1]!.options).toEqual(["GOOGLE_APP_STORE", "APPLE_APP_STORE"]);
  });

  it("accepts a numeric default without dropping it", () => {
    expect(parseSemiFields(WRAPPED)[0]!.defaultValue).toBe("20");
  });
});

describe("expandLocationAnswers", () => {
  const NEWARK = {
    "Location Type": "City",
    "Location Type_country": "United States",
    "Location Type_state": "New Jersey",
    "Location Type_city": "Newark",
  };

  it("turns the cascade into the fields the executor reads", () => {
    const extra = expandLocationAnswers(NEWARK);

    // Narrowest first, the way a person says an address — "Newark" alone is
    // ambiguous across the twenty-odd of them.
    expect(extra["Location Type"]).toBe("Newark > New Jersey > United States");
    expect(extra["Location Type_country"]).toBe("United States");
    expect(extra["Location Type_state"]).toBe("New Jersey");
    expect(extra["Location Type_city"]).toBe("Newark");
    expect(extra["Location Type_locations"]).toEqual([
      {
        type: "city",
        display: "Newark, New Jersey, United States",
        country: "United States",
        state: "New Jersey",
        city: "Newark",
      },
    ]);
  });

  it("keeps a country-only target to the one level", () => {
    const extra = expandLocationAnswers({
      "Location Type": "Country",
      "Location Type_country": "India",
    });
    expect(extra["Location Type"]).toBe("India");
    expect(extra["Location Type_locations"]).toEqual([
      { type: "country", display: "India", country: "India" },
    ]);
  });

  /**
   * The kind is a decision about how broadly to spend, not a side effect of
   * which boxes happen to hold text. Narrowing back from Zip to City must
   * drop the postcode, or the campaign targets something the customer
   * deliberately backed out of.
   */
  it("stops at the kind chosen, ignoring levels below it", () => {
    const extra = expandLocationAnswers({ ...NEWARK, "Location Type_zip": "07102" });
    expect(extra["Location Type_zip"]).toBeUndefined();
    expect(extra["Location Type"]).toBe("Newark > New Jersey > United States");
  });

  it("carries the postcode when that is what was chosen", () => {
    const extra = expandLocationAnswers({
      ...NEWARK,
      "Location Type": "Zip Code",
      "Location Type_zip": "07102",
    });
    expect(extra["Location Type_zip"]).toBe("07102");
    expect(extra["Location Type"]).toBe("07102 > Newark > New Jersey > United States");
  });

  it("expands nothing when every level was left blank", () => {
    // Better to send the kind alone than to invent a location.
    expect(expandLocationAnswers({ "Location Type": "State" })).toEqual({});
  });

  it("ignores fields that are not a location kind", () => {
    expect(expandLocationAnswers({ Status: "PAUSED" })).toEqual({});
  });
});

describe("withLocationField", () => {
  /**
   * `meta-ads-semi` answers `{ received: true }` and no schema at all
   * (re-probed 2026-09-04), so a Meta campaign had no location question on the
   * details form — the only place it was asked was the free-text "City or
   * area" on the setup page.
   */
  it("adds the location question when the agent asked nothing", () => {
    const fields = withLocationField([]);
    expect(fields).toHaveLength(1);
    expect(fields[0]!.label).toBe("Location Type");
    expect(fields[0]!.options).toEqual(["Country", "State", "City", "Zip Code"]);
  });

  it("leaves the agent's own wording alone when it asked", () => {
    const own = parseSemiFields({
      output: [
        {
          fieldLabel: "Location Type",
          fieldType: "dropdown",
          defaultValue: "City",
          requiredField: true,
          fieldOptions: { values: ["Country", "City"] },
        },
      ],
    });

    const fields = withLocationField(own);
    expect(fields).toHaveLength(1);
    // Its options, not ours.
    expect(fields[0]!.options).toEqual(["Country", "City"]);
  });

  it("keeps the agent's other fields and puts the location last", () => {
    const fields = withLocationField(parseSemiFields(LIVE));
    expect(fields).toHaveLength(parseSemiFields(LIVE).length + 1);
    expect(fields.at(-1)!.label).toBe("Location Type");
  });
});

/**
 * The ad type comes from the details form the agent generates — `Ad Type`, a
 * dropdown of Image / Video / Carousel. It was hardcoded to "image", then
 * briefly asked at setup, before landing here.
 */
describe("adTypeFromAnswers", () => {
  it("reads the agent's own Ad Type field", () => {
    expect(adTypeFromAnswers({ "Ad Type": "Video" })).toBe("video");
  });

  it("passes Carousel through rather than collapsing it", () => {
    // It is a real option in the agent's dropdown. Mapping it onto "image"
    // would ask the creative writer for the wrong thing and look like it
    // worked.
    expect(adTypeFromAnswers({ "Ad Type": "Carousel" })).toBe("carousel");
  });

  it("matches the label however it is spelled", () => {
    expect(adTypeFromAnswers({ "Ad Format": "video" })).toBe("video");
    expect(adTypeFromAnswers({ "Creative Type": "video" })).toBe("video");
    expect(adTypeFromAnswers({ "Media type": "video" })).toBe("video");
  });

  it("defaults to image when the field is absent or blank", () => {
    expect(adTypeFromAnswers({})).toBe("image");
    expect(adTypeFromAnswers({ "Ad Type": "   " })).toBe("image");
    expect(adTypeFromAnswers({ "Daily Budget (USD)": "30" })).toBe("image");
  });
});

describe("several postcodes and the checks behind the details form (2026-09-30)", () => {
  const location = { label: "Location Type", type: "dropdown", placeholder: "", defaultValue: "", required: true, options: ["Country", "State", "City", "Zip Code"] } as const;
  const dates = [
    { label: "Start Date", type: "date", placeholder: "", defaultValue: "", required: true, options: [] },
    { label: "End Date", type: "date", placeholder: "", defaultValue: "", required: true, options: [] },
  ] as const;
  const fields = [location, ...dates].map((f) => ({ ...f, options: [...f.options] }));

  it("reads every postcode posted, once each", () => {
    const form = new FormData();
    form.append(`${SEMI_FIELD_PREFIX}Location Type`, "Zip Code");
    form.append(`${SEMI_FIELD_PREFIX}Location Type_country`, "United States");
    for (const zip of ["08820", "07080", "08820", " "]) form.append(`${SEMI_FIELD_PREFIX}Location Type_zip`, zip);
    const answers = readSemiAnswers(fields, form);
    expect(answers["Location Type_zip"]).toBe("08820, 07080");
    expect(answers["Location Type_state"]).toBeUndefined();
  });

  it("sends one location per postcode", () => {
    const extra = expandLocationAnswers({
      "Location Type": "Zip Code",
      "Location Type_country": "United States",
      "Location Type_zip": "08820, 07080",
    });
    expect(extra["Location Type_locations"]).toEqual([
      { type: "zip", display: "08820, United States", country: "United States", zip: "08820" },
      { type: "zip", display: "07080, United States", country: "United States", zip: "07080" },
    ]);
  });

  it("needs only the country and a postcode when targeting by postcode", () => {
    expect(semiFormProblems(fields, { "Location Type": "Zip Code", "Location Type_country": "United States", "Location Type_zip": "07080" })).toEqual([]);
    expect(semiFormProblems(fields, { "Location Type": "Zip Code", "Location Type_zip": "07080" })).toEqual([
      "Choose the country for the postcodes.",
    ]);
    expect(semiFormProblems(fields, { "Location Type": "Zip Code", "Location Type_country": "United States" })).toEqual([
      "Add at least one postcode.",
    ]);
  });

  it("still needs every level above a state or city", () => {
    expect(semiFormProblems(fields, { "Location Type": "City", "Location Type_country": "US", "Location Type_city": "Edison" })).toEqual([
      "Choose the country, state and city to target.",
    ]);
  });

  it("refuses an end date on or before the start date", () => {
    const base = { "Location Type": "Country", "Location Type_country": "US" };
    expect(semiFormProblems(fields, { ...base, "Start Date": "2026-10-02", "End Date": "2026-09-30" })).toEqual([
      "End Date must be after Start Date.",
    ]);
    expect(semiFormProblems(fields, { ...base, "Start Date": "2026-10-02", "End Date": "2026-10-02" })).toHaveLength(1);
    expect(semiFormProblems(fields, { ...base, "Start Date": "2026-10-02", "End Date": "2026-10-03" })).toEqual([]);
  });

  it("finds the date pair by label", () => {
    expect(dateRangeFields(fields).start?.label).toBe("Start Date");
    expect(dateRangeFields(fields).end?.label).toBe("End Date");
  });
});

describe("picked locations on the details form (2026-10-01)", () => {
  const LOCATION = {
    label: "Location Type",
    type: "dropdown",
    required: true,
    options: ["Country", "State", "City", "Zip Code"],
    placeholder: "",
    defaultValue: "",
  } as const;
  const US = "United States";
  const PICKS = [
    { type: "state", country: US, state: "New York" },
    { type: "state", country: US, state: "California" },
    { type: "city", country: US, state: "California", city: "Los Angeles" },
    { type: "city", country: US, state: "Texas", city: "Dallas" },
    { type: "zip", country: US, zip: "10001", state: "New York", city: "New York" },
    { type: "zip", country: US, zip: "90210" },
  ];

  function post(picks: unknown) {
    const form = new FormData();
    form.set(`${SEMI_FIELD_PREFIX}Location Type_picks`, JSON.stringify(picks));
    return readSemiAnswers([LOCATION as never], form);
  }

  it("reads every pick and names the levels used", () => {
    const answers = post(PICKS);
    expect(answers["Location Type"]).toBe("State, City, Zip Code");
    expect(JSON.parse(answers["Location Type_picks"]!)).toHaveLength(6);
    expect(missingSemiAnswers([LOCATION as never], answers)).toEqual([]);
  });

  it("sends ALL the places, not the last one", () => {
    const extra = expandLocationAnswers(post(PICKS));
    expect(extra["Location Type"]).toBe(
      "New York > United States | California > United States | Los Angeles > California > United States | " +
        "Dallas > Texas > United States | 10001 > United States | 90210 > United States",
    );
    expect(extra["Location Type_country"]).toBe(US);
    expect(extra["Location Type_state"]).toBe("New York, California, Texas");
    expect(extra["Location Type_city"]).toBe("Los Angeles, Dallas");
    expect(extra["Location Type_zip"]).toBe("10001, 90210");
    expect(extra["Location Type_locations"]).toEqual([
      { type: "state", display: "New York, United States", country: US, state: "New York" },
      { type: "state", display: "California, United States", country: US, state: "California" },
      { type: "city", display: "Los Angeles, California, United States", country: US, state: "California", city: "Los Angeles" },
      { type: "city", display: "Dallas, Texas, United States", country: US, state: "Texas", city: "Dallas" },
      { type: "zip", display: "10001, United States", country: US, state: "New York", city: "New York", zip: "10001" },
      { type: "zip", display: "90210, United States", country: US, zip: "90210" },
    ]);
    // The JSON list itself is not sent on.
    expect("Location Type_picks" in extra && extra["Location Type_picks"] === undefined).toBe(true);
    expect(JSON.parse(JSON.stringify({ ...post(PICKS), ...extra }))).not.toHaveProperty("Location Type_picks");
  });

  it("asks for a location when none was added, and says it once", () => {
    const answers = post([]);
    expect(missingSemiAnswers([LOCATION as never], answers)).toEqual([]);
    expect(semiFormProblems([LOCATION as never], answers)).toEqual(["Add at least one location."]);
  });

  it("names an incomplete pick instead of dropping it", () => {
    const answers = post([{ type: "city", country: US, state: "", city: "Dallas" }]);
    expect(semiFormProblems([LOCATION as never], answers)).toEqual(["Choose the state for Dallas."]);
  });

  it("still expands the old single-place answers", () => {
    expect(
      expandLocationAnswers({
        "Location Type": "City",
        "Location Type_country": US,
        "Location Type_state": "New Jersey",
        "Location Type_city": "Newark",
      })["Location Type"],
    ).toBe("Newark > New Jersey > United States");
  });
});

describe("Meta's Targeting OS, and dropdowns held to their options (2026-10-01)", () => {
  const os = (defaultValue: string) =>
    ({ label: "Targeting OS", type: "dropdown", required: true, placeholder: "", defaultValue, options: ["All", "Android", "iOS"] }) as const;

  it("takes All out for Meta and clears it as the default", () => {
    const [field] = adjustSemiFields("meta-ads", [os("All") as never]);
    expect(field!.options).toEqual(["Android", "iOS"]);
    expect(field!.defaultValue).toBe("");
  });

  it("keeps a real default, other fields and other platforms as they were", () => {
    expect(adjustSemiFields("meta-ads", [os("iOS") as never])[0]!.defaultValue).toBe("iOS");
    expect(adjustSemiFields("google-ads", [os("All") as never])[0]!.options).toContain("All");
    const status = { label: "Status", type: "dropdown", required: true, placeholder: "", defaultValue: "All", options: ["All", "PAUSED"] };
    expect(adjustSemiFields("meta-ads", [status as never])[0]).toEqual(status);
  });

  it("reads a refused or unknown dropdown answer as unanswered", () => {
    const fields = adjustSemiFields("meta-ads", [os("") as never]);
    expect(holdDropdownsToOptions(fields, { "Targeting OS": "All" })["Targeting OS"]).toBe("");
    expect(holdDropdownsToOptions(fields, { "Targeting OS": "ios" })["Targeting OS"]).toBe("iOS");
    expect(missingSemiAnswers(fields, holdDropdownsToOptions(fields, { "Targeting OS": "All" }))).toEqual(["Targeting OS"]);
  });

  it("matches a default to its option ignoring case", () => {
    const [field] = parseSemiFields({
      output: [{ fieldLabel: "Status", fieldType: "dropdown", defaultValue: "paused", fieldOptions: { values: ["ENABLED", "PAUSED"] } }],
    });
    expect(field!.defaultValue).toBe("PAUSED");
  });
});

describe("the legacy spec's schema spellings", () => {
  it("reads every alias for every key", () => {
    const [field] = parseSemiFields({
      output: [
        {
          field_label: "Budget Type",
          input_type: "dropdown",
          place_holder: "Pick one",
          default_value: "daily",
          isRequired: false,
          field_options: [{ option: "Daily" }, { label: "Lifetime" }, { value: "Weekly" }, "Monthly"],
        },
      ],
    });
    expect(field).toEqual({
      label: "Budget Type",
      type: "dropdown",
      placeholder: "Pick one",
      defaultValue: "Daily",
      required: false,
      options: ["Daily", "Lifetime", "Weekly", "Monthly"],
    });
  });

  it("falls back to text and to required, and drops a field it cannot name", () => {
    const fields = parseSemiFields([{ name: "Headline" }, { type: "text" }]);
    expect(fields).toEqual([
      { label: "Headline", type: "text", placeholder: "", defaultValue: "", required: true, options: [] },
    ]);
  });

  it("accepts options as a plain list as well as `{ values }`", () => {
    expect(parseSemiFields([{ label: "A", type: "dropdown", options: ["X", "Y"] }])[0]!.options).toEqual(["X", "Y"]);
    expect(parseSemiFields([{ label: "A", type: "dropdown", options: { values: [{ option: "Z" }] } }])[0]!.options).toEqual(["Z"]);
  });

  it("unwraps every container the spec names, and JSON strings", () => {
    const row = { fieldLabel: "Headline", fieldType: "text" };
    for (const key of ["fields", "formFields", "form_fields", "data", "form", "output", "items", "schema"]) {
      expect(parseSemiFields({ [key]: [row] }).map((f) => f.label)).toEqual(["Headline"]);
    }
    expect(parseSemiFields({ success: true, data: { form: { fields: [row] } } })).toHaveLength(1);
    expect(parseSemiFields([{ output: JSON.stringify({ schema: [row] }) }])).toHaveLength(1);
    expect(parseSemiFields(JSON.stringify([row, row]))).toHaveLength(2);
    // An unrelated list beside the fields is not mistaken for them.
    expect(parseSemiFields({ data: [{ id: 1 }], output: [row] }).map((f) => f.label)).toEqual(["Headline"]);
  });

  it("still reads the live schemas exactly as before", () => {
    expect(parseSemiFields(LIVE).map((f) => [f.label, f.type, f.defaultValue, f.required])).toEqual([
      ["Status", "dropdown", "PAUSED", true],
      ["Daily Budget (USD)", "number", "", true],
      ["Start Date", "date", "2026-09-05", true],
      ["Seed Keywords", "textarea", "", true],
    ]);
  });
});

describe("website and phone fields", () => {
  const field = (label: string, type = "text") => parseSemiFields([{ fieldLabel: label, fieldType: type }])[0]!;

  it("recognises a website field by type or label, but not a website NAME", () => {
    expect(isUrlField(field("Landing page", "url"))).toBe(true);
    expect(isUrlField(field("Final URL"))).toBe(true);
    expect(isUrlField(field("Website"))).toBe(true);
    expect(isUrlField(field("Website name"))).toBe(false);
    expect(isUrlField(field("Headline"))).toBe(false);
  });

  it("puts https:// in front of a bare host, and leaves a full address alone", () => {
    const fields = [field("Website URL"), field("Headline")];
    const form = new FormData();
    form.append(`${SEMI_FIELD_PREFIX}Website URL`, "example.com/offer");
    form.append(`${SEMI_FIELD_PREFIX}Headline`, "example.com");
    const answers = readSemiAnswers(fields, form);
    expect(answers["Website URL"]).toBe("https://example.com/offer");
    expect(answers["Headline"]).toBe("example.com");

    const full = new FormData();
    full.append(`${SEMI_FIELD_PREFIX}Website URL`, "http://example.com");
    expect(readSemiAnswers(fields, full)["Website URL"]).toBe("http://example.com");
    expect(readSemiAnswers(fields, new FormData())["Website URL"]).toBe("");
  });

  it("recognises a phone field by type or label, not a mobile app", () => {
    expect(isPhoneField(field("Contact", "phone"))).toBe(true);
    expect(field("Contact", "phone").type).toBe("tel");
    expect(isPhoneField(field("WhatsApp number"))).toBe(true);
    expect(isPhoneField(field("Mobile number"))).toBe(true);
    expect(isPhoneField(field("Mobile app name"))).toBe(false);
  });

  it("sends the number with the picked country code, and drops a leading 0", () => {
    const fields = [field("Phone number")];
    const form = new FormData();
    form.append(`${SEMI_FIELD_PREFIX}Phone number`, "098765 43210");
    form.append(`${SEMI_FIELD_PREFIX}Phone number${DIAL_SUFFIX}`, "IN");
    expect(readSemiAnswers(fields, form)["Phone number"]).toBe("+919876543210");

    // Typed with its own +: kept as typed, whatever was picked.
    const typed = new FormData();
    typed.append(`${SEMI_FIELD_PREFIX}Phone number`, "+44 20 7946 0958");
    typed.append(`${SEMI_FIELD_PREFIX}Phone number${DIAL_SUFFIX}`, "IN");
    expect(readSemiAnswers(fields, typed)["Phone number"]).toBe("+442079460958");
  });

  it("asks for the country code, and for a number long enough to be one", () => {
    const fields = [field("Phone number")];
    expect(semiFormProblems(fields, { "Phone number": "9876543210" })).toEqual([
      "Choose the country code for Phone number.",
    ]);
    expect(semiFormProblems(fields, { "Phone number": "+9112345" })).toEqual([PHONE_PROBLEM]);
    expect(semiFormProblems(fields, { "Phone number": "+919876543210" })).toEqual([]);
    // Singapore's 8 digits are a real number, which the old 10-digit rule refused.
    expect(semiFormProblems(fields, { "Phone number": "+6561234567" })).toEqual([]);
    // Empty is the required check's to report.
    expect(semiFormProblems(fields, { "Phone number": "" })).toEqual([]);
    expect(PHONE_PROBLEM).toBe("Enter a valid phone number");
  });
});

describe("an age question on the details form (2026-10-08)", () => {
  const AGE: SemiFieldFixture = { label: "Age Range", type: "text", placeholder: "", defaultValue: "", required: true, options: [] };

  it("is recognised by its label, whatever the agent attached", () => {
    expect(isAgeField(AGE)).toBe(true);
    expect(isAgeField({ ...AGE, label: "Target ages" })).toBe(true);
    expect(isAgeField({ ...AGE, label: "Age group" })).toBe(true);
    for (const label of ["Page URL", "Image", "Language", "Stage", "Message"]) {
      expect(isAgeField({ ...AGE, label })).toBe(false);
    }
    // Whatever the agent attaches — options on a text field, or a dropdown —
    // it is Meta's age ticks (2026-10-08: LinkedIn's "Targeting Age" arrived
    // with options and stayed a typed box).
    expect(isAgeField({ ...AGE, label: "Targeting Age", options: ["18-24"] })).toBe(true);
    expect(isAgeField({ ...AGE, type: "dropdown", options: ["18+", "25+"] })).toBe(true);
  });

  it("reads the ticked bands as one line, and All as All", () => {
    const form = new FormData();
    form.append(`${SEMI_FIELD_PREFIX}Age Range`, "25-34");
    form.append(`${SEMI_FIELD_PREFIX}Age Range`, "35-44");
    expect(readSemiAnswers([AGE], form)["Age Range"]).toBe("25-34, 35-44");

    const all = new FormData();
    for (const band of ["All", "18-24", "25-34"]) all.append(`${SEMI_FIELD_PREFIX}Age Range`, band);
    expect(readSemiAnswers([AGE], all)["Age Range"]).toBe("All");
  });

  it("drops anything that is not one of the bands", () => {
    const form = new FormData();
    form.append(`${SEMI_FIELD_PREFIX}Age Range`, "25-34");
    form.append(`${SEMI_FIELD_PREFIX}Age Range`, "12-17");
    expect(readSemiAnswers([AGE], form)["Age Range"]).toBe("25-34");
  });

  it("names a required age left unticked", () => {
    expect(missingSemiAnswers([AGE], { "Age Range": "" })).toContain("Age Range");
  });
});

describe("an age question the agent sent as a dropdown", () => {
  it("keeps the ticked bands rather than holding them to the agent's options", () => {
    const field: SemiFieldFixture = { label: "Targeting Age", type: "dropdown", placeholder: "", defaultValue: "", required: true, options: ["18+", "25+"] };
    expect(holdDropdownsToOptions([field], { "Targeting Age": "25-34, 35-44" })["Targeting Age"]).toBe("25-34, 35-44");
  });
});
