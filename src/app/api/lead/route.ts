import { createClient } from "@supabase/supabase-js";
import { overLimit, clientIp } from "@/lib/ratelimit";
import { badOrigin } from "@/lib/origin";

/* Shopper "I'm interested" → vendor leads inbox. Anonymous shoppers can't
   write through RLS, so the server inserts with the service role after
   validating shape and capping sizes. Rate-limited per IP so nobody can
   flood a vendor's inbox.

   Two shapes, one endpoint: the kiosk sends a single piece, the storefront bag
   sends `items` — the whole checkout in one request. One request per line
   would burn the shopper's rate-limit budget on their own order, so a
   five-piece bag has to cost what a one-piece bag costs. */

const MAX_ITEMS = 20;

interface Item {
  garmentId: string | null;
  compositionId: string | null;
  size: string | null;
  qty: number;
}

function readItem(raw: any): Item | null {
  const garmentId = typeof raw?.garmentId === "string" ? raw.garmentId : null;
  const compositionId = typeof raw?.compositionId === "string" ? raw.compositionId : null;
  if (!garmentId && !compositionId) return null;
  return {
    garmentId: compositionId ? null : garmentId,
    compositionId,
    size: String(raw?.size || "").slice(0, 20) || null,
    qty: Math.min(99, Math.max(1, Math.round(Number(raw?.qty) || 1))),
  };
}

export async function POST(req: Request): Promise<Response> {
  if (badOrigin(req)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
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
  const raw: any[] = Array.isArray(body?.items) ? body.items : [body];
  if (raw.length > MAX_ITEMS) {
    return Response.json({ error: `A bag can hold at most ${MAX_ITEMS} lines` }, { status: 400 });
  }
  const items = raw.map(readItem).filter((x: Item | null): x is Item => x !== null);
  if (!shopId || items.length === 0) {
    return Response.json(
      { error: "shopId and one of garmentId / compositionId are required" },
      { status: 400 }
    );
  }

  const name = String(body?.name || "").trim().slice(0, 80);
  const phone = String(body?.phone || "").trim().slice(0, 30);
  if (name.length < 2 || phone.replace(/\D/g, "").length < 7) {
    return Response.json({ error: "name and phone are required" }, { status: 400 });
  }

  /* All lines of one bag carry the same client-minted order_ref so the
     vendor's inbox can regroup them into one order. Untrusted, but harmless:
     it only ever groups rows within one shop. */
  const orderRef = String(body?.orderRef || "").trim().slice(0, 40) || null;
  const kind = body?.kind === "enquiry" ? "enquiry" : "order";

  /* Who placed it. The id comes from verifying the shopper's own access token,
     never from the body — a client-sent user_id would let anyone file orders
     into someone else's history. An expired token just means a guest order:
     losing the history is better than losing the sale. */
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  let userId: string | null = null;
  if (token) {
    const { data } = await sb.auth.getUser(token);
    userId = data.user?.id ?? null;
  }

  /* Every piece must really belong to the shop — keeps junk out of inboxes. A
     composition must also be published: a lead for a render the vendor never
     offered is a promise nobody made. Both lists are fetched once, not per
     line, so a big bag is still two queries.

     The price comes back from the same query and is snapshotted onto the row:
     taking the client's number would let a shopper name their own price. */
  const garmentIds = items.map((i) => i.garmentId).filter(Boolean) as string[];
  const compositionIds = items.map((i) => i.compositionId).filter(Boolean) as string[];
  const priceById = new Map<string, number>();

  if (garmentIds.length) {
    const { data } = await sb.from("garments").select("id, price_npr").eq("shop_id", shopId).in("id", garmentIds);
    for (const g of (data as any[]) || []) priceById.set(g.id, Number(g.price_npr) || 0);
  }
  if (compositionIds.length) {
    const { data } = await sb
      .from("compositions")
      .select("id, price_npr")
      .eq("shop_id", shopId)
      .eq("published", true)
      .eq("status", "ready")
      .in("id", compositionIds);
    for (const c of (data as any[]) || []) priceById.set(c.id, Number(c.price_npr) || 0);
  }

  const rows = items
    .filter((i) => priceById.has((i.compositionId || i.garmentId) as string))
    .map((i) => ({
      shop_id: shopId,
      garment_id: i.garmentId,
      composition_id: i.compositionId,
      name,
      phone,
      size: i.size,
      order_ref: orderRef,
      qty: i.qty,
      unit_price: priceById.get((i.compositionId || i.garmentId) as string) ?? null,
      kind,
      user_id: userId,
    }));

  /* A bag whose pieces were all deleted mid-shop is not an order to save, and
     silently returning 204 would tell the shopper the shop has it. */
  if (rows.length === 0) {
    return Response.json({ error: "Unknown or unpublished piece" }, { status: 400 });
  }

  const { error } = await sb.from("leads").insert(rows);
  if (error) {
    console.error("[lead] insert failed", error.message);
    return Response.json({ error: "Could not save your interest" }, { status: 500 });
  }
  return Response.json({ saved: rows.length, skipped: items.length - rows.length });
}
