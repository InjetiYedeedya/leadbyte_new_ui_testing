import { isProbePath } from "./probe-paths";

describe("isProbePath", () => {
  it.each([
    "/.env",
    "/.git/config",
    "/test/.env",
    "/vue/.env",
    "/.env.swp",
    "/wp-login.php",
    "/wp-admin/setup-config.php",
    "/xmlrpc.php",
    "/backup.sql",
    "/config.yml",
    "/cgi-bin/luci",
    "/phpmyadmin/",
  ])("treats %s as a probe", (path) => {
    expect(isProbePath(path)).toBe(true);
  });

  it.each([
    "/",
    "/overview",
    "/agents/meta-ads",
    "/agents/blog-posting",
    "/background-video",
    "/connections/google/callback",
    "/api/locations",
    "/.well-known/security.txt",
    "/_next/static/chunks/main.js",
  ])("leaves %s to the app", (path) => {
    expect(isProbePath(path)).toBe(false);
  });
});
