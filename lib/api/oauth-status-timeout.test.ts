import { ApiError, ApiTimeoutError } from "./client";
import { checkOAuthStatus } from "./oauth-status";

/**
 * A check that times out is a slow backend, not a broken one, and it is
 * already handled: the status reads "error" and nothing is blocked. So it is
 * a warning, not an error. `console.error` from a Server Component raises
 * Next's red error panel in development, which read as the page failing.
 */

const apiGet = vi.hoisted(() => vi.fn());
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  apiGet,
}));

afterEach(() => vi.restoreAllMocks());

describe("checkOAuthStatus when the backend is slow or failing", () => {
  it("warns, not errors, on a timeout, and still answers 'error'", async () => {
    apiGet.mockRejectedValueOnce(new ApiTimeoutError("/api/query/t/a%40b.c", 8000));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await checkOAuthStatus("googleAds", "timeout@example.com");

    expect(result).toEqual({ status: "error", expiryDate: null });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it("still reports a real failure as an error", async () => {
    apiGet.mockRejectedValueOnce(new ApiError(500, "SERVER", "boom"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await checkOAuthStatus("googleAds", "failure@example.com");

    expect(result).toEqual({ status: "error", expiryDate: null });
    expect(error).toHaveBeenCalledTimes(1);
  });
});
