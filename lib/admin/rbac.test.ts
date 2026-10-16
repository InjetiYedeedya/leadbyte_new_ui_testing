import {
  ALL_MODULES,
  DEFAULT_RBAC_MATRIX,
  RBAC_CONFIG_KEY,
  can,
  cellValue,
  isConfigRow,
  matrixFromForm,
  matrixFromRows,
  matrixRow,
  normalizeMatrix,
  parseAssignableRole,
} from "@/lib/admin/rbac";

describe("normalizeMatrix", () => {
  it("fills missing roles and modules from the defaults", () => {
    const m = normalizeMatrix({ manager: { errors: [] } });
    expect(m.manager.errors).toEqual([]);
    expect(m.manager.requests).toEqual(DEFAULT_RBAC_MATRIX.manager.requests);
    expect(m.team_lead).toEqual(DEFAULT_RBAC_MATRIX.team_lead);
  });

  it("drops unknown permissions and makes write include read", () => {
    const m = normalizeMatrix({ developer: { errors: ["write", "delete"], requests: ["admin"] } });
    expect(m.developer.errors).toEqual(["read", "write"]);
    expect(m.developer.requests).toEqual([]);
  });

  it("never lets a read-only module carry write", () => {
    expect(normalizeMatrix({ manager: { clients: ["read", "write"] } }).manager.clients).toEqual(["read"]);
  });

  it("always gives super_admin full access, whatever was saved", () => {
    const m = normalizeMatrix({ super_admin: { rbac: [], api_keys: [] } });
    expect(m.super_admin.rbac).toEqual(["read", "write"]);
    expect(m.super_admin.api_keys).toEqual(["read", "write"]);
    expect(m.super_admin.clients).toEqual(["read"]);
  });

  it("treats garbage as the defaults", () => {
    expect(normalizeMatrix("nonsense").manager).toEqual(DEFAULT_RBAC_MATRIX.manager);
    expect(normalizeMatrix(null).developer).toEqual(DEFAULT_RBAC_MATRIX.developer);
  });
});

describe("default matrix", () => {
  it("gives manager exactly the access every admin had before roles", () => {
    const m = DEFAULT_RBAC_MATRIX.manager;
    expect(m.pricing).toEqual([]);
    expect(m.coupons).toEqual([]);
    expect(m.api_keys).toEqual([]);
    expect(m.rbac).toEqual(["read"]);
    expect(m.grant_access).toEqual(["read", "write"]);
  });

  it("has every module for every role", () => {
    for (const row of Object.values(DEFAULT_RBAC_MATRIX)) {
      expect(Object.keys(row).sort()).toEqual([...ALL_MODULES].sort());
    }
  });
});

describe("can", () => {
  it("reads the matrix, and super_admin can do anything", () => {
    expect(can(DEFAULT_RBAC_MATRIX, "developer", "grant_access", "read")).toBe(false);
    expect(can(DEFAULT_RBAC_MATRIX, "team_lead", "requests", "write")).toBe(true);
    expect(can(DEFAULT_RBAC_MATRIX, "super_admin", "api_keys", "write")).toBe(true);
  });
});

describe("parseAssignableRole", () => {
  it("accepts every role, super admin included, and nothing else", () => {
    expect(parseAssignableRole(" Team_Lead ")).toBe("team_lead");
    expect(parseAssignableRole("super_admin")).toBe("super_admin");
    expect(parseAssignableRole("admin")).toBeNull();
    expect(parseAssignableRole(undefined)).toBeNull();
  });
});

describe("the saved row", () => {
  it("round-trips through the table, normalized", () => {
    const edited = normalizeMatrix({ developer: { api_keys: ["read", "write"] } });
    const row = matrixRow(edited, "thilak@ntimes.ai", new Date("2026-10-02T10:00:00Z"));
    expect(row).toMatchObject({ email: RBAC_CONFIG_KEY, status: "config", updated_by: "thilak@ntimes.ai" });
    expect(matrixFromRows([{ email: "a@b.com" }, row])?.developer.api_keys).toEqual(["read", "write"]);
  });

  it("reads no saved matrix as null, and a corrupt one as null", () => {
    expect(matrixFromRows([{ email: "a@b.com" }])).toBeNull();
    expect(matrixFromRows([{ email: RBAC_CONFIG_KEY, matrix: "{not json" }])).toBeNull();
  });

  it("is never mistaken for an admin", () => {
    expect(isConfigRow({ email: RBAC_CONFIG_KEY })).toBe(true);
    expect(isConfigRow({ email: "jane@ntimes.ai" })).toBe(false);
  });
});

describe("matrixFromForm", () => {
  it("reads one field per cell and ignores anything posted for super_admin", () => {
    const fields = new Map<string, string>([
      ["perm:developer:api_keys", "write"],
      ["perm:manager:errors", "none"],
      ["perm:super_admin:rbac", "none"],
    ]);
    const m = matrixFromForm({ get: (name) => fields.get(name) ?? null });
    expect(m.developer.api_keys).toEqual(["read", "write"]);
    expect(m.manager.errors).toEqual([]);
    // Unposted cells are "none": the editor posts every cell it shows.
    expect(m.team_lead.requests).toEqual([]);
    expect(m.super_admin.rbac).toEqual(["read", "write"]);
  });

  it("maps permissions to the editor's three choices", () => {
    expect(cellValue([])).toBe("none");
    expect(cellValue(["read"])).toBe("read");
    expect(cellValue(["read", "write"])).toBe("write");
  });
});
