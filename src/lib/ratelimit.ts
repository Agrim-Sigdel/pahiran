import type { SupabaseClient } from "@supabase/supabase-js";

/* Server-side rate-limit buckets. Backed by the rate_limits table when a
   service-role client is passed (works across serverless instances);
   in-memory otherwise (local dev). Fail-open on DB errors: a broken
   limiter should never take the product down. */

const mem = new Map<string, { count: number; resetAt: number }>();

export async function overLimit(
  sb: SupabaseClient | null,
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const now = Date.now();
  if (!sb) {
    const b = mem.get(key);
    if (!b || now > b.resetAt) {
      mem.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }
    b.count += 1;
    return b.count > limit;
  }
  try {
    const { data } = await sb.from("rate_limits").select("*").eq("key", key).maybeSingle();
    if (!data || now > new Date(data.reset_at).getTime()) {
      await sb.from("rate_limits").upsert({
        key,
        count: 1,
        reset_at: new Date(now + windowMs).toISOString(),
      });
      return false;
    }
    const count = data.count + 1;
    await sb.from("rate_limits").update({ count }).eq("key", key);
    return count > limit;
  } catch {
    return false;
  }
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
}
