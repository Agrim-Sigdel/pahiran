import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mapCategory } from "@/lib/constants";
import { overLimit, clientIp } from "@/lib/ratelimit";
import { consumeTryon, refundTryon } from "@/lib/plan";
import { badOrigin } from "@/lib/origin";

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
const OPENAI_ENDPOINT = "https://api.openai.com/v1/images/edits";

/* Two shopper-facing finishes (model names are never disclosed to the UI):
   - "quick"  → fal/FASHN v1.6 — dedicated try-on, seconds.
   - "studio" → OpenAI gpt-image-2 image edit — slower, finer detail.
   Studio silently falls back to quick when no OpenAI key is configured. */
type Finish = "quick" | "studio";

const openaiKey = () => process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY;

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

const RESULTS_BUCKET = "results"; // private bucket — signed-URL access only
const SIGNED_TTL_SEC = 3600; // signed result URLs live 1h — covers a shopper session

/** Fresh signed URL for a stored render, or null if signing fails. */
async function signResult(sb: SupabaseClient, path: string): Promise<string | null> {
  const { data } = await sb.storage.from(RESULTS_BUCKET).createSignedUrl(path, SIGNED_TTL_SEC);
  return data?.signedUrl ?? null;
}

/** Cache read → a servable URL. Private renders (result_path) are re-signed on
    every read; legacy rows fall back to their stored result_url. */
async function cacheGet(sb: SupabaseClient | null, key: string): Promise<string | null> {
  if (!sb) return memCache.get(key) ?? null;
  const { data } = await sb
    .from("tryon_results")
    .select("result_url, result_path")
    .eq("cache_key", key)
    .maybeSingle();
  if (!data) return null;
  if (data.result_path) {
    const signed = await signResult(sb, data.result_path);
    if (signed) return signed;
  }
  return data.result_url || null;
}

/** Upload render bytes to the private bucket, cache the path, return a signed
    URL. Returns null on any storage failure so the caller can fall back. */
async function storeResult(
  sb: SupabaseClient,
  key: string,
  bytes: Buffer,
  contentType: string,
  shopId: string | null,
  garmentId: string | null
): Promise<string | null> {
  const ext = contentType.includes("png") ? "png" : "jpg";
  const path = key + "." + ext;
  const { error } = await sb.storage
    .from(RESULTS_BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) return null;
  await sb.from("tryon_results").upsert(
    { cache_key: key, result_path: path, result_url: "", shop_id: shopId, garment_id: garmentId },
    { onConflict: "cache_key" }
  );
  return signResult(sb, path);
}

/** Legacy/fallback cache write for a plain URL (memory cache in local mode,
    or a provider URL when private storage was unavailable). */
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

/** Best-effort abuse check on the shopper's own photo before we spend on it.
    Only clearly disallowed uploads are blocked; a normal clothed photo never
    trips these. No OpenAI key → skipped (fail open). */
async function moderatePerson(personImage: string): Promise<boolean> {
  const k = openaiKey();
  if (!k) return true;
  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { Authorization: "Bearer " + k, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "omni-moderation-latest",
        input: [{ type: "image_url", image_url: { url: personImage } }],
      }),
    });
    if (!res.ok) return true; // moderation outage shouldn't block real shoppers
    const cats = (await res.json())?.results?.[0]?.categories || {};
    return !(cats["sexual"] || cats["sexual/minors"]);
  } catch {
    return true;
  }
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

/** Studio finish: gpt-image-2 image edit with try-on guardrails. Returns a
    data URL; the caller uploads it to storage in Supabase mode. */
