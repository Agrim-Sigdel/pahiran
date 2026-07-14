import { createClient } from "@supabase/supabase-js";
import { overLimit, clientIp } from "@/lib/ratelimit";

/* Shopper "I'm interested" → vendor leads inbox. Anonymous shoppers can't
   write through RLS, so the server inserts with the service role after
   validating shape and capping sizes. Rate-limited per IP so nobody can
   flood a vendor's inbox. */

export async function POST(req: Request): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return Response.json({ error: "Leads need Supabase configured" }, { status: 500 });
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  if (await overLimit(sb, "lead:ip:" + clientIp(req), 5, 10 * 60 * 1000)) {
    return Response.json(
      { error: "Too many requests — please tell the staff directly." },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const shopId = typeof body?.shopId === "string" ? body.shopId : null;
  const garmentId = typeof body?.garmentId === "string" ? body.garmentId : null;
  if (!shopId || !garmentId) {
    return Response.json({ error: "shopId and garmentId are required" }, { status: 400 });
  }

  // The garment must really belong to the shop — keeps junk out of inboxes
  const { data: garment } = await sb
    .from("garments")
    .select("id")
    .eq("id", garmentId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (!garment) {
    return Response.json({ error: "Unknown garment" }, { status: 400 });
  }

  const name = String(body?.name || "").trim().slice(0, 80);
  const phone = String(body?.phone || "").trim().slice(0, 30);
  if (name.length < 2 || phone.replace(/\D/g, "").length < 7) {
    return Response.json({ error: "name and phone are required" }, { status: 400 });
  }

  const { error } = await sb.from("leads").insert({
    shop_id: shopId,
    garment_id: garmentId,
    name,
    phone,
    size: String(body?.size || "").slice(0, 20) || null,
  });
  if (error) {
    console.error("[lead] insert failed", error.message);
    return Response.json({ error: "Could not save your interest" }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
