vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: () => {} }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));
vi.mock("@/lib/api/client", () => ({ apiRequestWithToken: async () => ({}) }));

describe("readAnalysisEnvelope", () => {
  it("reads data, a JSON-string data, and a bare analysis", async () => {
    const { readAnalysisEnvelope } = await import("./analysis-cache");
    expect(readAnalysisEnvelope({ success: true, data: { seo: {} }, job_id: "j1" })).toEqual({ data: { seo: {} }, jobId: "j1" });
    expect(readAnalysisEnvelope({ data: '{"geo":{}}' }).data).toEqual({ geo: {} });
    expect(readAnalysisEnvelope({ brand_profile: {} }).data).toEqual({ brand_profile: {} });
  });

  it("is no analysis when data is null, not the envelope itself", async () => {
    const { readAnalysisEnvelope } = await import("./analysis-cache");
    expect(readAnalysisEnvelope({ success: true, data: null }).data).toBeNull();
  });

  it("throws on a refusal so it is never cached", async () => {
    const { readAnalysisEnvelope, AnalysisRefusedError } = await import("./analysis-cache");
    expect(() => readAnalysisEnvelope({ success: false, error: "nope" })).toThrow(AnalysisRefusedError);
  });
});
