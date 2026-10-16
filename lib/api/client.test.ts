import { errorFrom, isAbortError } from "@/lib/api/client";

/**
 * The abort classifier.
 *
 * Pure and tested directly, because the case that matters — a request the
 * backend actually completed after we stopped waiting — is the one where
 * getting the classification wrong tells a customer their write failed when it
 * succeeded.
 *
 * `AbortSignal.timeout` rejects with a `DOMException` named `TimeoutError`; a
 * manual abort gives `AbortError`; and undici sometimes surfaces either wrapped
 * in a `TypeError: fetch failed` whose `cause` carries the real one.
 */
describe("isAbortError", () => {
  it("recognises the deadline that AbortSignal.timeout produces", () => {
    const error = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    expect(isAbortError(error)).toBe(true);
  });

  it("recognises a manual abort", () => {
    expect(isAbortError(new DOMException("This operation was aborted", "AbortError"))).toBe(true);
  });

  it("looks through the wrapper undici puts around it", () => {
    const wrapped = new TypeError("fetch failed");
    (wrapped as Error & { cause?: unknown }).cause = new DOMException("timeout", "TimeoutError");
    expect(isAbortError(wrapped)).toBe(true);
  });

  it("does not treat an ordinary network failure as an abort", () => {
    // A refused connection genuinely failed — nothing was written, and calling
    // it a timeout would invent a success that never happened.
    expect(isAbortError(new TypeError("fetch failed"))).toBe(false);
  });

  it("does not treat a backend error response as an abort", () => {
    expect(isAbortError(new Error("No connected Google account found"))).toBe(false);
  });
});

/**
 * REGRESSION (2026-09-15). `/api/openai-ads` wraps every answer as
 * `{ success, data }`, so a refusal puts its reason at `data.error`. Reading
 * only the top level turned a real 400 into "leadbyte-api returned 400" on
 * screen — a sentence that names no cause and cannot be acted on.
 */
describe("the reason a call was refused", () => {
  it("reads a reason nested under `data`", () => {
    const error = errorFrom(400, {
      success: false,
      data: { error: "budget_amount must be greater than zero" },
    });
    expect(error.message).toBe("budget_amount must be greater than zero");
  });

  it("still prefers a top-level reason when there is one", () => {
    const error = errorFrom(400, { error: "top level wins", data: { error: "nested" } });
    expect(error.message).toBe("top level wins");
  });

  it("falls back to the status when nothing readable is there", () => {
    expect(errorFrom(400, { success: false, data: {} }).message).toContain("400");
    expect(errorFrom(500, null).message).toContain("500");
  });

  it("does not mistake an empty string for a reason", () => {
    // A blank `error` is not a message; it would print as nothing at all.
    expect(errorFrom(400, { error: "   ", data: { error: "the real one" } }).message).toBe(
      "the real one",
    );
  });
});
