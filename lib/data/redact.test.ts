import { redact } from "./redact";

describe("redact", () => {
  it("blanks credential-shaped keys at any depth, and inside JSON strings", () => {
    expect(
      redact({
        email: "a@b.com",
        access_token: "x",
        nested: [{ refreshToken: "y", name: "Acme" }],
        selectedAccount: JSON.stringify({ id: "1", page_access_token: "z" }),
      }),
    ).toEqual({
      email: "a@b.com",
      access_token: "[redacted]",
      nested: [{ refreshToken: "[redacted]", name: "Acme" }],
      selectedAccount: { id: "1", page_access_token: "[redacted]" },
    });
  });

  it("leaves plain values alone", () => {
    expect(redact("hello")).toBe("hello");
    expect(redact(3)).toBe(3);
    expect(redact(null)).toBe(null);
  });
});
