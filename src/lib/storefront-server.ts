/* Server-only reads for storefront metadata (generateMetadata). Uses the anon
   key — public read RLS on shops/garments allows it — and creates a throwaway
   client per request. Returns null in local mode (no Supabase), where there's
   no server-side data and pages fall back to the generic site metadata. */

import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { rowToGarment, type Garment, type Shop, type ShopRow, type GarmentRow } from "@/lib/types";

/** True when the server can read shop data at all. Lets callers tell "no such
    shop" (→ 404) apart from "local mode, ask the browser instead". */
export function isServerSupabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function serverClient() {
  if (!isServerSupabaseConfigured()) return null;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

function rowToShop(r: ShopRow): Shop {
  return {
    id: r.id, slug: r.slug, vendorCode: r.vendor_code ?? null, name: r.name, area: r.area ?? "",
    whatsapp: r.whatsapp ?? "", listed: r.listed ?? false,
    lat: r.lat ?? null, lng: r.lng ?? null,
  };
}

/** Shop + its whole catalog, newest first — same ordering as loadCatalog, so
    the server-rendered grid and a later client refetch agree. This is the read
    that makes the storefront indexable: the collection ships in the initial
    HTML instead of appearing only after two client round-trips.

    cache()d for the request, so generateMetadata and the page body share one
    pair of queries rather than each running their own. */
export const fetchStorefront = cache(
  async (slug: string): Promise<{ shop: Shop; catalog: Garment[] } | null> => {
    const sb = serverClient();
    if (!sb) return null;
    const { data: shopRow } = await sb.from("shops").select("*").eq("slug", slug).maybeSingle();
    if (!shopRow) return null;
    const shop = rowToShop(shopRow as ShopRow);
    const { data } = await sb
      .from("garments")
      .select("*")
      .eq("shop_id", shop.id)
      .order("created_at", { ascending: false });
    return { shop, catalog: ((data as GarmentRow[]) || []).map(rowToGarment) };
  }
);

/** Shop + its first in-stock garment (for the collection OG image). */
export async function fetchShopMeta(slug: string): Promise<{ shop: Shop; cover: Garment | null } | null> {
  const found = await fetchStorefront(slug);
  if (!found) return null;
  return { shop: found.shop, cover: found.catalog.find((g) => g.inStock) ?? null };
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
