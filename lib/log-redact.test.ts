import { paramNames, redactSecrets } from "./log-redact";

describe("redactSecrets", () => {
  it("hides the WordPress password the On-Page SEO setup sends", () => {
    const out = redactSecrets({ email: "a@b.com", blogApiKey: "hunter2", blogUrl: "https://x.com" });
    expect(out).toEqual({ email: "a@b.com", blogApiKey: "[redacted]", blogUrl: "https://x.com" });
  });

  it("hides secrets at any depth, and keeps the key so its presence shows", () => {
    const out = redactSecrets({ config: { wordpress_password: "p", access_token: "t", api_key: "k" } });
    expect(out).toEqual({
      config: { wordpress_password: "[redacted]", access_token: "[redacted]", api_key: "[redacted]" },
    });
  });

  it("leaves an empty secret field visible as empty", () => {
    expect(redactSecrets({ password: "" })).toEqual({ password: "" });
  });
});

describe("paramNames", () => {
  it("lists names, never values", () => {
    expect(paramNames(new URLSearchParams("code=secret123&state=abc"))).toBe("code, state");
  });
});
