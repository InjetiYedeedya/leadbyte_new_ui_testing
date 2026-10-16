export {};

/**
 * Renewing an expired access token (Error 1102 work, 2026-10-11).
 *
 * A page render cannot save a renewed token in its cookie, so every page used
 * to send its reads with the expired token, collect a 401 for each, renew, and
 * send them all again. Now a token we can see has expired is renewed BEFORE
 * the call, and the renewed one is kept for the next requests.
 */

const session = {
  businessId: "owner@example.com",
  accessToken: "",
  refreshToken: "",
};

vi.mock("./config", () => ({
  LEADBYTE_API_URL: "https://api.test",
  LEADBYTE_API_KEY: "key",
  isBackendConfigured: () => true,
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => session,
  // A page render: Next refuses cookie writes.
  setAccessToken: async () => {
    throw new Error("Cookies can only be modified in a Server Action or Route Handler");
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

const { apiGet } = await import("./client");

function jwt(expSeconds: number): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${encode({ alg: "HS256" })}.${encode({ exp: expSeconds })}.sig`;
}

const now = () => Math.floor(Date.now() / 1000);
const fresh = jwt(now() + 3600);

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/auth/refresh-token")) {
      return Response.json({ success: true, tokens: { accessToken: fresh } });
    }
    const auth = (init.headers as Record<string, string>).Authorization;
    return auth === `Bearer ${fresh}` ? Response.json({ ok: true }) : Response.json({ error: "expired" }, { status: 401 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const calledPaths = () => fetchMock.mock.calls.map(([url]) => String(url).replace("https://api.test", ""));

describe("apiRequest token renewal", () => {
  it("renews an expired token before the call, so no 401 is collected", async () => {
    session.accessToken = jwt(now() - 60);
    session.refreshToken = "refresh-a";
    await expect(apiGet("/api/data/x")).resolves.toEqual({ ok: true });
    expect(calledPaths()).toEqual(["/auth/refresh-token", "/api/data/x"]);
  });

  it("reuses the renewed token on the next request instead of renewing again", async () => {
    session.accessToken = jwt(now() - 60);
    session.refreshToken = "refresh-b";
    await apiGet("/api/data/x");
    fetchMock.mockClear();
    await apiGet("/api/data/y");
    expect(calledPaths()).toEqual(["/api/data/y"]);
  });

  it("still renews on a 401 when the token looked valid", async () => {
    session.accessToken = "opaque-token-with-no-expiry";
    session.refreshToken = "refresh-c";
    await expect(apiGet("/api/data/x")).resolves.toEqual({ ok: true });
    expect(calledPaths()).toEqual(["/api/data/x", "/auth/refresh-token", "/api/data/x"]);
  });

  it("sends a token that is still good without renewing", async () => {
    session.accessToken = fresh;
    session.refreshToken = "refresh-d";
    await apiGet("/api/data/x");
    expect(calledPaths()).toEqual(["/api/data/x"]);
  });

  it("sends the customer to sign in when the refresh token is refused", async () => {
    session.accessToken = jwt(now() - 60);
    session.refreshToken = "refresh-e";
    fetchMock.mockImplementation(async () => Response.json({ error: "Invalid refresh token" }, { status: 401 }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(apiGet("/api/data/x")).rejects.toThrow(/redirect:/);
  });
});
