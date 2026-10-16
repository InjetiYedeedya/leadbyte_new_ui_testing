import { describe, expect, it } from "vitest";
import { authErrorMessage, GENERIC_AUTH_ERROR, isExpectedAuthError, isStaleDeployError } from "./errors";

describe("authErrorMessage", () => {
  it("does not reveal whether an email has an account", () => {
    const notFound = authErrorMessage({ code: "auth/user-not-found" });
    const wrongPassword = authErrorMessage({ code: "auth/wrong-password" });
    const invalid = authErrorMessage({ code: "auth/invalid-credential" });

    expect(notFound).toBe("Email or password is incorrect.");
    expect(wrongPassword).toBe(notFound);
    expect(invalid).toBe(notFound);
  });

  it("returns null for a dismissed popup so nothing is shown", () => {
    expect(authErrorMessage({ code: "auth/popup-closed-by-user" })).toBeNull();
    expect(authErrorMessage({ code: "auth/cancelled-popup-request" })).toBeNull();
  });

  it("maps sign-up specific codes", () => {
    expect(authErrorMessage({ code: "auth/email-already-in-use" })).toBe(
      "An account with that email already exists.",
    );
    expect(authErrorMessage({ code: "auth/weak-password" })).toBe(
      "Password must be at least 6 characters.",
    );
  });

  it("falls back to the generic message for unknown codes", () => {
    expect(authErrorMessage({ code: "auth/some-code-we-have-never-seen" })).toBe(
      GENERIC_AUTH_ERROR,
    );
  });

  it("never leaks the raw code", () => {
    const message = authErrorMessage({ code: "auth/internal-error-xyz" });
    expect(message).not.toContain("auth/");
  });

  it("handles values that are not Firebase errors at all", () => {
    expect(authErrorMessage(null)).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage("a string")).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage(new Error("boom"))).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage({ code: 42 })).toBe(GENERIC_AUTH_ERROR);
  });
});

describe("isStaleDeployError", () => {
  it("recognises a page older than the server's Server Actions", () => {
    expect(isStaleDeployError(new Error('Failed to find Server Action "abc". This request might be from an older or newer deployment.'))).toBe(true);
    expect(isStaleDeployError(new Error('Server Action "abc" was not found on the server.'))).toBe(true);
  });

  it("leaves every other failure alone", () => {
    expect(isStaleDeployError({ code: "auth/wrong-password" })).toBe(false);
    expect(isStaleDeployError(new Error("Network error"))).toBe(false);
    expect(isStaleDeployError(null)).toBe(false);
  });
});

describe("isExpectedAuthError", () => {
  it("treats a wrong password and a closed popup as the person's doing", () => {
    expect(isExpectedAuthError({ code: "auth/invalid-credential" })).toBe(true);
    expect(isExpectedAuthError({ code: "auth/popup-closed-by-user" })).toBe(true);
  });

  it("keeps anything unrecognised as a real error", () => {
    expect(isExpectedAuthError({ code: "auth/internal-error" })).toBe(false);
    expect(isExpectedAuthError(new Error("boom"))).toBe(false);
    expect(isExpectedAuthError(null)).toBe(false);
  });
});
