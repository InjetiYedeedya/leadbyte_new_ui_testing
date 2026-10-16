/**
 * REGRESSION (2026-10-05). Once the access cookie outlived its 24h token, the
 * refresh became the everyday path — and a REFUSED refresh was rethrown, so
 * every table read logged "every route failed" and every agent dashboard said
 * "couldn't load — a connection problem" however often the customer refreshed.
 * A refresh that cannot work now sends them to sign in again.
 */

const redirect = vi.fn((path: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${path};307;` });
});

vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  // One refresh per render in the app; one per call here.
  cache: <T>(fn: T) => fn,
}));
vi.mock("./config", () => ({
  LEADBYTE_API_URL: "https://api.test",
  LEADBYTE_API_KEY: "key",
  isBackendConfigured: () => true,
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ businessId: "a@b.com", accessToken: "old", refreshToken: "rt" }),
  setAccessToken: vi.fn(async () => undefined),
}));

import { apiGet } from "./client";

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fetchMock = vi.fn();

beforeEach(() => {
  redirect.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("apiRequest when the access token has expired", () => {
  it("sends the customer to sign in again when the refresh token is refused", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(401, { success: false, error: "Authentication required" }))
      .mockResolvedValueOnce(reply(401, { success: false, error: "Invalid refresh token" }));

    await expect(apiGet("/api/query/t/a%40b.com")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login?stale=1&why=expired");
  });

  it("does the same when the refresh answers with no token", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(401, { success: false, error: "Authentication required" }))
      .mockResolvedValueOnce(reply(200, { success: true }));

    await expect(apiGet("/api/query/t/a%40b.com")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login?stale=1&why=expired");
  });

  it("still says 'signed in elsewhere' for a superseded session", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(401, { success: false, error: "Authentication required" }))
      .mockResolvedValueOnce(
        reply(401, { success: false, code: "SESSION_INVALIDATED", error: "Session superseded" }),
      );

    await expect(apiGet("/api/query/t/a%40b.com")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login?stale=1&why=elsewhere");
  });

  it("retries with the new token when the refresh works, and does not redirect", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(401, { success: false, error: "Authentication required" }))
      .mockResolvedValueOnce(reply(200, { success: true, tokens: { accessToken: "new" } }))
      .mockResolvedValueOnce(reply(200, { data: [{ id: 1 }] }));

    await expect(apiGet("/api/query/t/a%40b.com")).resolves.toEqual({ data: [{ id: 1 }] });
    expect(redirect).not.toHaveBeenCalled();
    const retry = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect((retry.headers as Record<string, string>).Authorization).toBe("Bearer new");
  });

  it("leaves a 401 on the retry to the caller — that is the route refusing, not the session", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(401, { success: false, error: "Authentication required" }))
      .mockResolvedValueOnce(reply(200, { success: true, tokens: { accessToken: "new" } }))
      .mockResolvedValueOnce(reply(401, { success: false, error: "Could not resolve userId to email" }));

    await expect(apiGet("/api/data-by-uid/t/u1")).rejects.toThrow("Could not resolve userId to email");
    expect(redirect).not.toHaveBeenCalled();
  });
});
