import {
  AdsApiError,
  ADS_TIMEOUT_STATUS,
  adsCanRetry,
  adsFieldProblems,
  adsUserMessage,
  classifyAds,
  parseAdsError,
} from "./ads-errors";

/**
 * Every payload below is a verbatim capture from the service's own contract,
 * not something invented — the point of these tests is that our reading of the
 * real responses is right, and a fixture we wrote ourselves could only prove
 * we are consistent with ourselves.
 */

const BAD_KEY = { error: "This key was rejected by the platform.", type: "AuthError" };

const VALIDATION = {
  error: "validation failed",
  fields: [
    { field: "budget_amount", message: "must be greater than zero" },
    { field: "locations", message: "choose at least one location" },
    {
      field: "business_description",
      message:
        "needs at least 40 characters of prose — keywords alone produce weak topics and copy",
    },
  ],
};

const PARTIAL = {
  error: "Ad group creation failed after the campaign was created.",
  created: { campaign_id: "cmp_8f21", file_id: "file_22d0" },
};

const BAD_IMAGE = {
  error:
    "The image could not be downloaded from https://… It must be a publicly reachable https address returning a png, jpeg, gif or webp…",
  type: "BadImageError",
};

const IMAGE_MISSING = {
  error:
    "Full automation creates the image, but none has been rendered. Call generate_image, poll image_status until it reports ready, then send its output_key here.",
  type: "ImageMissing",
};

describe("classifyAds", () => {
  /**
   * The line the whole file exists for. The person at the screen cannot fix a
   * missing field in a request they did not compose.
   */
  it("calls 400, 401 and 403 our bug, not the customer's", () => {
    expect(classifyAds(400)).toBe("bug");
    expect(classifyAds(401)).toBe("bug");
    expect(classifyAds(403)).toBe("bug");
  });

  it("separates the ones worth showing from the ones worth hiding", () => {
    expect(classifyAds(402)).toBe("billing");
    expect(classifyAds(422)).toBe("input");
  });

  it("marks 409 as partial, which is what forbids a retry", () => {
    expect(classifyAds(409)).toBe("partial");
  });

  it("allows a retry only where the contract says to", () => {
    expect(classifyAds(429)).toBe("retry");
    expect(classifyAds(502)).toBe("retry");
  });

  /**
   * Our own abandoned request, not the service's answer. The work may well have
   * completed after we stopped listening, so this can never be "it failed".
   */
  it("treats our own timeout as unknown rather than failed", () => {
    expect(classifyAds(ADS_TIMEOUT_STATUS)).toBe("unknown");
  });

  it("blames itself for an undocumented status rather than the customer", () => {
    expect(classifyAds(418)).toBe("bug");
    expect(classifyAds(500)).toBe("retry");
  });
});

describe("parseAdsError", () => {
  it("reads the real rejected-key response", () => {
    const error = parseAdsError(401, BAD_KEY);
    expect(error.type).toBe("AuthError");
    expect(error.detail).toBe("This key was rejected by the platform.");
    expect(error.kind).toBe("bug");
  });

  it("reads every field problem, so the form shows them all at once", () => {
    const error = parseAdsError(422, VALIDATION);
    expect(error.fields).toHaveLength(3);
    expect(error.fields[0]).toEqual({
      field: "budget_amount",
      message: "must be greater than zero",
    });
    expect(error.fields.map((f) => f.field)).toContain("business_description");
  });

  it("keeps what a 409 did manage to create", () => {
    const error = parseAdsError(409, PARTIAL);
    expect(error.created).toEqual({ campaign_id: "cmp_8f21", file_id: "file_22d0" });
  });

  /**
   * This runs inside the error path. Throwing here replaces a readable problem
   * with a blank screen — the same rule `analysis-job.ts` follows.
   */
  it("never throws on a body it did not expect", () => {
    expect(parseAdsError(500, null).detail).toBe("the ads service returned 500");
    expect(parseAdsError(502, "<html>Bad Gateway</html>").detail).toBe("<html>Bad Gateway</html>");
    expect(parseAdsError(422, { error: "validation failed" }).fields).toEqual([]);
    expect(parseAdsError(409, PARTIAL.error).created).toBeNull();
    expect(parseAdsError(400, { fields: "not an array" }).fields).toEqual([]);
  });

  it("drops a field row that names no field or carries no text", () => {
    const error = parseAdsError(422, {
      error: "validation failed",
      fields: [{ field: "goal" }, { message: "orphaned" }, { field: "budget_amount", message: "x" }],
    });
    expect(error.fields).toEqual([{ field: "budget_amount", message: "x" }]);
  });
});

