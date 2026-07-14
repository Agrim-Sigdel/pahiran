import { createClient } from "@supabase/supabase-js";
import { overLimit, clientIp } from "@/lib/ratelimit";

/* Error sink for client-side failures (kiosk try-on errors, dashboard save
   errors). Always lands in the server console (visible in Vercel logs);
   also persisted to error_logs when the service role key is set.
   Rate-limited per IP so the table can't be flooded. */

export async function POST(req: Request): Promise<Response> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const source = String(body?.source || "client").slice(0, 40);
  const message = String(body?.message || "unknown error").slice(0, 500);
  const shopId = typeof body?.detail?.shopId === "string" ? body.detail.shopId : null;
  let detail: Record<string, unknown> | null = null;
  try {
    const raw = JSON.stringify(body?.detail ?? null);
    detail = raw && raw.length <= 2000 ? body.detail : { truncated: raw?.slice(0, 2000) };
  } catch {}

  console.error(`[${source}] ${message}`, detail ?? "");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    if (await overLimit(sb, "log:ip:" + clientIp(req), 20, 10 * 60 * 1000)) {
      return new Response(null, { status: 429 });
    }
    await sb.from("error_logs").insert({ source, message, detail, shop_id: shopId });
  }
  return new Response(null, { status: 204 });
}
