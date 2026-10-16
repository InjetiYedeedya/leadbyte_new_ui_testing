import { formatEin, readCheckoutForm, validateCheckoutForm, type CheckoutFields } from "./checkout-form";

const VALID: CheckoutFields = {
  companyName: "Acme Inc",
  ein: "12-3456789",
  billingFirstName: "Jane",
  billingLastName: "Doe",
  address: "1 Main St",
  zipCode: "90210",
  email: "jane@acme.com",
  gstin: "",
};

describe("formatEin", () => {
  it("inserts the dash after two digits", () => {
    expect(formatEin("123456789")).toBe("12-3456789");
  });

  it("strips anything that isn't a digit", () => {
    expect(formatEin("12-3456789")).toBe("12-3456789");
    expect(formatEin("ab12cd3456789")).toBe("12-3456789");
  });

  it("does not add the dash before there are two digits to put it after", () => {
    expect(formatEin("1")).toBe("1");
  });

  it("caps at nine digits, ignoring anything typed after", () => {
    expect(formatEin("1234567899999")).toBe("12-3456789");
  });
});

describe("readCheckoutForm", () => {
  it("trims whitespace from every field", () => {
    const data = new FormData();
    data.set("companyName", "  Acme Inc  ");
    data.set("email", " jane@acme.com ");
    const fields = readCheckoutForm(data);
    expect(fields.companyName).toBe("Acme Inc");
    expect(fields.email).toBe("jane@acme.com");
  });

  it("reads a missing field as an empty string, not null or undefined", () => {
    const fields = readCheckoutForm(new FormData());
    expect(fields.companyName).toBe("");
    expect(fields.ein).toBe("");
  });
});

describe("validateCheckoutForm", () => {
  it("accepts a fully filled, correctly shaped form", () => {
    expect(validateCheckoutForm(VALID)).toEqual([]);
  });

  it("rejects an EIN that isn't XX-XXXXXXX", () => {
    expect(validateCheckoutForm({ ...VALID, ein: "123456789" })).toContain(
      "EIN must be in the form XX-XXXXXXX.",
    );
  });

  it("rejects a ZIP that is neither 5 nor 9 digits", () => {
    expect(validateCheckoutForm({ ...VALID, zipCode: "9021" })).toContain(
      "Enter a valid ZIP code.",
    );
  });

  it("accepts the extended ZIP+4 form", () => {
    expect(validateCheckoutForm({ ...VALID, zipCode: "90210-1234" })).toEqual([]);
  });

  it("rejects an email with no @ or no domain", () => {
    expect(validateCheckoutForm({ ...VALID, email: "not-an-email" })).toContain(
      "Enter a valid email address.",
    );
  });

  it("reports every missing field at once, not just the first", () => {
    const errors = validateCheckoutForm({
      companyName: "",
      ein: "",
      billingFirstName: "",
      billingLastName: "",
      address: "",
      zipCode: "",
      email: "",
      gstin: "",
    });
    expect(errors).toHaveLength(7);
  });
});

describe("validateCheckoutForm for an Indian company (INR)", () => {
  const INDIA: CheckoutFields = { ...VALID, ein: "", zipCode: "560001", gstin: "" };

  it("needs no EIN, and takes a 6-digit PIN code", () => {
    expect(validateCheckoutForm(INDIA, "INR")).toEqual([]);
  });

  it("rejects a US ZIP as a PIN code", () => {
    expect(validateCheckoutForm({ ...INDIA, zipCode: "90210" }, "INR")).toContain("Enter a valid 6-digit PIN code.");
  });

  it("accepts a well-formed GSTIN and refuses a malformed one", () => {
    expect(validateCheckoutForm({ ...INDIA, gstin: "22AAAAA0000A1Z5" }, "INR")).toEqual([]);
    expect(validateCheckoutForm({ ...INDIA, gstin: "22AAAAA" }, "INR")).toContain(
      "GSTIN must be 15 characters, like 22AAAAA0000A1Z5.",
    );
  });
});
