import { cachedScan, dropAdminScans, rememberScan } from "./scan-cache";

const READ = { ok: true, rows: [{ email: "a@x.test" }], error: null };

describe("admin scan cache", () => {
  beforeEach(() => dropAdminScans());

  it("returns a remembered read inside the window, and forgets it after", () => {
    rememberScan("users", READ, 1_000);
    expect(cachedScan("users", 20_000)).toEqual(READ);
    expect(cachedScan("users", 40_000)).toBeNull();
  });

  it("never remembers a failed read", () => {
    rememberScan("users", { ok: false, rows: [], error: "timed out" }, 1_000);
    expect(cachedScan("users", 1_500)).toBeNull();
  });

  it("forgets everything after a write", () => {
    rememberScan("users", READ, 1_000);
    rememberScan("orders", READ, 1_000);
    dropAdminScans();
    expect(cachedScan("users", 1_500)).toBeNull();
    expect(cachedScan("orders", 1_500)).toBeNull();
  });
});
