/* Storage adapter — the UI never touches persistence directly.
   Two backends behind one API:
   - localStorage (zero-setup, per-browser) when Supabase env vars are absent
   - Supabase (auth + Postgres + Storage bucket) when configured
   Garment photos are data URLs locally, public bucket URLs on Supabase. */

import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { dataURLToBlob } from "@/lib/images";
import {
  type Garment,
  type Shop,
  type TryOnStat,
  type GarmentRow,
  type ShopRow,
  rowToGarment,
} from "@/lib/types";

const PREFIX = "pahiran:";

const lsGet = (k: string): string | null =>
  typeof window === "undefined" ? null : localStorage.getItem(PREFIX + k);
const lsSet = (k: string, v: string) => localStorage.setItem(PREFIX + k, v);
const lsDel = (k: string) => localStorage.removeItem(PREFIX + k);

function rowToShop(r: ShopRow): Shop {
  return { id: r.id, slug: r.slug, name: r.name, area: r.area ?? "" };
}

/* ---------- vendor's own shop (auth-scoped in Supabase mode) ---------- */

export async function loadShop(): Promise<Shop | null> {
  if (!isSupabaseConfigured()) {
    try {
      const s = lsGet("shop:profile");
      return s ? { id: null, slug: null, ...JSON.parse(s) } : null;
    } catch {
      return null;
    }
  }
  const sb = supabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  const { data } = await sb.from("shops").select("*").eq("owner", auth.user.id).maybeSingle();
  if (data) return rowToShop(data as ShopRow);
  // first login: provision the shop row with a stable slug
  const base = (auth.user.email?.split("@")[0] || "shop")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "shop";
  const slug = base + "-" + Math.random().toString(36).slice(2, 6);
  const { data: created, error } = await sb
    .from("shops")
    .insert({ owner: auth.user.id, slug, name: "", area: "" })
    .select()
    .single();
  if (error) throw error;
  return rowToShop(created as ShopRow);
}

export async function saveShop(profile: Shop): Promise<void> {
  if (!isSupabaseConfigured()) {
    try {
      lsSet("shop:profile", JSON.stringify({ name: profile.name, area: profile.area }));
    } catch {}
    return;
  }
  if (!profile.id) return;
  await supabase()
    .from("shops")
    .update({ name: profile.name, area: profile.area })
    .eq("id", profile.id);
}

/** Change the shop's public /k/{slug} link. Supabase mode only. */
export async function updateShopSlug(shop: Shop, slug: string): Promise<Shop> {
  if (!isSupabaseConfigured() || !shop.id) {
    throw new Error("Custom links need Supabase mode");
  }
  const { data, error } = await supabase()
    .from("shops")
    .update({ slug })
    .eq("id", shop.id)
    .select()
    .single();
  if (error) {
    throw error.code === "23505"
      ? new Error("That link is already taken — try another.")
      : error;
  }
  return rowToShop(data as ShopRow);
}

/* ---------- public lookup for /k/[slug] ---------- */

export async function getShopBySlug(slug: string): Promise<Shop | null> {
  if (!isSupabaseConfigured()) return loadShop(); // local mode: the one implicit shop
  const { data } = await supabase().from("shops").select("*").eq("slug", slug).maybeSingle();
  return data ? rowToShop(data as ShopRow) : null;
}

/* ---------- catalog ---------- */

export async function loadCatalog(shopId?: string | null): Promise<Garment[]> {
  if (!isSupabaseConfigured()) {
    try {
      const ids: string[] = JSON.parse(lsGet("garments:index") || "[]");
      const items: Garment[] = [];
      for (const id of ids) {
        const g = lsGet("garment:" + id);
        if (!g) continue;
        const parsed = JSON.parse(g);
        items.push({
          sizes: [],
          inStock: true,
          tryonEnabled: true,
          stitchedToOrder: false,
          ...parsed,
          price: Number(parsed.price || 0),
        });
      }
      return items;
    } catch {
      return [];
    }
  }
  if (!shopId) return [];
  const { data } = await supabase()
    .from("garments")
    .select("*")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });
  return ((data as GarmentRow[]) || []).map(rowToGarment);
}

