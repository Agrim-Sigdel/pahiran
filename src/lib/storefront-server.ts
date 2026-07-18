/* Server-only reads for storefront metadata (generateMetadata). Uses the anon
   key — public read RLS on shops/garments allows it — and creates a throwaway
   client per request. Returns null in local mode (no Supabase), where there's
   no server-side data and pages fall back to the generic site metadata. */

import { createClient } from "@supabase/supabase-js";
import { rowToGarment, type Garment, type Shop, type ShopRow, type GarmentRow } from "@/lib/types";

function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function rowToShop(r: ShopRow): Shop {
  return {
    id: r.id, slug: r.slug, name: r.name, area: r.area ?? "",
    whatsapp: r.whatsapp ?? "", listed: r.listed ?? false,
    lat: r.lat ?? null, lng: r.lng ?? null,
  };
}

/** Shop + its first in-stock garment (for the collection OG image). */
export async function fetchShopMeta(slug: string): Promise<{ shop: Shop; cover: Garment | null } | null> {
  const sb = serverClient();
  if (!sb) return null;
  const { data: shopRow } = await sb.from("shops").select("*").eq("slug", slug).maybeSingle();
  if (!shopRow) return null;
  const shop = rowToShop(shopRow as ShopRow);
  const { data: g } = await sb
    .from("garments")
    .select("*")
    .eq("shop_id", shop.id)
    .eq("in_stock", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { shop, cover: g ? rowToGarment(g as GarmentRow) : null };
}

/** A single garment plus its shop, for the product-page OG card. */
export async function fetchGarmentMeta(slug: string, garmentId: string): Promise<{ shop: Shop; garment: Garment } | null> {
  const sb = serverClient();
  if (!sb) return null;
  const { data: shopRow } = await sb.from("shops").select("*").eq("slug", slug).maybeSingle();
  if (!shopRow) return null;
  const shop = rowToShop(shopRow as ShopRow);
  const { data: g } = await sb
    .from("garments")
    .select("*")
    .eq("id", garmentId)
    .eq("shop_id", shop.id)
    .maybeSingle();
  if (!g) return null;
  return { shop, garment: rowToGarment(g as GarmentRow) };
}
