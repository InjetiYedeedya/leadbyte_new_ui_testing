import { STARTING_ADMIN_ROLES, buildRoster, isActiveAdminRow, isStartingAdmin, roleFor } from "./roles";

describe("admin roles", () => {
  it("gives starting admins their starting role while they have no row", () => {
    expect(roleFor("Thilak@ntimes.ai", null)).toBe("super_admin");
    expect(roleFor("srini@ntimes.ai", null)).toBe("manager");
    expect(roleFor("apps@ntimes.ai", null)).toBe("manager");
    expect(roleFor("someone@example.com", null)).toBeNull();
    expect(roleFor("", null)).toBeNull();
    expect(isStartingAdmin(" KIRAN@ntimes.ai ")).toBe(true);
    expect(isStartingAdmin("someone@example.com")).toBe(false);
  });

  it("lets a row decide for a starting admin — nobody is locked in code", () => {
    // The old owner can be demoted…
    expect(roleFor("thilak@ntimes.ai", { email: "thilak@ntimes.ai", status: "active", role: "developer" })).toBe("developer");
    // …and revoked, which a deleted row could not do.
    expect(roleFor("thilak@ntimes.ai", { email: "thilak@ntimes.ai", status: "revoked", role: "super_admin" })).toBeNull();
    expect(roleFor("srini@ntimes.ai", { email: "srini@ntimes.ai", status: "revoked" })).toBeNull();
    expect(roleFor("srini@ntimes.ai", { email: "srini@ntimes.ai", role: "team_lead" })).toBe("team_lead");
    // Someone else's row never sets a starting admin's role.
    expect(roleFor("srini@ntimes.ai", { email: "x@x.test", role: "developer" })).toBe("manager");
  });

  it("grants access for a claimed row and a legacy row with no status", () => {
    expect(roleFor("a@x.test", { email: "a@x.test", status: "active" })).toBe("manager");
    expect(roleFor("a@x.test", { email: "a@x.test" })).toBe("manager");
  });

  it("does not grant access for a pending invite", () => {
    expect(isActiveAdminRow({ email: "a@x.test", status: "pending" })).toBe(false);
    expect(roleFor("a@x.test", { email: "a@x.test", status: "pending" })).toBeNull();
  });

  it("reads the role from the admin's own row, defaulting to manager", () => {
    expect(roleFor("a@x.test", { email: "a@x.test", status: "active", role: "developer" })).toBe("developer");
    // Super admin can be given to anyone.
    expect(roleFor("a@x.test", { email: "a@x.test", status: "active", role: "super_admin" })).toBe("super_admin");
    // But never by a pending invite, or by someone else's row.
    expect(roleFor("a@x.test", { email: "a@x.test", status: "pending", role: "super_admin" })).toBeNull();
    expect(roleFor("a@x.test", { email: "b@x.test", status: "active", role: "super_admin" })).toBeNull();
  });

  it("never lists the saved permission matrix as an admin", () => {
    const roster = buildRoster([{ email: "config#rbac-matrix", status: "config", matrix: "{}" }]);
    expect(roster.active.map((a) => a.email)).not.toContain("config#rbac-matrix");
    expect(roster.pending).toEqual([]);
  });

  it("refuses a row that belongs to a different email", () => {
    expect(roleFor("a@x.test", { email: "b@x.test", status: "active" })).toBeNull();
  });

  it("lists super admins first, then by email, and splits pending from active", () => {
    const roster = buildRoster([
      { email: "b@x.test", status: "active", role: "super_admin", invited_by: "thilak@ntimes.ai", claimed_at: "2026-01-02" },
      { email: "p@x.test", status: "pending", token: "t1", invited_at: "2026-02-01" },
      { email: "thilak@ntimes.ai", role: "manager", created_at: "2025-01-01" },
      { email: "legacy@x.test", added_by: "someone" },
      { email: "B@x.test", status: "active" },
      { email: "srini@ntimes.ai", status: "revoked" },
    ]);
    // Starting admins without a row are listed too; a revoked one is not.
    expect(roster.active.map((a) => a.email)).toEqual([
      "b@x.test",
      "apps@ntimes.ai",
      "kiran@ntimes.ai",
      "legacy@x.test",
      "raja@ntimes.ai",
      "thilak@ntimes.ai",
    ]);
    expect(roster.active[5]).toMatchObject({ role: "manager", since: "2025-01-01" });
    expect(roster.active[3]).toMatchObject({ invitedBy: "someone" });
    expect(roster.active[1]).toMatchObject({ role: "manager", since: "" });
    expect(roster.pending).toEqual([{ email: "p@x.test", role: "manager", invitedBy: "", invitedAt: "2026-02-01", token: "t1" }]);
  });

  it("starts with exactly one super admin", () => {
    expect(Object.values(STARTING_ADMIN_ROLES).filter((role) => role === "super_admin")).toHaveLength(1);
  });
});