async function runStudio(personImage: string, garmentImage: string, category: string): Promise<string> {
  const toFile = async (src: string, name: string): Promise<File> => {
    if (src.startsWith("data:")) {
      const [head, b64] = src.split(",");
      return new File([Buffer.from(b64, "base64")], name, { type: head.match(/data:(.*?);/)?.[1] || "image/jpeg" });
    }
    const r = await fetch(src);
    if (!r.ok) throw new Error("garment image fetch failed (" + r.status + ")");
    return new File([await r.arrayBuffer()], name, { type: r.headers.get("content-type") || "image/jpeg" });
  };
  const form = new FormData();
  form.append("model", "gpt-image-2");
  form.append("size", "1024x1536");
  form.append("quality", "medium");
  form.append(
    "prompt",
    `Virtual try-on. Take off the ${category || "clothing"} the person in the first image is currently wearing ` +
      `and dress them in the exact garment from the second image instead — the old garment must be fully gone, ` +
      `not visible underneath or through the new one.

Guardrails:
- Same person: identical face, hair, skin tone, body shape, pose, camera angle and background as the first image.
- Exact outfit: the garment's color, pattern, neckline, sleeves and details must match the second image precisely — do not redesign it.
- No glitches: no warped or extra limbs, hands and fingers intact, no floating or melted fabric, no double garments, no added people, text or watermarks.
- Result must look like a real photograph of this person wearing this garment, nothing else changed.`
  );
  form.append("image[]", await toFile(personImage, "person.jpg"));
  form.append("image[]", await toFile(garmentImage, "garment.jpg"));
  const res = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: { Authorization: "Bearer " + openaiKey() },
    body: form,
  });
  if (!res.ok) throw new Error("studio provider error " + res.status + ": " + (await res.text()).slice(0, 300));
  const b64 = (await res.json())?.data?.[0]?.b64_json;
  if (!b64) throw new Error("studio provider returned no image");
  return "data:image/png;base64," + b64;
}

