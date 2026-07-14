import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mapCategory } from "@/lib/constants";

/* Server-side proxy for fal.ai FASHN try-on.
   - FAL_KEY stays on the server (set it in .env.local).
   - Results are cached by (person, garment, category) hash so re-trying
     the same combination costs nothing.
   - Per-IP rate limiting caps generation spend.
   With SUPABASE_SERVICE_ROLE_KEY set, cache + rate buckets live in Postgres
   (tryon_results / rate_limits) so they survive restarts and work across
   serverless instances; every try-on is also logged to tryon_events for
   the vendor's "most-tried items" analytics. Otherwise both are in-memory. */

const FAL_ENDPOINT = "https://fal.run/fal-ai/fashn/tryon/v1.6";

const RATE_LIMIT = 30; // generations per IP per window
const RATE_WINDOW_MS = 10 * 60 * 1000;

const memCache = new Map<string, string>();
const memBuckets = new Map<string, { count: number; resetAt: number }>();

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function rateLimited(sb: SupabaseClient | null, ip: string): Promise<boolean> {
  const now = Date.now();
  if (!sb) {
    const b = memBuckets.get(ip);
    if (!b || now > b.resetAt) {
      memBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
      return false;
    }
    b.count += 1;
    return b.count > RATE_LIMIT;
  }
  const { data } = await sb.from("rate_limits").select("*").eq("ip", ip).maybeSingle();
  if (!data || now > new Date(data.reset_at).getTime()) {
    await sb.from("rate_limits").upsert({
      ip,
      count: 1,
      reset_at: new Date(now + RATE_WINDOW_MS).toISOString(),
    });
    return false;
  }
  const count = data.count + 1;
  await sb.from("rate_limits").update({ count }).eq("ip", ip);
  return count > RATE_LIMIT;
}

async function cacheGet(sb: SupabaseClient | null, key: string): Promise<string | null> {
  if (!sb) return memCache.get(key) ?? null;
  const { data } = await sb
    .from("tryon_results")
    .select("result_url")
    .eq("cache_key", key)
    .maybeSingle();
  return data?.result_url ?? null;
}

async function cachePut(
  sb: SupabaseClient | null,
  key: string,
  url: string,
  shopId: string | null,
  garmentId: string | null
): Promise<void> {
  if (!sb) {
    memCache.set(key, url);
    return;
  }
  await sb.from("tryon_results").upsert(
    { cache_key: key, result_url: url, shop_id: shopId, garment_id: garmentId },
    { onConflict: "cache_key" }
  );
}

async function logError(
  sb: SupabaseClient | null,
  message: string,
  detail: Record<string, unknown>,
  shopId: string | null
): Promise<void> {
  console.error("[tryon-api]", message, detail);
  if (!sb) return;
  await sb
    .from("error_logs")
    .insert({ source: "tryon-api", message: message.slice(0, 500), detail, shop_id: shopId })
    .then(() => {}, () => {});
}

async function logEvent(
  sb: SupabaseClient | null,
  shopId: string | null,
  garmentId: string | null,
  cached: boolean
): Promise<void> {
  if (!sb || !garmentId) return;
  await sb.from("tryon_events").insert({ shop_id: shopId, garment_id: garmentId, cached });
}

export async function POST(req: Request): Promise<Response> {
  if (!process.env.FAL_KEY) {
    return Response.json(
      { error: "Server missing FAL_KEY — add it to .env.local" },
      { status: 500 }
    );
  }

  const sb = serviceClient();
  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (await rateLimited(sb, ip)) {
    return Response.json(
      { error: "Too many try-ons right now — please wait a few minutes." },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { personImage, garmentImage, category } = body || {};
  const shopId: string | null = typeof body?.shopId === "string" ? body.shopId : null;
  const garmentId: string | null = typeof body?.garmentId === "string" ? body.garmentId : null;
  const garmentIsUrl = typeof garmentImage === "string" && /^https:\/\//.test(garmentImage);
  if (
    !personImage?.startsWith("data:image/") ||
    !(garmentImage?.startsWith("data:image/") || garmentIsUrl)
  ) {
    return Response.json(
      { error: "personImage must be an image data URL; garmentImage a data URL or https URL" },
      { status: 400 }
    );
  }

  const key = crypto
    .createHash("sha256")
    .update(personImage + "|" + garmentImage + "|" + (category || ""))
    .digest("hex");

  const cachedUrl = await cacheGet(sb, key);
  if (cachedUrl) {
    await logEvent(sb, shopId, garmentId, true);
    return Response.json({ url: cachedUrl, cached: true });
  }

  let res: globalThis.Response;
  try {
    res = await fetch(FAL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: "Key " + process.env.FAL_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_image: personImage,
        garment_image: garmentImage,
        category: mapCategory(category),
        mode: "balanced",
        output_format: "jpeg",
      }),
    });
  } catch (e: any) {
    await logError(sb, "fal.ai unreachable: " + (e?.message || e), { garmentId, category }, shopId);
    return Response.json({ error: "Try-on service unreachable" }, { status: 502 });
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    await logError(
      sb,
      "fal.ai error " + res.status,
      { status: res.status, response: txt.slice(0, 300), garmentId, category },
      shopId
    );
    return Response.json(
      { error: "Try-on service error (" + res.status + ")" },
      { status: 502 }
    );
  }

  const data = await res.json();
  const url: string | undefined = data?.images?.[0]?.url;
  if (!url) {
    await logError(sb, "fal.ai returned no image", { garmentId, category }, shopId);
    return Response.json({ error: "Try-on service returned no image" }, { status: 502 });
  }

  await cachePut(sb, key, url, shopId, garmentId);
  await logEvent(sb, shopId, garmentId, false);
  return Response.json({ url, cached: false });
}
