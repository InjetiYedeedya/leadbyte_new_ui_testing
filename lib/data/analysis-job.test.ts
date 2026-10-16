import { describe, expect, it } from "vitest";
import {
  jobIdFrom,
  parseProgress,
  phaseFrom,
  startOutcomeFrom,
  toJobState,
} from "./analysis-job";

describe("toJobState", () => {
  it("recognises the documented values", () => {
    expect(toJobState("queued")).toBe("queued");
    expect(toJobState("running")).toBe("running");
    expect(toJobState("done")).toBe("done");
    expect(toJobState("failed")).toBe("failed");
  });

  it("accepts the common synonyms a backend might use instead", () => {
    // The routes are confirmed; the exact wording of the state is not. Getting
    // this wrong means a finished job polls forever.
    expect(toJobState("completed")).toBe("done");
    expect(toJobState("SUCCESS")).toBe("done");
    expect(toJobState("finished")).toBe("done");
    expect(toJobState("in_progress")).toBe("running");
    expect(toJobState("processing")).toBe("running");
    expect(toJobState("pending")).toBe("queued");
    expect(toJobState("error")).toBe("failed");
  });

  it("returns unknown rather than guessing", () => {
    expect(toJobState("banana")).toBe("unknown");
    expect(toJobState(undefined)).toBe("unknown");
    expect(toJobState(null)).toBe("unknown");
  });
});

describe("jobIdFrom", () => {
  it("reads job_id at the top level", () => {
    expect(jobIdFrom({ success: true, job_id: "abc" })).toBe("abc");
  });

  it("reads it from a data envelope", () => {
    expect(jobIdFrom({ success: true, data: { job_id: "xyz" } })).toBe("xyz");
  });

  it("accepts camelCase and plain id", () => {
    expect(jobIdFrom({ jobId: "camel" })).toBe("camel");
    expect(jobIdFrom({ id: "plain" })).toBe("plain");
  });

  it("returns null when there is no id, rather than an empty string", () => {
    // The caller treats null as "maybe it answered synchronously" and re-reads
    // /latest; an empty string would poll a nonexistent job forever.
    expect(jobIdFrom({ success: true })).toBeNull();
    expect(jobIdFrom({ job_id: "" })).toBeNull();
    expect(jobIdFrom(null)).toBeNull();
    expect(jobIdFrom("nonsense")).toBeNull();
  });
});

describe("parseProgress", () => {
  it("reads state and counters", () => {
    expect(
      parseProgress({ status: "running", progress: { pagesCrawled: 4, totalPages: 17 } }),
    ).toEqual({ state: "running", pagesCrawled: 4, totalPages: 17, error: undefined });
  });

  it("finds them inside a data envelope", () => {
    expect(parseProgress({ data: { status: "done" } }).state).toBe("done");
  });

  it("accepts alternate counter names", () => {
    const p = parseProgress({ status: "running", progress: { crawled: 2, total: 9 } });
    expect(p.pagesCrawled).toBe(2);
    expect(p.totalPages).toBe(9);
  });

  it("leaves counters undefined when absent, not zero", () => {
    // 0 of 0 would render as a completed progress bar on a job that has not
    // started.
    const p = parseProgress({ status: "queued" });
    expect(p.pagesCrawled).toBeUndefined();
    expect(p.totalPages).toBeUndefined();
  });

  it("surfaces a failure message", () => {
    const p = parseProgress({ status: "failed", error: "Site unreachable" });
    expect(p.state).toBe("failed");
    expect(p.error).toBe("Site unreachable");
  });

  it("reports unknown for an unrecognisable payload", () => {
    expect(parseProgress(null).state).toBe("unknown");
    expect(parseProgress({}).state).toBe("unknown");
  });
});

/**
 * The POST can answer two different ways (backend contract, 2026-09-02):
 *
 *   queued  -> { success: true, job_id: "...", status: "queued" }
 *   cached  -> { success: true, status: "done", cached: true, data: {...} }
 *
 * The cached branch used to fall through the "no job id" warning and get
 * treated as complete by accident. It is now an explicit outcome.
 */
describe("startOutcomeFrom", () => {
  it("reads a queued job", () => {
    expect(
      startOutcomeFrom({
        success: true,
        job_id: "700f9800-0405-42f0-ae17-024b099466ad",
        status: "queued",
      }),
    ).toEqual({ kind: "queued", jobId: "700f9800-0405-42f0-ae17-024b099466ad" });
  });

  it("recognises a cached result that is already done", () => {
    expect(
      startOutcomeFrom({
        success: true,
        status: "done",
        cached: true,
        data: { brand_profile: {}, seo: {}, geo: {} },
      }),
    ).toEqual({ kind: "done" });
  });

  it("treats done without the cached flag as done too", () => {
    expect(startOutcomeFrom({ success: true, status: "done", data: {} })).toEqual({
      kind: "done",
    });
  });

  it("prefers the job id when a response carries both", () => {
    expect(startOutcomeFrom({ job_id: "abc", status: "queued", data: {} })).toEqual({
      kind: "queued",
      jobId: "abc",
    });
  });

  it("reports unknown for a response it cannot read, so the caller can re-read latest", () => {
    expect(startOutcomeFrom({ success: true })).toEqual({ kind: "unknown" });
    expect(startOutcomeFrom(null)).toEqual({ kind: "unknown" });
  });
});

describe("phaseFrom", () => {
  it("maps queued and running to running, so the UI says 'fetching'", () => {
    expect(phaseFrom({ state: "queued" })).toEqual({ phase: "running" });
    expect(phaseFrom({ state: "running" })).toEqual({ phase: "running" });
  });

  it("carries the backend message through on failure", () => {
    expect(
      phaseFrom({ state: "failed", error: "Website could not be reached" }),
    ).toEqual({ phase: "failed", message: "Website could not be reached" });
  });

  it("reports failed with no message when the backend sent none", () => {
    expect(phaseFrom({ state: "failed" })).toEqual({ phase: "failed", message: undefined });
  });

  it("treats done as idle — the data is readable, nothing is in flight", () => {
    expect(phaseFrom({ state: "done" })).toEqual({ phase: "idle" });
  });

  it("keeps an unreadable status as running rather than declaring failure", () => {
    expect(phaseFrom({ state: "unknown" })).toEqual({ phase: "running" });
  });
});
