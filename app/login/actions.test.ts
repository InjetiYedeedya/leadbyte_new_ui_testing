import { describe, expect, it } from "vitest";
import { savePendingWebsiteUrl, sessionArgsFromSignIn } from "./actions";
import { ApiError } from "@/lib/api/client";
import type { SignInResponse } from "@/lib/api/auth-api";

/**
 * The exact response shape observed from a live sign-in on 2026-08-27.
 * Reading `uid` here returned undefined and broke every real sign-in, so this
 * fixture is the regression guard: the identifier is `userId`.
 */
const LIVE_RESPONSE = {
  success: true,
  isNewUser: false,
  user: {
    userId: "abc123",
    email: "thilak@ntimes.ai",
    name: "Thilak",
    profileImage: "",
    emailVerified: true,
    provider: "password",
  },
  tokens: { accessToken: "access-tok", refreshToken: "refresh-tok", expiresIn: 86400 },
} as unknown as SignInResponse;

const tokens = { accessToken: "a", refreshToken: "r", expiresIn: 1 };

describe("sessionArgsFromSignIn", () => {
  it("keys the session on the email, which is what the backend tables use", async () => {
    const args = await sessionArgsFromSignIn(LIVE_RESPONSE);

    expect(args.businessId).toBe("thilak@ntimes.ai");
    expect(args.ownerId).toBe("thilak@ntimes.ai");
    // The Firebase uid used to be extracted and then dropped. It is now kept,
    // because Leadbyte_User_Overall_Details rows need a `userId` and nothing
    // else in the request carries one.
    expect(args.userId).toBe("abc123");
    // expiresIn is carried through so the cookie's lifetime matches the
    // token's. The backend reports it in SECONDS (86400 = 24h).
    expect(args.tokens).toEqual({
      accessToken: "access-tok",
      refreshToken: "refresh-tok",
      expiresIn: 86400,
    });
  });

  it("accepts a response that spells the id `uid` instead of `userId`", async () => {
    const args = await sessionArgsFromSignIn({
      user: { uid: "legacy-id", email: "a@b.com" },
      tokens,
    } as unknown as SignInResponse);

    expect(args.businessId).toBe("a@b.com");
  });

  it("falls back to the id when the response carries no email", async () => {
    const args = await sessionArgsFromSignIn({
      user: { userId: "abc123" },
      tokens,
    } as unknown as SignInResponse);

    expect(args.businessId).toBe("abc123");
    expect(args.ownerId).toBe("abc123");
  });

  it("reports the actual keys when no identifier is found", async () => {
    await expect(
      sessionArgsFromSignIn({
        user: { emailAddress: "a@b.com" },
        tokens,
      } as unknown as SignInResponse),
    ).rejects.toThrow(/emailAddress/);
  });
});

/**
 * Regression guard for the sign-in that reported failure after succeeding.
 *
 * The captured website URL is saved AFTER the session cookie is written. When
 * that save threw, the auth catch block turned an established session into
 * "Something went wrong signing you in", skipped the redirect, and left the
 * user on the login form — while also having already deleted the cookie
 * holding the URL, so it was lost. Both symptoms, one cause.
 */
describe("savePendingWebsiteUrl", () => {
  it("reports saved so the caller can clear the cookie", async () => {
    const calls: Array<[string, string]> = [];
    const result = await savePendingWebsiteUrl(
      { saveWebsiteUrl: async (id, url) => void calls.push([id, url]) },
      "a@b.com",
      "novaflow.io",
    );

    expect(result.saved).toBe(true);
    expect(calls).toEqual([["a@b.com", "novaflow.io"]]);
  });

  it("does nothing, and reports nothing to clear, when no URL was captured", async () => {
    let called = false;
    const result = await savePendingWebsiteUrl(
      { saveWebsiteUrl: async () => void (called = true) },
      "a@b.com",
      null,
    );

    expect(result.saved).toBe(false);
    expect(called).toBe(false);
  });

  it("SWALLOWS a failing save — the session is already valid, so this must never be fatal", async () => {
    await expect(
      savePendingWebsiteUrl(
        {
          saveWebsiteUrl: async () => {
            throw new ApiError(500, undefined, "PUT not supported on this route");
          },
        },
        "a@b.com",
        "novaflow.io",
      ),
    ).resolves.toEqual({ saved: false });
  });

  it("reports not-saved on failure, so the captured URL is kept for a retry", async () => {
    const result = await savePendingWebsiteUrl(
      {
        saveWebsiteUrl: async () => {
          throw new Error("network fault");
        },
      },
      "a@b.com",
      "novaflow.io",
    );

    expect(result.saved).toBe(false);
  });
});

describe("sessionArgsFromSignIn — the Firebase uid", () => {
  it("keeps the uid even when the account is keyed on its email", async () => {
    const args = await sessionArgsFromSignIn(LIVE_RESPONSE);

    // businessId is the email (the backend's tables are email-keyed) but the
    // uid is a separate fact we must not lose.
    expect(args.businessId).toBe("thilak@ntimes.ai");
    expect(args.userId).toBe("abc123");
  });

  it("reads the legacy `uid` spelling too", async () => {
    const args = await sessionArgsFromSignIn({
      user: { uid: "legacy-id", email: "a@b.com" },
      tokens,
    } as unknown as SignInResponse);

    expect(args.userId).toBe("legacy-id");
  });
});

describe("savePendingWebsiteUrl — userId passthrough", () => {
  it("forwards the uid so the profile row carries `userId`", async () => {
    const calls: Array<[string, string, string | undefined]> = [];
    await savePendingWebsiteUrl(
      { saveWebsiteUrl: async (id, url, uid) => void calls.push([id, url, uid]) },
      "a@b.com",
      "novaflow.io",
      "firebase-uid-123",
    );

    expect(calls).toEqual([["a@b.com", "novaflow.io", "firebase-uid-123"]]);
  });

  it("omits the uid rather than sending an empty one when there isn't one", async () => {
    const calls: Array<string | undefined> = [];
    await savePendingWebsiteUrl(
      { saveWebsiteUrl: async (_id, _url, uid) => void calls.push(uid) },
      "a@b.com",
      "novaflow.io",
    );

    expect(calls).toEqual([undefined]);
  });
});
