import { ALLOWED_UPLOAD_TYPES, maxUploadBytes, safeFileName } from "./uploads";

describe("upload safety", () => {
  it("never lets a file name steer the storage path", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\x\\banner ad (1).png")).toBe("banner_ad_1_.png");
    expect(safeFileName("...hidden")).toBe("hidden");
    expect(safeFileName("")).toBe("file");
  });

  it("refuses types a browser would run as a page", () => {
    expect(ALLOWED_UPLOAD_TYPES.has("image/svg+xml")).toBe(false);
    expect(ALLOWED_UPLOAD_TYPES.has("text/html")).toBe(false);
    expect(ALLOWED_UPLOAD_TYPES.has("image/png")).toBe(true);
    expect(ALLOWED_UPLOAD_TYPES.has("text/csv")).toBe(true);
  });

  it("allows bigger video than anything else", () => {
    expect(maxUploadBytes("video/mp4")).toBeGreaterThan(maxUploadBytes("image/png"));
  });
});
