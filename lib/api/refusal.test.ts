import { refusalOf } from "./refusal";

describe("refusalOf", () => {
  it("is null for anything that is not an explicit refusal", () => {
    expect(refusalOf({ success: true })).toBeNull();
    expect(refusalOf({ output: "plan" })).toBeNull();
    expect(refusalOf(null)).toBeNull();
    expect(refusalOf("ok")).toBeNull();
    expect(refusalOf([])).toBeNull();
  });

  it("returns the backend's reason for a 200 refusal", () => {
    expect(refusalOf({ success: false, error: "Invalid signature" })).toBe("Invalid signature");
    expect(refusalOf({ success: false, message: "No such account" })).toBe("No such account");
  });

  it("reads an n8n single-element array", () => {
    expect(refusalOf([{ success: false, error: "nope" }])).toBe("nope");
  });

  it("gives a generic reason when none is sent", () => {
    expect(refusalOf({ success: false })).toBe("The request was refused.");
    expect(refusalOf({ success: false, error: "  " })).toBe("The request was refused.");
  });
});