export async function POST(req: Request): Promise<Response> {
  if (badOrigin(req)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
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
  let finish: Finish = body?.finish === "studio" && openaiKey() ? "studio" : "quick";
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

  // studio results are cached separately; quick keys stay unchanged
  const cacheKey = (f: Finish) =>
    crypto
      .createHash("sha256")
      .update(personImage + "|" + garmentImage + "|" + (category || "") + (f === "studio" ? "|studio" : ""))
      .digest("hex");
  let key = cacheKey(finish);

  // Cache hits are free: no spend, so no quota consumed.
  const cachedUrl = await cacheGet(sb, key);
  if (cachedUrl) {
    await logEvent(sb, shopId, garmentId, true, sessionId);
    return Response.json({ url: cachedUrl, cached: true });
  }

  // Abuse check on the shopper's own photo before we spend anything on it.
  if (!(await moderatePerson(personImage))) {
    return Response.json(
      { error: "This photo can't be used for try-on. Please use a clear, fully-clothed photo of yourself." },
      { status: 422 }
    );
  }

  const ip = clientIp(req);
  if (await overLimit(sb, "tryon:ip:" + ip, IP_LIMIT, IP_WINDOW_MS)) {
    return Response.json(
      { error: "Too many try-ons right now — please wait a few minutes." },
      { status: 429 }
    );
  }
  const day = new Date().toISOString().slice(0, 10);
  // Platform-wide money circuit-breaker: fail closed so a DB blip can't leak spend.
  if (await overLimit(sb, "tryon:global:" + day, dailyCap(), DAY_MS, { failClosed: true })) {
    await logError(sb, "global daily try-on cap reached", { day, cap: dailyCap() }, shopId);
    return Response.json(
      { error: "The try-on service is very busy today — please try again tomorrow." },
      { status: 429 }
    );
  }

  /* Per-shop plan metering (Supabase mode only — local mode has no plans).
     Reserve one generation now; refund below if it fails. If the shop's studio
     allowance is spent but quick remains, downgrade to quick instead of failing. */
  if (sb && shopId) {
    let res = await consumeTryon(sb, shopId, finish === "studio");
    if (!res.allowed && res.reason === "studio_limit") {
      finish = "quick";
      key = cacheKey(finish);
      const altCached = await cacheGet(sb, key); // a quick result may already be cached — free
      if (altCached) {
        await logEvent(sb, shopId, garmentId, true, sessionId);
        return Response.json({ url: altCached, cached: true, finish });
      }
      res = await consumeTryon(sb, shopId, false);
    }
    if (!res.allowed) {
      if (res.reason === "error") {
        await logError(sb, "plan meter unavailable", { shopId }, shopId);
        return Response.json(
          { error: "Try-on is briefly unavailable — please try again." },
          { status: 503 }
        );
      }
      /* Not a spending problem, so it doesn't read as one: the shop is
         pending, rejected or suspended. Mostly reached by a vendor testing
         their own kiosk before approval — public traffic can't see the shop
         at all, since RLS hides unapproved shops from anon reads. */
      /* A catalog-only shop has no try-on at all. The storefront never offers
         the button, so reaching this means a hand-typed /k/ URL. */
      if (res.reason === "tryon_not_enabled") {
        return Response.json(
          {
            error: "This shop doesn't offer try-on — browse the catalog instead.",
            reason: res.reason,
          },
          { status: 403 }
        );
      }
      if (res.reason === "not_approved") {
        return Response.json(
          {
            error: "This shop isn't open for try-ons yet — it's awaiting approval. We'll call the owner once it's approved.",
            reason: res.reason,
          },
          { status: 403 }
        );
      }
      return Response.json(
        {
          error: "This shop has used up its try-ons for now — ask the staff, or check back soon.",
          reason: res.reason,
        },
        { status: 402 }
      );
    }
  }

  if (finish === "studio") {
    try {
      const dataUrl = await runStudio(personImage, garmentImage, category);
      if (sb) {
        const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
        const signed = await storeResult(sb, key, bytes, "image/png", shopId, garmentId);
        await logEvent(sb, shopId, garmentId, false, sessionId);
        // storage failed → serve the render once, uncached, still private (data URL)
        return Response.json({ url: signed || dataUrl, cached: false, finish });
      }
      memCache.set(key, dataUrl); // local mode
      await logEvent(sb, shopId, garmentId, false, sessionId);
      return Response.json({ url: dataUrl, cached: false, finish });
    } catch (e: any) {
      if (sb && shopId) await refundTryon(sb, shopId, true);
      await logError(sb, "studio try-on failed: " + (e?.message || e), { garmentId, category }, shopId);
      return Response.json({ error: "Try-on service error" }, { status: 502 });
    }
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
    if (sb && shopId) await refundTryon(sb, shopId, false);
    await logError(sb, "fal.ai unreachable: " + (e?.message || e), { garmentId, category }, shopId);
    return Response.json({ error: "Try-on service unreachable" }, { status: 502 });
  }

  if (!res.ok) {
    if (sb && shopId) await refundTryon(sb, shopId, false);
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
    if (sb && shopId) await refundTryon(sb, shopId, false);
    await logError(sb, "fal.ai returned no image", { garmentId, category }, shopId);
    return Response.json({ error: "Try-on service returned no image" }, { status: 502 });
  }

  // Move the render off the provider's public URL into our private bucket.
  if (sb) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error("result fetch " + r.status);
      const ct = r.headers.get("content-type") || "image/jpeg";
      const bytes = Buffer.from(await r.arrayBuffer());
      const signed = await storeResult(sb, key, bytes, ct, shopId, garmentId);
      if (signed) {
        await logEvent(sb, shopId, garmentId, false, sessionId);
        return Response.json({ url: signed, cached: false, finish });
      }
    } catch (e: any) {
      await logError(sb, "result storage failed: " + (e?.message || e), { garmentId }, shopId);
    }
    // storage unavailable → cache the provider URL so the render still works
  }

  await cachePut(sb, key, url, shopId, garmentId);
  await logEvent(sb, shopId, garmentId, false, sessionId);
  return Response.json({ url, cached: false, finish });
}
