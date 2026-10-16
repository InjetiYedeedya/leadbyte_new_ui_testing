import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  NAME_MAX,
  profileEditPayload,
  readProfileEdit,
  validateProfileEdit,
  type ProfileEdit,
} from "./profile-edit";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.append(name, value);
  return data;
}

const VALID: ProfileEdit = {
  businessName: "NovaFlow",
  businessType: "B2B SaaS",
  description: "Workflow automation for operations teams that have outgrown spreadsheets.",
};

const edit = (over: Partial<ProfileEdit> = {}): ProfileEdit => ({ ...VALID, ...over });

describe("readProfileEdit", () => {
  it("reads and trims the three fields", () => {
    expect(
      readProfileEdit(
        form({ businessName: "  NovaFlow ", businessType: " B2B SaaS ", description: " Does things. " }),
      ),
    ).toEqual({ businessName: "NovaFlow", businessType: "B2B SaaS", description: "Does things." });
  });

  it("reads an untouched form as empty rather than undefined", () => {
    expect(readProfileEdit(form({}))).toEqual({
      businessName: "",
      businessType: "",
      description: "",
    });
  });
});

describe("validateProfileEdit", () => {
  it("accepts a correction that can be used", () => {
    expect(validateProfileEdit(edit())).toEqual([]);
  });

  it("insists on a name and a description", () => {
    expect(validateProfileEdit(edit({ businessName: "" }))).toHaveLength(1);
    expect(validateProfileEdit(edit({ description: "" }))).toHaveLength(1);
  });

  /**
   * The field being replaced is routinely a mangled sentence fragment.
   * Accepting a three-word replacement trades one unusable value for another.
   */
  it("refuses a description too short to be one", () => {
    expect(validateProfileEdit(edit({ description: "ops tool" }))[0]).toContain(
      String(DESCRIPTION_MIN),
    );
    expect(validateProfileEdit(edit({ description: "x".repeat(DESCRIPTION_MIN) }))).toEqual([]);
  });

  it("caps the lengths it stores", () => {
    expect(validateProfileEdit(edit({ description: "x".repeat(DESCRIPTION_MAX + 1) }))).toHaveLength(1);
    expect(validateProfileEdit(edit({ businessName: "x".repeat(NAME_MAX + 1) }))).toHaveLength(1);
  });

  /**
   * Free text on purpose: a customer who calls themselves something we have no
   * category for is describing their business correctly.
   */
  it("accepts any business type, including none", () => {
    expect(validateProfileEdit(edit({ businessType: "" }))).toEqual([]);
    expect(validateProfileEdit(edit({ businessType: "Regenerative goat dairy" }))).toEqual([]);
  });

  it("names every problem at once", () => {
    expect(validateProfileEdit({ businessName: "", businessType: "", description: "" })).toHaveLength(2);
  });
});

describe("profileEditPayload", () => {
  /**
   * `mapProfile` reads the row's `companyName` into the profile's
   * `businessName`. Writing `businessName` would report success and change
   * nothing anyone can see.
   */
  it("writes the row's spellings, not the profile object's", () => {
    const payload = profileEditPayload(edit());
    expect(payload.companyName).toBe("NovaFlow");
    expect("businessName" in payload).toBe(false);
  });

  /**
   * `email` is this table's partition key and travels in the URL. Repeating it
   * in the body asks DynamoDB to SET a key attribute, which it rejects — the
   * mistake that broke sign-in on 2026-09-02.
   */
  it("can never carry the partition key", () => {
    const payload = profileEditPayload(edit());
    expect(Object.keys(payload).sort()).toEqual(["businessType", "companyName", "description"]);
    expect("email" in payload).toBe(false);
  });
});
