/* Cross-site guard for spend/write API routes. A browser fetch from another
   site always carries an Origin header, so blocking mismatched Origins stops
   other websites from spending our try-on credits or flooding a vendor's
   inbox. Same-origin fetches, native shares, and non-browser clients send no
   Origin and pass through. Extra allowed hosts come from ALLOWED_ORIGINS
   (comma-separated), e.g. "peeq.app,www.peeq.app".

   Two wildcard forms are accepted, both intended for staging only:
     "*"            — allow every origin, i.e. disable this guard entirely
     "*.vercel.app" — allow any subdomain of that suffix
   A bare "*" means any website can spend try-on credits and post to vendor
   lead inboxes on that deployment. Never set it in production. */

export function badOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false; // same-origin GET, curl, share sheet, etc.

  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return true; // malformed Origin
  }

  const allowed = new Set<string>();
  const suffixes: string[] = [];
  const reqHost = req.headers.get("host");
  if (reqHost) allowed.add(reqHost);
  for (const entry of (process.env.ALLOWED_ORIGINS || "").split(",")) {
    const t = entry.trim();
    if (!t) continue;
    if (t === "*") return false; // guard disabled for this deployment
    if (t.startsWith("*.")) {
      const suffix = t.slice(1); // "*.vercel.app" → ".vercel.app"
      if (suffix.includes(".", 1)) suffixes.push(suffix.toLowerCase());
      continue;
    }
    try {
      allowed.add(new URL(t.includes("://") ? t : "https://" + t).host);
    } catch {
      /* ignore malformed allowlist entries */
    }
  }
  if (allowed.has(host)) return false;
  const lower = host.toLowerCase();
  // Suffix match on a host boundary: ".vercel.app" matches "x.vercel.app" but
  // never "evil-vercel.app", and never the bare suffix itself.
  return !suffixes.some((s) => lower.endsWith(s));
}
