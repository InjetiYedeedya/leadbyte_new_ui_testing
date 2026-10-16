import { adsCall } from "./ads-client";
import { ApiError } from "./client";
import { AdsApiError } from "@/lib/data/ads-errors";

/**
 * The transport's job is not "send JSON" — it is to make four mistakes
 * impossible: acting for the wrong customer, retrying a `create`, letting a
 * caller override what runs, and handing back a failure that arrived as 200.
 *
 * It no longer speaks to a second backend. `POST /api/openai-ads` on the
 * leadbyte-api Lambda invokes `openai-ads-automation-dev` and returns its
 * output, so `apiRequest` — which already carries the `x-api-key` and the JWT
 * — is mocked here rather than `fetch`.
 */

let configured = true;
let userId: string | null = "client@example.com";

const apiRequest = vi.fn();

vi.mock("./config", () => ({ isBackendConfigured: () => configured }));
vi.mock("@/lib/data/ads-identity", () => ({ adsUserId: async () => userId }));
vi.mock("./client", () => ({
  ApiError: class extends Error {
    constructor(
      readonly status: number,
      readonly code: string | undefined,
      message: string,
    ) {
      super(message);
      this.name = "ApiError";
    }
  },
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

/** The path and body of the nth call. */
function sent(call = 0): { path: string; body: Record<string, unknown> } {
  const [path, init] = apiRequest.mock.calls[call]! as [string, { body: Record<string, unknown> }];
  return { path, body: init.body };
}

/** What the proxy answers on success: the Lambda's body inside `data`. */
function ok(data: unknown) {
  return { success: true, data };
}

beforeEach(() => {
  apiRequest.mockReset();
  configured = true;
  userId = "client@example.com";
  vi.useRealTimers();
});

describe("adsCall", () => {
  it("posts to the proxy route with the flag that gates it", async () => {
    apiRequest.mockResolvedValue(ok({ authenticated: true }));

    await adsCall("whoami", {});

    const { path, body } = sent();
    expect(path).toBe("/api/openai-ads");
    // Without this the route answers 400 rather than invoking anything.
    expect(body.openai_ads).toBe(true);
  });

  it("carries the action and the customer in every body", async () => {
    apiRequest.mockResolvedValue(ok({}));

    await adsCall("verify", { api_key: "sk-svcacct-abc" });

    expect(sent().body).toMatchObject({
      openai_ads: true,
      action: "verify",
      user_id: "client@example.com",
      api_key: "sk-svcacct-abc",
    });
  });

  it("will not let a caller's own fields override the action or the customer", async () => {
    apiRequest.mockResolvedValue(ok({}));

    // A body echoed back from the service and passed on unexamined is the
    // realistic way this happens, not a malicious caller.
    await adsCall("whoami", { action: "create", user_id: "someone@else" } as never);

    expect(sent().body).toMatchObject({ action: "whoami", user_id: "client@example.com" });
  });

  it("refuses to call at all with no session, rather than acting for a default", async () => {
    userId = null;
    const error = (await adsCall("whoami", {}).catch((e: unknown) => e)) as AdsApiError;
    expect(error).toBeInstanceOf(AdsApiError);
    expect(error.status).toBe(401);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("says so plainly when the backend is not wired up", async () => {
    configured = false;
    const error = (await adsCall("whoami", {}).catch((e: unknown) => e)) as AdsApiError;
    expect(error.type).toBe("NotConfigured");
    // Ours, not a busy service — retrying could never help.
    expect(error.kind).toBe("bug");
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe("the proxy's envelope", () => {
  it("returns the Lambda's own body, not the wrapper", async () => {
    apiRequest.mockResolvedValue(ok({ authenticated: true, user_id: "u_1" }));
    await expect(adsCall("whoami", {})).resolves.toEqual({
      authenticated: true,
      user_id: "u_1",
    });
  });

  /**
   * The failure that arrives as 200. Returning it would hand callers an object
   * whose every field is undefined and surface the fault far from its cause —
   * the observed case being the target Lambda reporting no API key of its own.
   */
  it("raises a success:false rather than returning it", async () => {
    apiRequest.mockResolvedValue({
      success: false,
      data: { error: "OPENAI_ADS_API_KEY is not set." },
    });

    const error = (await adsCall("whoami", {}, { retries: 0 }).catch((e: unknown) => e)) as AdsApiError;
    expect(error).toBeInstanceOf(AdsApiError);
    expect(error.detail).toContain("OPENAI_ADS_API_KEY");
  });

  it("translates the backend's own error into one type", async () => {
    apiRequest.mockRejectedValue(new ApiError(422, undefined, "budget_amount is required"));

    const error = (await adsCall("prepare", { request: {} as never }).catch(
      (e: unknown) => e,
    )) as AdsApiError;
    expect(error).toBeInstanceOf(AdsApiError);
    expect(error.status).toBe(422);
    expect(error.kind).toBe("input");
  });
});

describe("retrying", () => {
  it("tries once more when the service says it is busy", async () => {
    apiRequest
      .mockRejectedValueOnce(new ApiError(429, undefined, "slow down"))
      .mockResolvedValueOnce(ok({ authenticated: true }));

    // Real timers, and the 1.5s wait is simply waited out. Fake timers were
    // tried and hung: the retry's `setTimeout` is scheduled several microtasks
    // deep (behind `adsUserId` and the first rejection), and driving that from
    // outside is more machinery than 1.5s of patience is worth.
    await expect(adsCall("whoami", {})).resolves.toEqual({ authenticated: true });
    expect(apiRequest).toHaveBeenCalledTimes(2);
  }, 10_000);

  /*
   * The three below never reach the wait — a refusal, a `create` and an
   * opt-out each throw on the first try. So they run on real timers, and the
   * assertion is attached to the call in the SAME expression: awaiting
   * anything first leaves the rejection unhandled long enough for Vitest to
   * flag it as a possible false positive, which it did.
   */
  it("does not retry a refusal that a second try cannot change", async () => {
    apiRequest.mockRejectedValue(new ApiError(422, undefined, "bad input"));

    await expect(adsCall("prepare", { request: {} as never })).rejects.toBeInstanceOf(AdsApiError);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  /** A second create is a second campaign, spending real money. */
  it("never retries create, even when asked to", async () => {
    apiRequest.mockRejectedValue(new ApiError(429, undefined, "slow down"));

    await expect(
      adsCall("create", { request: {} as never }, { retries: 1 }),
    ).rejects.toBeInstanceOf(AdsApiError);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("honours a caller that opted out of retrying", async () => {
    apiRequest.mockRejectedValue(new ApiError(429, undefined, "slow down"));

    await expect(adsCall("whoami", {}, { retries: 0 })).rejects.toBeInstanceOf(AdsApiError);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
