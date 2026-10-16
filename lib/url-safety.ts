/**
 * Is this a public website we may hand to a crawler?
 *
 * The website a customer types is passed to the backend's crawler and to the
 * AEO audit service, which fetch it from inside AWS. Anything was accepted —
 * `169.254.169.254` (the cloud metadata address), `localhost:8080`, a private
 * IP — which turns our crawler into a way to probe networks it should never
 * reach (audit, 2026-09-25). The backend must also check after DNS
 * resolution; this refuses the obvious cases before a request is ever made.
 *
 * Accepts a bare host (`example.com`) as the entry form does.
 */
export function isPublicWebsite(input: string): boolean {
  const raw = input.trim();
  if (raw === "") return false;

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  if (url.port !== "" && url.port !== "80" && url.port !== "443") return false;

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  // An IP literal, v4 or v6: a real business website has a name.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[") || host.includes(":")) return false;
  // Also refuse all-numeric forms like `2130706433` that some parsers read as IPs.
  if (/^[\d.]+$/.test(host) || /^0x/i.test(host)) return false;
  if (!host.includes(".")) return false;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/.test(host)) return false;

  return true;
}

export const NOT_PUBLIC_WEBSITE =
  "Enter your public website address, like yourcompany.com.";

/**
 * A same-site path to go back to, or the fallback.
 *
 * `startsWith("/") && !startsWith("//")` let `/\evil.com` through, which a
 * browser reads as `//evil.com` — another site. Only a plain path with no
 * backslash, no scheme and no protocol-relative start is returned.
 */
export function safeReturnPath(value: string | undefined | null, fallback: string): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
