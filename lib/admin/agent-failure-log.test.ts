import {
  buildFailureRow,
  failureDetail,
  failureReference,
  maskSecrets,
  withReference,
} from "./agent-failure-log";

describe("agent failure log (2026-10-08)", () => {
  it("masks bearer headers, JWTs and secret-named fields in the upstream text", () => {
    const text = maskSecrets(
      'Authorization: Bearer abc.def-123 {"access_token":"ya29.secret","name":"ok"} token=xyz ' +
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.sig",
    );
    expect(text).not.toMatch(/abc\.def-123|ya29\.secret|xyz|eyJhbGci/);
    expect(text).toContain('"name":"ok"');
  });

  it("reads the message and its cause, and copes with non-errors", () => {
    const error = new Error("Error in workflow", { cause: new Error("Meta: invalid audience") });
    expect(failureDetail(error)).toBe("Error: Error in workflow (cause: Meta: invalid audience)");
    expect(failureDetail("plain")).toBe("plain");
    expect(failureDetail({ code: 7 })).toBe('{"code":7}');
  });

  it("makes a 6-character reference with no lookalike characters", () => {
    const ref = failureReference("0123456789abcdef");
    expect(ref).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(failureReference("0123456789abcdef")).toBe(ref);
  });

  it("builds the row the admin Errors screen reads", () => {
    const row = buildFailureRow(
      { agentId: "meta-ads", step: "approve plan", email: " Gokul@Example.com ", error: new Error("Error in workflow") },
      "ABC234",
      "id-1",
      new Date("2026-10-08T10:00:00Z"),
    );
    expect(row).toMatchObject({
      errorId: "id-1",
      timestamp: "2026-10-08T10:00:00.000Z",
      agentType: "meta-ads",
      priority: "HIGH",
      workflowName: "app: approve plan",
      userEmail: "gokul@example.com",
      status: "Active",
      cleared: false,
    });
    expect(row.errorMessage).toBe("[ABC234] gokul@example.com — Error: Error in workflow");
  });

  it("caps a very long upstream reply", () => {
    const row = buildFailureRow(
      { agentId: "x", step: "s", email: "a@b.c", error: "y".repeat(5_000) },
      "R",
      "i",
      new Date(),
    );
    expect(String(row.errorMessage).length).toBeLessThan(1_100);
  });

  it("appends the reference to the customer's sentence", () => {
    expect(withReference("Nothing was launched.", "ABC234")).toBe(
      "Nothing was launched. (Reference ABC234 — quote it if you contact support.)",
    );
  });
});
