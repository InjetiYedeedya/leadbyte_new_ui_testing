import {
  DIAL_COUNTRIES,
  dialCountry,
  internationalNumber,
  isPlausibleInternational,
  splitInternational,
} from "@/lib/data/dial-codes";

describe("dial codes", () => {
  it("lists each country once, with a digits-only code", () => {
    const isos = DIAL_COUNTRIES.map((country) => country.iso);
    expect(new Set(isos).size).toBe(isos.length);
    for (const country of DIAL_COUNTRIES) expect(country.code).toMatch(/^\d{1,3}$/);
  });

  it("reads a posted country, and nothing else", () => {
    expect(dialCountry("in")?.code).toBe("91");
    expect(dialCountry("XX")).toBeNull();
    expect(dialCountry("")).toBeNull();
  });

  it("builds the international form from a country and a typed number", () => {
    expect(internationalNumber("GB", "020 7946 0958")).toBe("+442079460958");
    expect(internationalNumber("US", "(212) 555-0100")).toBe("+12125550100");
    expect(internationalNumber("", "9876543210")).toBe("9876543210");
    expect(internationalNumber("IN", "  ")).toBe("");
  });

  it("splits a stored number back into its country and the rest", () => {
    expect(splitInternational("+919876543210")).toEqual({ iso: "IN", national: "9876543210" });
    expect(splitInternational("+353861234567")).toEqual({ iso: "IE", national: "861234567" });
    // A shared code shows as its main country, or the one picked before.
    expect(splitInternational("+12125550100").iso).toBe("US");
    expect(splitInternational("+14165550100", "CA")).toEqual({ iso: "CA", national: "4165550100" });
    expect(splitInternational("9876543210")).toEqual({ iso: "", national: "9876543210" });
  });

  it("accepts real lengths and refuses short or bare numbers", () => {
    expect(isPlausibleInternational("+919876543210")).toBe(true);
    expect(isPlausibleInternational("+6561234567")).toBe(true);
    expect(isPlausibleInternational("+9112345")).toBe(false);
    expect(isPlausibleInternational("9876543210")).toBe(false);
    expect(isPlausibleInternational("+1234567890123456")).toBe(false);
  });
});
