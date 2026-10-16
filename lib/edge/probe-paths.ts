/**
 * Whether a path is a bot looking for something to break into, not a person.
 *
 * Scanners walk every site for `/.env`, `/.git/config`, `wp-login.php` and the
 * like. None of those exist here, so each one used to render the full 404 page
 * through Next — 50-300ms of CPU apiece, on a Cloudflare plan that allows
 * 10ms per request. 322 of them in one day's log (2026-10-10). `worker.ts`
 * answers these with a bare 404 before Next starts.
 *
 * Deliberately narrow: only shapes no page of ours can ever have. A dotfile
 * (except `/.well-known/`, which is a real standard), anything `.php`, and
 * WordPress / CGI paths.
 */
export function isProbePath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  if (path.startsWith("/.well-known/")) return false;
  if (path.includes("/.")) return true;
  if (/\.(php\d?|asp|aspx|jsp|cgi|env|ini|sql|bak|swp|yml|yaml|log)$/.test(path)) return true;
  if (/(^|\/)(wp-admin|wp-content|wp-includes|wp-login|wp-json|xmlrpc|cgi-bin|phpmyadmin)(\/|\.|$)/.test(path)) {
    return true;
  }
  return false;
}
