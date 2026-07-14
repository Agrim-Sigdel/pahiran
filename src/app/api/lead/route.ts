import { createClient } from "@supabase/supabase-js";

/* Shopper "I'm interested" → vendor leads inbox. Anonymous shoppers can't
   write through RLS, so the server inserts with the service role after
   validating shape and capping sizes. */

export async function POST(req: Request): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return Response.json({ error: "Leads need Supabase configured" }, { status: 500 });
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

  const sb = createClient(url, key, { auth: { persistSession: false } });

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

  const { error } = await sb.from("leads").insert({
    shop_id: shopId,
    garment_id: garmentId,
    name: String(body?.name || "").slice(0, 80) || null,
    phone: String(body?.phone || "").slice(0, 30) || null,
    size: String(body?.size || "").slice(0, 20) || null,
  });
  if (error) {
    console.error("[lead] insert failed", error.message);
    return Response.json({ error: "Could not save your interest" }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