describe("adsUserMessage", () => {
  /**
   * These two texts name the actual cause and tell someone what to change.
   * Paraphrasing them throws away the only useful sentence in the response.
   */
  it("shows the service's own words for the problems a customer can fix", () => {
    expect(adsUserMessage(parseAdsError(422, BAD_IMAGE))).toBe(BAD_IMAGE.error);
    expect(adsUserMessage(parseAdsError(422, IMAGE_MISSING))).toBe(IMAGE_MISSING.error);
    expect(adsUserMessage(parseAdsError(402, { error: "No payment method on file." }))).toBe(
      "No payment method on file.",
    );
  });

  it("never repeats the service's words for a fault of ours", () => {
    const message = adsUserMessage(parseAdsError(401, BAD_KEY));
    expect(message).not.toContain("rejected");
    expect(message).not.toContain("unauthorised");
    // Said explicitly: a failure on a screen about ad spend, with nothing said
    // either way, reads as money possibly gone.
    expect(message).toContain("nothing has been charged");
  });

  it("tells someone a half-created campaign exists rather than offering a retry", () => {
    const message = adsUserMessage(parseAdsError(409, PARTIAL));
    expect(message).toContain("second campaign");
  });

  it("says a timeout might still have landed", () => {
    const message = adsUserMessage(new AdsApiError(ADS_TIMEOUT_STATUS, undefined, "gave up", [], null));
    expect(message).toContain("check your campaigns");
  });

  it("blames itself for a thrown fetch, which never reached the service", () => {
    expect(adsUserMessage(new TypeError("fetch failed"))).toContain("on our side");
  });
});

describe("adsCanRetry", () => {
  /**
   * The contract's own instruction. A disabled button is not enough — the
   * screen must not offer the control at all, because pressing it makes a
   * second campaign out of a campaign that half exists.
   */
  it("refuses a retry after a partial create", () => {
    expect(adsCanRetry(parseAdsError(409, PARTIAL))).toBe(false);
  });

  it("allows one where trying again is the right move", () => {
    expect(adsCanRetry(parseAdsError(429, { error: "slow down" }))).toBe(true);
    expect(adsCanRetry(parseAdsError(422, VALIDATION))).toBe(true);
  });

  it("does not invite a retry of our own misconfiguration", () => {
    expect(adsCanRetry(parseAdsError(403, { error: "scope" }))).toBe(false);
    expect(adsCanRetry(new TypeError("fetch failed"))).toBe(false);
  });
});

describe("adsFieldProblems", () => {
  it("hands the form its per-input messages", () => {
    expect(adsFieldProblems(parseAdsError(422, VALIDATION))).toHaveLength(3);
  });

  it("is empty for anything that is not a field failure", () => {
    expect(adsFieldProblems(parseAdsError(409, PARTIAL))).toEqual([]);
    expect(adsFieldProblems(new Error("boom"))).toEqual([]);
  });
});

/**
 * REGRESSION. `adsCall` throws 503 `NotConfigured` when `ADS_API_URL` /
 * `LEADBYTE_API_URL` is unset. 503 otherwise means an overloaded service, so the
 * screen told the customer the ads service was "busy right now" and invited
 * them to try again — for a request that had never left the building and could
 * not succeed until someone edited the environment.
 */
describe("an unconfigured ads service", () => {
  const unconfigured = new AdsApiError(
    503,
    "NotConfigured",
    "LEADBYTE_API_URL is not set — the ads proxy route lives on that backend",
    [],
    null,
  );

  it("is ours, not a busy service", () => {
    expect(unconfigured.kind).toBe("bug");
    expect(adsUserMessage(unconfigured)).not.toMatch(/busy/i);
    expect(adsUserMessage(unconfigured)).toMatch(/isn't set up correctly/i);
  });

  it("does not invite a retry that cannot work", () => {
    expect(adsCanRetry(unconfigured)).toBe(false);
  });

  it("still invites a retry on a real 503, and keeps the service's reason", () => {
    const overloaded = new AdsApiError(503, "ServiceUnavailable", "too many requests", [], null);
    expect(overloaded.kind).toBe("retry");
    const message = adsUserMessage(overloaded);
    // The reason is the service's; the invitation is ours, because a 5xx may
    // genuinely be transient.
    expect(message).toContain("too many requests");
    expect(message).toMatch(/try again/i);
  });
});

/**
 * REGRESSION (2026-09-16). `save_key` failed with a stated reason and the
 * screen said "The ads service is busy right now" — the third investigation in
 * two days to end at a generic sentence covering the service's own. A reason
 * the service gave is kept; a status echo is not.
 */
describe("a reason the service actually gave", () => {
  it("is shown on a 5xx, with the retry invitation kept", () => {
    const error = new AdsApiError(500, undefined, "Key storage is unavailable.", [], null);
    const message = adsUserMessage(error);
    expect(message).toContain("Key storage is unavailable.");
    expect(message).toMatch(/try again/i);
  });

  it("is shown on a 400, with the reassurance about money kept", () => {
    const error = new AdsApiError(400, undefined, "user_id is required.", [], null);
    const message = adsUserMessage(error);
    expect(message).toContain("user_id is required.");
    expect(message).toMatch(/nothing has been charged/i);
  });

  it("falls back to ours when all the service gave was a status echo", () => {
    // Repeating "returned 500" tells a reader nothing they cannot see.
    expect(adsUserMessage(new AdsApiError(500, undefined, "the ads service returned 500", [], null)))
      .toBe("The ads service is busy right now. Please try again in a moment.");
    expect(adsUserMessage(new AdsApiError(400, undefined, "leadbyte-api returned 400", [], null)))
      .toMatch(/isn't set up correctly/i);
  });

  it("falls back to ours when the detail is blank", () => {
    expect(adsUserMessage(new AdsApiError(503, undefined, "   ", [], null))).toMatch(/busy/i);
  });
});
