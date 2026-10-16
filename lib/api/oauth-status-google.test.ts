import { checkGoogleProduct } from "./oauth-status";

/**
 * Analytics and Search Console share one Frontend Check row but are separate
 * Google grants. The row's `googleProducts` says which were granted.
 */
const apiGet = vi.hoisted(() => vi.fn());
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  apiGet,
}));

const NOW = new Date("2026-09-30T12:00:00Z");
const row = (extra: Record<string, unknown> = {}) => ({ Status: "Done", Expiry_date: "never", ...extra });

describe("checkGoogleProduct", () => {
  beforeEach(() => apiGet.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it("reports Search Console not connected for an Analytics-only grant", async () => {
    apiGet.mockResolvedValue({ data: [row({ googleProducts: "analytics" })] });
    expect((await checkGoogleProduct("analytics", "a@b.c", NOW)).status).toBe("valid");
    expect((await checkGoogleProduct("search_console", "a@b.c", NOW)).status).toBe("not-connected");
  });

  it("reports both for a grant of both", async () => {
    apiGet.mockResolvedValue({ data: [row({ googleProducts: "analytics,search_console" })] });
    expect((await checkGoogleProduct("search_console", "a@b.c", NOW)).status).toBe("valid");
  });

  it("keeps a row from before the field as both, as it always read", async () => {
    apiGet.mockResolvedValue({ data: [row()] });
    expect((await checkGoogleProduct("search_console", "a@b.c", NOW)).status).toBe("valid");
    expect((await checkGoogleProduct("analytics", "a@b.c", NOW)).status).toBe("valid");
  });

  it("passes an unreadable check through as unknown, for both", async () => {
    // The failure is logged on purpose; the test only cares about the answer.
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiGet.mockRejectedValueOnce(new Error("boom"));
    expect((await checkGoogleProduct("search_console", "unreadable@b.c", NOW)).status).toBe("error");
  });
});
