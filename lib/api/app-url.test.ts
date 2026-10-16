import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the production origin.
 *
 * Every OAuth return, Stripe `success_url`, admin invite and the background
 * video are built from `APP_URL`, and `config.ts` falls back to localhost when
 * it is missing. On 2026-09-30 the live Worker had no runtime `APP_URL`, so
 * `https://app.leadbyte.ai/connections/email/callback` redirected to
 * `http://localhost:3000/login` and every connection flow sent customers to
 * localhost. OpenNext bakes `.env.production` into the Worker as a fallback
 * (a Cloudflare runtime variable still overrides it), so the value committed
 * there is what keeps production correct when the dashboard is not.
 */
function productionEnv(): Record<string, string> {
  const text = readFileSync(join(process.cwd(), ".env.production"), "utf8");
  const vars: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match?.[1]) vars[match[1]] = (match[2] ?? "").replace(/^["']|["']$/g, "");
  }
  return vars;
}

describe(".env.production APP_URL", () => {
  it("is set to a public https origin, never localhost", () => {
    const value = productionEnv().APP_URL ?? "";
    expect(value).not.toBe("");
    const url = new URL(value);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).not.toMatch(/^(localhost|127\.|0\.0\.0\.0)/);
    // An origin only: callbacks are appended to it.
    expect(url.pathname).toBe("/");
    expect(value.endsWith("/")).toBe(false);
  });
});
