import type { SupabaseClient } from "@supabase/supabase-js";

/* Server-side rate-limit buckets. Backed by the rate_limits table via an
   atomic incr_rate_limit() upsert when a service-role client is passed (safe
   across serverless instances and under concurrency); in-memory otherwise.

   If the DB call fails (outage, or the incr_rate_limit() function not yet
   installed), we fall back to a per-instance in-memory limiter rather than
   hard-blocking or leaking spend — a limit still applies, it just isn't shared
   across serverless instances until the DB recovers. The `failClosed` hint is
   retained for callers guarding real money. */

const mem = new Map<string, { count: number; resetAt: number }>();

function memOverLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = mem.get(key);
  if (!b || now > b.resetAt) {
    mem.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  b.count += 1;
  return b.count > limit;
}

export async function overLimit(
  sb: SupabaseClient | null,
  key: string,
  limit: number,
  windowMs: number,
  _opts: { failClosed?: boolean } = {}
): Promise<boolean> {
  if (!sb) return memOverLimit(key, limit, windowMs);
  try {
    const { data, error } = await sb.rpc("incr_rate_limit", { p_key: key, p_window_ms: windowMs });
    if (error) throw error;
    return (data as number) > limit;
  } catch {
    // DB/function unavailable → still cap, in-memory, instead of bricking.
    return memOverLimit(key, limit, windowMs);
  }
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
}
