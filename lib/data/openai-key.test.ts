import { OPENAI_KEY_COOKIE, parseKeyCookie, readApiKeyForm } from "./openai-key";

/**
 * The customer's OpenAI key: read from the form, held in a cookie, and shown
 * back to them without being shown back to them.
 *
 * The cookie helpers that touch `next/headers` are not tested — that is the
 * same line every other cookie module here draws. What is tested is the part
 * with decisions in it.
 */

describe("readApiKeyForm", () => {
  it("takes the key and trims what a paste brings with it", () => {
    const form = new FormData();
    form.set("apiKey", "  sk-proj-abc123  \n");
    expect(readApiKeyForm(form)).toBe("sk-proj-abc123");
  });

  it("treats an empty or whitespace-only box as no key", () => {
    const empty = new FormData();
    empty.set("apiKey", "   ");
    expect(readApiKeyForm(empty)).toBe("");
    expect(readApiKeyForm(new FormData())).toBe("");
  });
});

describe("parseKeyCookie", () => {
  it("reads a stored key back", () => {
    expect(parseKeyCookie("sk-proj-abc123")).toBe("sk-proj-abc123");
  });

  it("treats absent or blank as not connected", () => {
    expect(parseKeyCookie(undefined)).toBeNull();
    expect(parseKeyCookie("")).toBeNull();
    expect(parseKeyCookie("   ")).toBeNull();
  });
});

describe("the cookie name", () => {
  it("carries the leadbyte_ prefix, so signing out sweeps it", () => {
    // `lib/auth/sign-out.ts` clears by prefix. A key left behind on a shared
    // browser would be spent by whoever signs in next — the same class of bug
    // as the analysis job id that leaked between accounts.
    expect(OPENAI_KEY_COOKIE.startsWith("leadbyte_")).toBe(true);
  });
});
