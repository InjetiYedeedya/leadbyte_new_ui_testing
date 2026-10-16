import { disconnectGithub } from "./aeo-deploy";

const aeoRequest = vi.fn();
vi.mock("@/lib/api/aeo-client", () => ({
  aeoRequest: (...args: unknown[]) => aeoRequest(...args),
}));

describe("disconnectGithub", () => {
  it("DELETEs this account's link for this site and reads the status it answers with", async () => {
    aeoRequest.mockResolvedValue({
      configured: true,
      connected: false,
      install_url: "https://github.com/apps/leadbyte/installations/new",
    });
    const status = await disconnectGithub("a@b.com", "acme.com");
    expect(aeoRequest).toHaveBeenCalledWith(
      "/api/leadbyte/github/connection?user_id=a%40b.com&domain=acme.com",
      { operation: "github", method: "DELETE" },
    );
    expect(status).toMatchObject({ connected: false, installUrl: "https://github.com/apps/leadbyte/installations/new" });
  });
});
