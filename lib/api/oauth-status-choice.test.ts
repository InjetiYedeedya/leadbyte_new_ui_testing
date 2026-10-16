import { ApiError } from "./client";
import { accountChoice, hasChosenAccount } from "./oauth-status";

/**
 * 2026-09-30: blocking on "no pick on the Frontend Check row" stopped every
 * Google Ads campaign whose consent never came back through our picker. The
 * row can prove a pick; it cannot prove there is none.
 */
const apiGet = vi.hoisted(() => vi.fn());
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  apiGet,
}));
vi.mock("./config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./config")>()),
  isBackendConfigured: () => true,
}));

const connected = { Status: "Done", Expiry_date: "never" };

function answer(integrations: unknown, rows: unknown[]) {
  apiGet.mockImplementation(async (path: string) => {
    if (path === "/api/integrations/status") {
      if (integrations === null) throw new ApiError(404, undefined, "Route not found");
      return integrations;
    }
    return { data: rows };
  });
}

describe("accountChoice", () => {
  beforeEach(() => apiGet.mockReset());

  it("is unknown — and never blocks — for a connection with no pick on record", async () => {
    answer(null, [connected]);
    expect(await accountChoice("googleAds", "nopick@b.c")).toBe("unknown");
    expect(await hasChosenAccount("googleAds", "nopick2@b.c")).toBe(true);
  });

  it("is chosen when our picker saved one", async () => {
    answer(null, [{ ...connected, selectedAccount: JSON.stringify({ id: "123", name: "Acme" }) }]);
    expect(await accountChoice("googleAds", "picked@b.c")).toBe("chosen");
  });
});
