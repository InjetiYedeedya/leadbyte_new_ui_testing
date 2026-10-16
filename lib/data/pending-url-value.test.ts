import { decodePendingUrl, encodePendingUrl, pendingUrlAtSignIn } from "./pending-url-value";

describe("pendingUrlAtSignIn", () => {
  it("saves a typed site straight away only for a brand-new account", () => {
    expect(pendingUrlAtSignIn("site.com", true)).toBe("save");
  });

  it("never overwrites an existing account's website at sign-in", () => {
    expect(pendingUrlAtSignIn("zippygo.ai", false)).toBe("confirm");
  });

  it("treats an account the backend did not call new as existing", () => {
    expect(pendingUrlAtSignIn("zippygo.ai", undefined)).toBe("confirm");
  });

  it("does nothing when no site was typed", () => {
    expect(pendingUrlAtSignIn(null, true)).toBe("none");
    expect(pendingUrlAtSignIn("", false)).toBe("none");
  });
});

describe("pending url cookie value", () => {
  it("keeps a url typed while signed out free for whoever signs up", () => {
    const raw = encodePendingUrl("novaflow.io");
    expect(raw).toBe("novaflow.io");
    expect(decodePendingUrl(raw, "new@example.com")).toBe("novaflow.io");
  });

  it("gives a url typed while signed in back to that account", () => {
    const raw = encodePendingUrl("zippygo.ai", "team@zippygo.ai");
    expect(decodePendingUrl(raw, "team@zippygo.ai")).toBe("zippygo.ai");
  });

  it("never hands one account's url to another", () => {
    const raw = encodePendingUrl("zippygo.ai", "team@zippygo.ai");
    expect(decodePendingUrl(raw, "new@example.com")).toBeNull();
    expect(decodePendingUrl(raw, null)).toBeNull();
  });

  it("survives an account name with odd characters", () => {
    const raw = encodePendingUrl("site.com", "a|b+c@x.io");
    expect(decodePendingUrl(raw, "a|b+c@x.io")).toBe("site.com");
  });

  it("reads nothing from an empty cookie", () => {
    expect(decodePendingUrl(undefined, "a@b.c")).toBeNull();
    expect(decodePendingUrl("", "a@b.c")).toBeNull();
  });
});
