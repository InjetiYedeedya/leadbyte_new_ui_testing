import { isPublicWebsite } from "./url-safety";

describe("isPublicWebsite", () => {
  it("accepts ordinary websites, with or without a scheme", () => {
    for (const url of ["example.com", "https://go.chefgaa.com/menu", "http://shop.example.co.uk"]) {
      expect(isPublicWebsite(url)).toBe(true);
    }
  });

  it("refuses addresses inside a network", () => {
    for (const url of [
      "169.254.169.254/latest/meta-data/",
      "http://localhost:8080",
      "10.0.0.5",
      "[::1]",
      "2130706433",
      "intranet",
      "printer.local",
      "https://example.com:22",
      "file:///etc/passwd",
      "https://user:pass@example.com",
      "",
    ]) {
      expect(isPublicWebsite(url)).toBe(false);
    }
  });
});
