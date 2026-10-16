import { buildInviteRow, checkClaim, claimUrl, inviteEmailBody, inviteRefusal } from "./invites";

describe("admin invites", () => {
  it("refuses bad addresses and anyone who is already an admin or invited", () => {
    expect(inviteRefusal("not-an-email", [])).toBe("invalid");
    expect(inviteRefusal("a@x.test", [{ email: "A@x.test", status: "pending" }])).toBe("exists");
    expect(inviteRefusal("a@x.test", [{ email: "a@x.test", status: "active" }])).toBe("exists");
    // A starting admin with no row is already an admin.
    expect(inviteRefusal("Thilak@ntimes.ai", [])).toBe("exists");
    expect(inviteRefusal(" new@x.test ", [])).toBeNull();
  });

  it("lets a revoked admin be invited again", () => {
    expect(inviteRefusal("a@x.test", [{ email: "a@x.test", status: "revoked" }])).toBeNull();
    expect(inviteRefusal("thilak@ntimes.ai", [{ email: "thilak@ntimes.ai", status: "revoked" }])).toBeNull();
  });

  it("builds a pending row and a claim link from the app's own origin", () => {
    const row = buildInviteRow("New@x.test", "Me@x.test", "tok", new Date("2026-09-20T00:00:00Z"));
    expect(row).toEqual({
      email: "new@x.test",
      status: "pending",
      // The default role, kept through the claim.
      role: "manager",
      token: "tok",
      invited_by: "me@x.test",
      invited_at: "2026-09-20T00:00:00.000Z",
      created_at: "2026-09-20T00:00:00.000Z",
    });
    expect(buildInviteRow("n@x.test", "m@x.test", "t", new Date(0), "developer").role).toBe("developer");
    expect(claimUrl("https://app.test", "a b")).toBe("https://app.test/admin/claim?token=a%20b");
    expect(inviteEmailBody("n@x.test", "m@x.test", "u", new Date(0))).toMatchObject({
      request_type: "admin_invite",
      user_email: "n@x.test",
      claim_url: "u",
    });
  });

  it("claims only with the matching token on a pending row", () => {
    expect(checkClaim(null, "tok")).toBe("no-invite");
    expect(checkClaim({ status: "active" }, "tok")).toBe("already-active");
    expect(checkClaim({}, "tok")).toBe("already-active");
    expect(checkClaim({ status: "pending", token: "tok" }, "other")).toBe("bad-token");
    expect(checkClaim({ status: "pending" }, "")).toBe("bad-token");
    expect(checkClaim({ status: "pending", token: "tok" }, "tok")).toBe("claim");
  });
});
