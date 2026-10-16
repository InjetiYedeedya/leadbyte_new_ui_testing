import { ApiError, ApiTimeoutError } from "@/lib/api/client";
import { GoogleSaveError, saveGoogleSelection } from "@/lib/data/google-selection";
import type { GoogleProperty } from "@/lib/data/google-properties";

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, apiRequest };
});

const PROPERTY: GoogleProperty = {
  accountName: "ZippyGo",
  propertyId: "508182301",
  propertyName: "ZippyGo Web",
  email: "someone@gmail.com",
  name: "Someone",
};

beforeEach(() => {
  apiRequest.mockReset();
});

describe("saveGoogleSelection", () => {
  it("sends an Analytics pick under the legacy names too, with id (n8n added_console reads it)", async () => {
    apiRequest.mockResolvedValue({ success: true });
    await saveGoogleSelection({ email: "a@b.com", userId: "uid", property: PROPERTY });
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/webhook/google-analytics-selected",
      expect.objectContaining({
        body: expect.objectContaining({ id: "508182301", property_id: "508182301", name: "ZippyGo", websiteUrl: "", email: "a@b.com" }),
      }),
    );
  });

  it("marks a timeout as timedOut rather than a plain failure", async () => {
    // n8n commits the row and then keeps the connection open. We stop waiting;
    // it does not stop writing. So the one thing this must never do is report
    // the same kind of failure as a rejected request.
    apiRequest.mockRejectedValue(new ApiTimeoutError("/api/webhook/x", 30000));

    const error = await saveGoogleSelection({
      email: "a@b.com",
      userId: "uid",
      property: PROPERTY,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GoogleSaveError);
    expect((error as GoogleSaveError).timedOut).toBe(true);
  });

  it("leaves a real backend error as a failure", async () => {
    apiRequest.mockRejectedValue(new ApiError(404, undefined, "No connected Google account found"));

    const error = await saveGoogleSelection({
      email: "a@b.com",
      userId: "uid",
      property: PROPERTY,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GoogleSaveError);
    expect((error as GoogleSaveError).timedOut).toBe(false);
    // n8n's own wording still reaches the screen — it says what to do.
    expect((error as GoogleSaveError).userMessage).toBe("No connected Google account found");
  });

  it("gives the webhook a deadline of its own, not the 8s read deadline", async () => {
    apiRequest.mockResolvedValue({});

    await saveGoogleSelection({ email: "a@b.com", userId: "uid", property: PROPERTY });

    const [, options] = apiRequest.mock.calls[0] as [string, { timeoutMs?: number }];
    expect(options.timeoutMs).toBeGreaterThan(8000);
  });
});