/** Persist a new garment; returns it with its final id + image URL. */
export async function addGarment(
  shop: Shop | null,
  garment: Omit<Garment, "id"> & { id?: string },
  existingIds: string[]
): Promise<Garment> {
  if (!isSupabaseConfigured()) {
    const g: Garment = { ...garment, id: garment.id || Date.now().toString(36) };
    lsSet("garment:" + g.id, JSON.stringify(g));
    lsSet("garments:index", JSON.stringify([g.id, ...existingIds]));
    return g;
  }
  if (!shop?.id) throw new Error("No shop — sign in first");
  const sb = supabase();
  // photo → Storage bucket, store the public URL (no data URLs in the DB)
  const path = shop.id + "/" + crypto.randomUUID() + ".jpg";
  const { error: upErr } = await sb.storage
    .from("garments")
    .upload(path, dataURLToBlob(garment.image), { contentType: "image/jpeg" });
  if (upErr) throw upErr;
  const { data: pub } = sb.storage.from("garments").getPublicUrl(path);
  const { data, error } = await sb
    .from("garments")
    .insert({
      shop_id: shop.id,
      name: garment.name,
      category: garment.category,
      price_npr: garment.price,
      image_url: pub.publicUrl,
      sizes: garment.sizes,
      in_stock: garment.inStock,
      tryon_enabled: garment.tryonEnabled,
      stitched_to_order: garment.stitchedToOrder,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToGarment(data as GarmentRow);
}

/** Update an existing garment. garment.image may be a fresh data URL (new
    photo) or the unchanged stored URL; previousImage is what was stored. */
export async function updateGarment(
  shop: Shop | null,
  garment: Garment,
  previousImage: string
): Promise<Garment> {
  if (!isSupabaseConfigured()) {
    lsSet("garment:" + garment.id, JSON.stringify(garment));
    return garment;
  }
  if (!shop?.id) throw new Error("No shop — sign in first");
  const sb = supabase();
  let imageUrl = garment.image;
  const photoChanged = garment.image.startsWith("data:");
  if (photoChanged) {
    const path = shop.id + "/" + crypto.randomUUID() + ".jpg";
    const { error: upErr } = await sb.storage
      .from("garments")
      .upload(path, dataURLToBlob(garment.image), { contentType: "image/jpeg" });
    if (upErr) throw upErr;
    imageUrl = sb.storage.from("garments").getPublicUrl(path).data.publicUrl;
  }
  const { data, error } = await sb
    .from("garments")
    .update({
      name: garment.name,
      category: garment.category,
      price_npr: garment.price,
      image_url: imageUrl,
      sizes: garment.sizes,
      in_stock: garment.inStock,
      tryon_enabled: garment.tryonEnabled,
      stitched_to_order: garment.stitchedToOrder,
    })
    .eq("id", garment.id)
    .select()
    .single();
  if (error) throw error;
  if (photoChanged) {
    const oldPath = previousImage.split("/garments/")[1];
    if (oldPath) await sb.storage.from("garments").remove([decodeURIComponent(oldPath)]);
  }
  return rowToGarment(data as GarmentRow);
}

export async function removeGarment(garment: Garment, remainingIds: string[]): Promise<void> {
  if (!isSupabaseConfigured()) {
    lsDel("garment:" + garment.id);
    lsSet("garments:index", JSON.stringify(remainingIds));
    return;
  }
  const sb = supabase();
  await sb.from("garments").delete().eq("id", garment.id);
  const path = garment.image.split("/garments/")[1];
  if (path) await sb.storage.from("garments").remove([decodeURIComponent(path)]);
}

export async function setGarmentStock(garment: Garment, inStock: boolean): Promise<void> {
  if (!isSupabaseConfigured()) {
    lsSet("garment:" + garment.id, JSON.stringify({ ...garment, inStock }));
    return;
  }
  await supabase().from("garments").update({ in_stock: inStock }).eq("id", garment.id);
}

/* ---------- try-on analytics ("most-tried items") ---------- */

/** Local-mode only: server logs events itself when Supabase is configured. */
export function logLocalTryOn(garmentId: string): void {
  if (isSupabaseConfigured()) return;
  try {
    const stats = JSON.parse(lsGet("stats:tryons") || "{}");
    stats[garmentId] = (stats[garmentId] || 0) + 1;
    lsSet("stats:tryons", JSON.stringify(stats));
  } catch {}
}

export async function getTryOnStats(shopId?: string | null): Promise<TryOnStat[]> {
  if (!isSupabaseConfigured()) {
    try {
      const stats: Record<string, number> = JSON.parse(lsGet("stats:tryons") || "{}");
      return Object.entries(stats)
        .map(([garmentId, count]) => ({ garmentId, count }))
        .sort((a, b) => b.count - a.count);
    } catch {
      return [];
    }
  }
  if (!shopId) return [];
  const { data } = await supabase()
    .from("tryon_events")
    .select("garment_id")
    .eq("shop_id", shopId)
    .limit(10000);
  const counts = new Map<string, number>();
  for (const row of (data as { garment_id: string | null }[]) || []) {
    if (row.garment_id) counts.set(row.garment_id, (counts.get(row.garment_id) || 0) + 1);
  }
  return Array.from(counts, ([garmentId, count]) => ({ garmentId, count })).sort(
    (a, b) => b.count - a.count
  );
}
