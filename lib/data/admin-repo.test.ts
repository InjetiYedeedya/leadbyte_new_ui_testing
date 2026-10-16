import { ApiError } from "@/lib/api/client";
import { isMissingTable } from "./admin-repo";

/**
 * A table that does not exist on this backend holds no rows — it is not a
 * failed read. Seen live for three agent tables the admin panel lists.
 */
describe("isMissingTable", () => {
  it("recognises DynamoDB's own wording, whatever status carried it", () => {
    expect(isMissingTable(new ApiError(500, undefined, "Requested resource not found"))).toBe(true);
    expect(isMissingTable(new Error("Requested resource not found"))).toBe(true);
  });

  it("treats a 404 as a missing table", () => {
    expect(isMissingTable(new ApiError(404, undefined, "Not found"))).toBe(true);
  });

  it("still reports a real refusal or outage as a failure", () => {
    expect(isMissingTable(new ApiError(403, undefined, "Admin access required"))).toBe(false);
    expect(isMissingTable(new ApiError(500, undefined, "Internal error"))).toBe(false);
    expect(isMissingTable("timeout")).toBe(false);
  });
});
