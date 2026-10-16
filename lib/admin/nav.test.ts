import { ADMIN_NAV, firstAllowedHref, isActiveNav, navFor } from "./nav";
import { ALL_MODULES, DEFAULT_RBAC_MATRIX, normalizeMatrix } from "./rbac";

const hrefs = (groups: ReturnType<typeof navFor>) => groups.flatMap((g) => g.items.map((i) => i.href));

describe("admin navigation", () => {
  it("shows everything to the super admin", () => {
    expect(hrefs(navFor("super_admin", DEFAULT_RBAC_MATRIX))).toHaveLength(15);
  });

  it("shows a manager what every admin saw before roles: no pricing, coupons or API keys", () => {
    const manager = hrefs(navFor("manager", DEFAULT_RBAC_MATRIX));
    expect(manager).not.toContain("/admin/api-keys");
    expect(manager).not.toContain("/admin/pricing");
    expect(manager).not.toContain("/admin/coupons");
    expect(manager).toContain("/admin/roles");
    expect(manager).toHaveLength(12);
  });

  it("follows an edited matrix and drops a group with nothing left in it", () => {
    const none = Object.fromEntries(ALL_MODULES.map((m) => [m, []]));
    const matrix = normalizeMatrix({ developer: { ...none, errors: ["read"] } });
    const groups = navFor("developer", matrix);
    expect(hrefs(groups)).toEqual(["/admin/errors"]);
    expect(groups.map((g) => g.id)).toEqual(["operations"]);
    expect(firstAllowedHref("developer", matrix)).toBe("/admin/errors");
  });

  it("names a real module for every item", () => {
    for (const item of ADMIN_NAV.flatMap((g) => g.items)) {
      expect(ALL_MODULES).toContain(item.module);
    }
  });

  it("lights Overview only on the overview itself", () => {
    expect(isActiveNav("/admin", "/admin")).toBe(true);
    expect(isActiveNav("/admin", "/admin/clients")).toBe(false);
    expect(isActiveNav("/admin/clients", "/admin/clients")).toBe(true);
    expect(isActiveNav("/admin/agents", "/admin/agents-x")).toBe(false);
  });
});
