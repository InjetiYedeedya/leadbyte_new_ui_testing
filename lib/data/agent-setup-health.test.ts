import { ApiError, ApiTimeoutError } from "@/lib/api/client";
import { n8nReportsDown, neverReachedServer } from "./agent-setup";

describe("n8nReportsDown", () => {
  it("is true only for an explicit healthy: false", () => {
    expect(n8nReportsDown({ healthy: false })).toBe(true);
    expect(n8nReportsDown({ healthy: true })).toBe(false);
    // A health route that answers anything else must not block a customer.
    expect(n8nReportsDown(null)).toBe(false);
    expect(n8nReportsDown("ok")).toBe(false);
    expect(n8nReportsDown({ success: false })).toBe(false);
  });
});

describe("neverReachedServer — the only failure a launch may be retried after", () => {
  it("retries a connection that never opened", () => {
    expect(neverReachedServer(new TypeError("fetch failed"))).toBe(true);
  });

  it("never retries a refusal or a timeout, either of which n8n may already have acted on", () => {
    expect(neverReachedServer(new ApiError(502, undefined, "bad gateway"))).toBe(false);
    expect(neverReachedServer(new ApiTimeoutError("/api/webhook/adsreceiver", 30000))).toBe(false);
  });
});
