import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mapCategory } from "@/lib/constants";
import { overLimit, clientIp } from "@/lib/ratelimit";

/* Server-side proxy for fal.ai FASHN try-on.
   - FAL_KEY stays on the server (set it in .env.local).
   - Results cached by (person, garment, category) hash; cache hits are free
     and do NOT consume rate-limit quota.
   - Abuse controls: per-IP limit + global daily generation cap
     (TRYON_DAILY_CAP env, default 500) so a distributed abuser can't drain
     the fal account. In Supabase mode the garment must exist in the shop's
     catalog — the server uses the catalog's own image URL and ignores
     arbitrary URLs from the client.
   - With SUPABASE_SERVICE_ROLE_KEY set, cache/limits live in Postgres and
     every try-on lands in tryon_events for analytics; in-memory otherwise. */

const FAL_ENDPOINT = "https://fal.run/fal-ai/fashn/tryon/v1.6";

const IP_LIMIT = 30; // generations per IP per window
const IP_WINDOW_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGE_CHARS = 4_000_000; // ~3MB of base64 — far above the app's own compression

const memCache = new Map<string, string>();

function dailyCap(): number {
  const n = Number(process.env.TRYON_DAILY_CAP);
  return Number.isFinite(n) && n > 0 ? n : 500;
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
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
  cached: boolean,
  sessionId: string | null
): Promise<void> {
  if (!sb || !garmentId) return;
  await sb
    .from("tryon_events")
    .insert({ shop_id: shopId, garment_id: garmentId, cached, session_id: sessionId });
}

export async function POST(req: Request): Promise<Response> {
  if (!process.env.FAL_KEY) {
    return Response.json(
      { error: "Server missing FAL_KEY — add it to .env.local" },
      { status: 500 }
    );
  }

  const sb = serviceClient();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { personImage, category } = body || {};
  const garmentId: string | null = typeof body?.garmentId === "string" ? body.garmentId : null;
  const sessionId: string | null =
    typeof body?.sessionId === "string" ? body.sessionId.slice(0, 64) : null;

  if (!personImage?.startsWith("data:image/") || personImage.length > MAX_IMAGE_CHARS) {
    return Response.json(
      { error: "personImage must be a reasonably sized image data URL" },
      { status: 400 }
    );
  }

  /* Resolve the garment. Supabase mode: it must exist in a shop's catalog —
     the server trusts only the catalog's own image URL, so strangers can't
     spend our fal credits on arbitrary images. Local mode (no Supabase):
     the kiosk sends the garment photo as a data URL. */
  let garmentImage: string;
  let shopId: string | null = null;
  if (sb) {
    if (!garmentId) {
      return Response.json({ error: "garmentId is required" }, { status: 400 });
    }
    const { data: garment } = await sb
      .from("garments")
      .select("shop_id, image_url, tryon_enabled")
      .eq("id", garmentId)
      .maybeSingle();
    if (!garment || !garment.tryon_enabled) {
      return Response.json({ error: "Unknown garment" }, { status: 400 });
    }
    garmentImage = garment.image_url;
    shopId = garment.shop_id;
  } else {
    garmentImage = typeof body?.garmentImage === "string" ? body.garmentImage : "";
    if (!garmentImage.startsWith("data:image/") || garmentImage.length > MAX_IMAGE_CHARS) {
      return Response.json(
        { error: "garmentImage must be a reasonably sized image data URL" },
        { status: 400 }
      );
    }
  }

  const key = crypto
    .createHash("sha256")
    .update(personImage + "|" + garmentImage + "|" + (category || ""))
    .digest("hex");

  // Cache hits are free: no fal spend, so no quota consumed.
  const cachedUrl = await cacheGet(sb, key);
  if (cachedUrl) {
    await logEvent(sb, shopId, garmentId, true, sessionId);
    return Response.json({ url: cachedUrl, cached: true });
  }

  const ip = clientIp(req);
  if (await overLimit(sb, "tryon:ip:" + ip, IP_LIMIT, IP_WINDOW_MS)) {
    return Response.json(
      { error: "Too many try-ons right now — please wait a few minutes." },
      { status: 429 }
    );
  }
  const day = new Date().toISOString().slice(0, 10);
  if (await overLimit(sb, "tryon:global:" + day, dailyCap(), DAY_MS)) {
    await logError(sb, "global daily try-on cap reached", { day, cap: dailyCap() }, shopId);
    return Response.json(
      { error: "The try-on service is very busy today — please try again tomorrow." },
      { status: 429 }
    );
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
  await logEvent(sb, shopId, garmentId, false, sessionId);
  return Response.json({ url, cached: false });
}
