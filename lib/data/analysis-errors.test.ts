import {
  SECTION_LABELS,
  failureFor,
  parsePartialErrors,
} from "@/lib/data/analysis-errors";

describe("parsePartialErrors", () => {
  it("reads the section-keyed map the status endpoint sends", () => {
    // Captured live, 2026-09-07.
    const failures = parsePartialErrors({
      audit:
        "Function not found: arn:aws:lambda:us-east-1:255041786095:function:seo-geo-auditor:$LATEST",
    });

    expect(failures).toHaveLength(1);
    expect(failures[0]?.section).toBe("audit");
    expect(failures[0]?.message).toContain("seo-geo-auditor");
  });

  it("explains a missing service without quoting an ARN at the customer", () => {
    const [failure] = parsePartialErrors({
      audit: "Function not found: arn:aws:lambda:us-east-1:1:function:seo-geo-auditor:$LATEST",
    });

    expect(failure?.reason).not.toContain("arn:aws");
    expect(failure?.reason.toLowerCase()).toContain("our end");
  });

  it("suggests a retry for a timeout, which one might actually clear", () => {
    const [failure] = parsePartialErrors({ audit: "Task timed out after 300.00 seconds" });
    expect(failure?.reason.toLowerCase()).toContain("again");
  });

  it("passes an unrecognised message through rather than inventing one", () => {
    const [failure] = parsePartialErrors({ audit: "Sitemap was empty." });
    expect(failure?.reason).toBe("Sitemap was empty.");
  });

  it("is empty for anything that is not a populated map", () => {
    expect(parsePartialErrors(undefined)).toEqual([]);
    expect(parsePartialErrors(null)).toEqual([]);
    expect(parsePartialErrors({})).toEqual([]);
    expect(parsePartialErrors("audit failed")).toEqual([]);
    expect(parsePartialErrors([])).toEqual([]);
  });

  it("ignores entries whose message is not a non-empty string", () => {
    expect(parsePartialErrors({ audit: "", geo: null, seo: 12 })).toEqual([]);
  });

  it("keeps every failed section, not just the first", () => {
    const failures = parsePartialErrors({ audit: "gone", brand: "also gone" });
    expect(failures.map((f) => f.section)).toEqual(["audit", "brand"]);
  });
});

describe("failureFor", () => {
  const failures = parsePartialErrors({ audit: "Function not found: arn:aws:lambda:x" });

  it("finds the section that failed", () => {
    expect(failureFor(failures, "audit")?.section).toBe("audit");
  });

  it("returns null for a section that did not fail", () => {
    expect(failureFor(failures, "brand")).toBeNull();
  });
});

describe("SECTION_LABELS", () => {
  it("names the audit section in the customer's terms", () => {
    // "audit" covers BOTH the website audit and the GEO analysis — one backend
    // step produces both, so both screens read this one key.
    expect(SECTION_LABELS.audit).toBeTruthy();
    expect(SECTION_LABELS.audit).not.toContain("lambda");
  });
});
