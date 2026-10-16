import {
  parseEmailCookie,
  parseMailboxRecord,
  readEmailCallback,
  readEmailCallbackFailure,
  serialiseMailbox,
} from "@/lib/data/email-callback";

/** The URL n8n is configured with, as given by the backend team. */
const success =
  "?status=success&platform=gmail&email=apps%40ntimes.ai&name=apps%20ntimes";

const paramsOf = (query: string) => new URL(`http://x/cb${query}`).searchParams;

describe("readEmailCallback", () => {
  it("reads the mailbox n8n sends back", () => {
    expect(readEmailCallback(paramsOf(success))).toEqual({
      address: "apps@ntimes.ai",
      name: "apps ntimes",
    });
  });

  it("decodes a name with punctuation in it", () => {
    // n8n encodeURIComponent()s the name; URLSearchParams decodes it.
    expect(
      readEmailCallback(paramsOf("?status=success&email=a%40b.com&name=Apps%20%26%20Co."))?.name,
    ).toBe("Apps & Co.");
  });

  it("keeps the address when the provider sent no name", () => {
    expect(readEmailCallback(paramsOf("?status=success&email=a%40b.com"))).toEqual({
      address: "a@b.com",
      name: "",
    });
  });

  it("is not a connection when the provider reported an error", () => {
    expect(readEmailCallback(paramsOf("?status=error&email=a%40b.com"))).toBeNull();
  });

  it("is not a connection when success names no mailbox", () => {
    // Showing "connected" with no address is worse than showing nothing.
    expect(readEmailCallback(paramsOf("?status=success&platform=gmail"))).toBeNull();
    expect(readEmailCallback(paramsOf("?status=success&email=%20"))).toBeNull();
  });

  it("is not a connection when there is no status at all", () => {
    expect(readEmailCallback(paramsOf("?email=a%40b.com"))).toBeNull();
  });
});

describe("the cookie round trip", () => {
  it("survives being written and read back", () => {
    const mailbox = { address: "apps@ntimes.ai", name: "apps ntimes" };

    expect(parseEmailCookie(serialiseMailbox(mailbox))).toEqual(mailbox);
  });

  it("treats a missing or unreadable cookie as unknown, never as an error", () => {
    expect(parseEmailCookie(undefined)).toBeNull();
    expect(parseEmailCookie("")).toBeNull();
    expect(parseEmailCookie("not json")).toBeNull();
    expect(parseEmailCookie('{"name":"apps ntimes"}')).toBeNull();
  });
});

describe("parseMailboxRecord", () => {
  it("reads the account the legacy app stored as JSON", () => {
    expect(
      parseMailboxRecord({
        email: "apps@ntimes.ai",
        Status: "Done",
        selectedAccount: JSON.stringify({ gmail_address: "sales@ntimes.ai", name: "Sales" }),
      }),
    ).toEqual({ address: "sales@ntimes.ai", name: "Sales" });
  });

  it("treats a row with no account as connected, without inventing an address", () => {
    // The address is EMPTY, not a placeholder. "Connected mailbox" used to be
    // put here, and it went out as Off-Page SEO's `outreachEmail` and was
    // shown on screen as "Connected mailbox: Connected mailbox" (2026-09-30).
    expect(parseMailboxRecord({ email: "apps@ntimes.ai", Status: "Done" })).toEqual({
      address: "",
      name: "",
    });
  });

  it("reads the address under the other spellings a mailbox row uses", () => {
    expect(parseMailboxRecord({ Status: "Done", login_email: "hi@ntimes.ai" })?.address).toBe(
      "hi@ntimes.ai",
    );
    expect(
      parseMailboxRecord({ Status: "Done", selectedAccount: JSON.stringify({ login_email: "x@ntimes.ai" }) })
        ?.address,
    ).toBe("x@ntimes.ai");
  });

  it("is null when there is no row", () => {
    expect(parseMailboxRecord(null)).toBeNull();
    expect(parseMailboxRecord(undefined)).toBeNull();
  });
});

describe("readEmailCallbackFailure", () => {
  const read = (query: string) => readEmailCallbackFailure(new URLSearchParams(query));

  it("names a missing Gmail permission, so the page can say which to allow", () => {
    expect(read("status=error&reason=missing_scope")).toBe("missing-scope");
    expect(read("status=error&error=insufficient_scope")).toBe("missing-scope");
    expect(read("status=error&reason=MISSING_SCOPES")).toBe("missing-scope");
  });

  it("treats anything else as a plain failure", () => {
    expect(read("status=error")).toBe("failed");
    expect(read("status=error&reason=access_denied")).toBe("failed");
    expect(read("")).toBe("failed");
  });
});
