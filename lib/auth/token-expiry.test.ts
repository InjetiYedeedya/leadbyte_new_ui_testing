import { isTokenExpired, tokenExpiresAt } from "./token-expiry";

function jwt(payload: object): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${encode({ alg: "HS256" })}.${encode(payload)}.signature`;
}

describe("tokenExpiresAt", () => {
  it("reads exp in milliseconds", () => {
    expect(tokenExpiresAt(jwt({ exp: 1_700_000_000 }))).toBe(1_700_000_000_000);
  });

  it("is null for anything it cannot read", () => {
    expect(tokenExpiresAt(undefined)).toBeNull();
    expect(tokenExpiresAt("")).toBeNull();
    expect(tokenExpiresAt("not-a-jwt")).toBeNull();
    expect(tokenExpiresAt("a.%%%.c")).toBeNull();
    expect(tokenExpiresAt(jwt({ sub: "x" }))).toBeNull();
    expect(tokenExpiresAt(jwt({ exp: "soon" }))).toBeNull();
  });

  it("handles url-safe characters", () => {
    // "?>" encodes to "Pz4" in base64url — exercises the - and _ alphabet.
    expect(tokenExpiresAt(jwt({ exp: 2_000_000_000, note: "??>>~~" }))).toBe(2_000_000_000_000);
  });
});

describe("isTokenExpired", () => {
  const now = 1_700_000_000_000;

  it("is true once exp has passed", () => {
    expect(isTokenExpired(jwt({ exp: now / 1000 - 60 }), now)).toBe(true);
  });

  it("is true inside the margin", () => {
    expect(isTokenExpired(jwt({ exp: now / 1000 + 10 }), now)).toBe(true);
  });

  it("is false while the token is good", () => {
    expect(isTokenExpired(jwt({ exp: now / 1000 + 3600 }), now)).toBe(false);
  });

  it("is false when the expiry cannot be read — the backend decides", () => {
    expect(isTokenExpired("opaque-token", now)).toBe(false);
    expect(isTokenExpired(undefined, now)).toBe(false);
  });
});
