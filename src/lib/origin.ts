/* Cross-site guard for spend/write API routes. A browser fetch from another
   site always carries an Origin header, so blocking mismatched Origins stops
   other websites from spending our try-on credits or flooding a vendor's
   inbox. Same-origin fetches, native shares, and non-browser clients send no
   Origin and pass through. Extra allowed hosts come from ALLOWED_ORIGINS
   (comma-separated), e.g. "peeq.app,www.peeq.app". */

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
  const reqHost = req.headers.get("host");
  if (reqHost) allowed.add(reqHost);
  for (const entry of (process.env.ALLOWED_ORIGINS || "").split(",")) {
    const t = entry.trim();
    if (!t) continue;
    try {
      allowed.add(new URL(t.includes("://") ? t : "https://" + t).host);
    } catch {
      /* ignore malformed allowlist entries */
    }
  }
  return !allowed.has(host);
}
