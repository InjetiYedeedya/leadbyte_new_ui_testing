import { filterRequests, frontendCheckTable, mapRequests, platformLabel, readRequestStatusFilter } from "./requests";

describe("integration requests", () => {
  const requests = mapRequests([
    { requestId: "r1", email: "A@x.test", platform: "google-ads", requestType: "disconnect", status: "pending", createdAt: "2026-09-02" },
    { requestId: "r2", platform: "business-details", requestType: "change", status: "completed", createdAt: "2026-09-05", completedAt: "2026-09-06" },
    { requestId: "r3", platform: "mystery", status: "weird", createdAt: "2026-09-01" },
    { platform: "google-ads" },
  ]);

  it("maps, drops rows with no id and sorts newest first", () => {
    expect(requests.map((r) => r.requestId)).toEqual(["r2", "r1", "r3"]);
    expect(requests[1]).toMatchObject({ email: "a@x.test", type: "disconnect", platformLabel: "Google Ads" });
    expect(requests[2]).toMatchObject({ status: "pending", type: "change", platformLabel: "mystery" });
  });

  it("knows which table a disconnect deletes from, and that business details has none", () => {
    expect(frontendCheckTable("google-ads")).toBe("t8f16b7a60");
    expect(frontendCheckTable("business-details")).toBeNull();
    expect(platformLabel("")).toBe("Unknown");
  });

  it("filters by status", () => {
    expect(filterRequests(requests, readRequestStatusFilter("completed")).map((r) => r.requestId)).toEqual(["r2"]);
    expect(readRequestStatusFilter("nope")).toBe("all");
  });
});
