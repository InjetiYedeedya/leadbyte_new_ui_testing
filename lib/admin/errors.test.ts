import {
  errorCategories,
  errorStats,
  filterErrors,
  groupBySeverity,
  normalizeError,
  normalizeErrors,
  readErrorFilters,
} from "./errors";

describe("normalizeError", () => {
  it("reads the documented schema", () => {
    expect(
      normalizeError(
        {
          errorId: "e1",
          priority: "critical",
          agentType: "Meta Ads",
          errorMessage: "Boom",
          workflowName: "wf",
          timestamp: "2026-09-01T00:00:00Z",
        },
        0,
      ),
    ).toMatchObject({ id: "e1", severity: "CRITICAL", category: "Meta Ads", summary: "Boom", workflow: "wf", cleared: false });
  });

  it("reads the older spellings, and buckets unknown severities as low", () => {
    const error = normalizeError({ id: "e2", severity: "Medium-ish", type: "SEO", error_message: "x", status: "Resolved" }, 0);
    expect(error).toMatchObject({ errorId: "e2", severity: "MEDIUM", category: "SEO", cleared: true });
    expect(normalizeError({ level: "whatever" }, 3)).toMatchObject({
      id: "row-3",
      errorId: "",
      severity: "LOW",
      category: "Unknown",
      summary: "No description provided",
    });
  });
});

describe("filtering the board", () => {
  const errors = normalizeErrors([
    { errorId: "a", priority: "high", agentType: "Meta Ads", errorMessage: "token expired", timestamp: "2026-09-10T10:00:00Z" },
    { errorId: "b", priority: "low", agentType: "SEO", errorMessage: "skipped", timestamp: "2026-09-01T10:00:00Z", cleared: true },
    { errorId: "c", priority: "medium", agentType: "SEO", errorMessage: "403" },
  ]);

  it("sorts newest first", () => {
    expect(errors.map((e) => e.errorId)).toEqual(["a", "b", "c"]);
  });

  it("applies search, status, category and dates, keeping undated rows under a date filter", () => {
    const base = readErrorFilters({});
    expect(filterErrors(errors, { ...base, q: "TOKEN" }).map((e) => e.errorId)).toEqual(["a"]);
    expect(filterErrors(errors, { ...base, status: "open" }).map((e) => e.errorId)).toEqual(["a", "c"]);
    expect(filterErrors(errors, { ...base, category: "SEO" }).map((e) => e.errorId)).toEqual(["b", "c"]);
    expect(filterErrors(errors, { ...base, from: "2026-09-05" }).map((e) => e.errorId)).toEqual(["a", "c"]);
  });

  it("counts and groups what is left", () => {
    expect(errorStats(errors)).toEqual({ total: 3, pending: 2, highOrCritical: 1, medium: 1 });
    expect(groupBySeverity(errors).LOW.map((e) => e.errorId)).toEqual(["b"]);
    expect(errorCategories(errors)).toEqual(["Meta Ads", "SEO"]);
  });

  it("ignores malformed filter values", () => {
    expect(readErrorFilters({ from: "yesterday", status: "weird", category: "" })).toEqual({
      q: "",
      from: "",
      to: "",
      status: "all",
      category: "all",
    });
  });
});
