/* Storage adapter — the UI never touches persistence directly.
   Two backends behind one API:
   - localStorage (zero-setup, per-browser) when Supabase env vars are absent
   - Supabase (auth + Postgres + Storage bucket) when configured
   Garment photos are data URLs locally, public bucket URLs on Supabase. */

import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { currentAccessToken, currentUserId } from "@/lib/account";
import { dataURLToBlob } from "@/lib/images";
import { colorText, familyLabel } from "@/lib/constants";
import { GLOBAL_STYLES } from "@/lib/style-library";
import {
  type Garment,
  type Shop,
  type TryOnEvent,
  type Lead,
  type OrderHistoryLine,
  type ErrorLog,
  type Fabric,
  type Style,
  type StyleCoverage,
  type StyleFamily,
  type Composition,
  type CounterInput,
  type CounterRun,
  type Wearable,
  type GarmentRow,
  type FabricRow,
  type StyleRow,
  type CompositionRow,
  type ShopRow,
  type PlanInfo,
  type Subscription,
  rowToGarment,
  rowToFabric,
  rowToStyle,
  rowToComposition,
} from "@/lib/types";

const PREFIX = "pahiran:";

const lsGet = (k: string): string | null =>
  typeof window === "undefined" ? null : localStorage.getItem(PREFIX + k);
const lsSet = (k: string, v: string) => localStorage.setItem(PREFIX + k, v);
const lsDel = (k: string) => localStorage.removeItem(PREFIX + k);

function rowToShop(r: ShopRow): Shop {
  // status falls back to 'approved' when the column isn't there yet (admin
  // console migration unapplied) — same fail-soft stance as listed/lat/lng, so
  // an un-migrated database doesn't lock every vendor out of their catalog.
  return { id: r.id, slug: r.slug, vendorCode: r.vendor_code ?? null, name: r.name, area: r.area ?? "", whatsapp: r.whatsapp ?? "", listed: r.listed ?? false, status: (r.status as Shop["status"]) ?? "approved", statusNote: r.status_note ?? null, type: (r.type as Shop["type"]) ?? "apparel", category: (r.category as Shop["category"]) ?? "clothing", lat: r.lat ?? null, lng: r.lng ?? null };
}

/* ---------- vendor's own shop (auth-scoped in Supabase mode) ---------- */

export async function loadShop(): Promise<Shop | null> {
  if (!isSupabaseConfigured()) {
    try {
      const s = lsGet("shop:profile");
      return s ? { id: null, slug: null, vendorCode: null, whatsapp: "", listed: false, status: "approved" as const, statusNote: null, type: "apparel" as const, category: "clothing" as const, lat: null, lng: null, ...JSON.parse(s) } : null;
    } catch {
      return null;
    }
  }
  const sb = supabase();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  /* Deliberately not maybeSingle(): shops.owner has no unique constraint, and
     maybeSingle() *errors* on more than one row. Swallowing that error made a
     duplicate look like "no shop yet", so the next line provisioned another
     empty shop and the vendor was shown the setup form again — which then made
     a third row, and so on. Read the rows, pick the real one, and only
     provision when there genuinely isn't one. */
  const { data: rows, error: readError } = await sb
    .from("shops")
    .select("*")
    .eq("owner", auth.user.id)
    .order("created_at", { ascending: true });
  if (readError) throw readError; // a failed read must never provision
  if (rows && rows.length > 0) {
    // A set-up shop beats a blank one; oldest wins as the tie-break.
    const best = rows.find((r) => (r.name ?? "").trim() !== "") ?? rows[0];
    return rowToShop(best as ShopRow);
  }
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
  if (!error) return rowToShop(created as ShopRow);

  /* 23505 = we lost a race. Two provisions can run at once — a double-invoked
     effect, or two tabs — and with shops_owner_key in place the loser's insert
     is rejected rather than quietly making a duplicate. Re-read instead of
     throwing: the winner's row is the answer, and throwing here would strand
     the dashboard on "Loading your shop…" forever.

     A unique violation on `slug` lands here too; the retry re-reads by owner,
     which is what we want either way. */
  if (error.code === "23505") {
    const { data: raced } = await sb
      .from("shops")
      .select("*")
      .eq("owner", auth.user.id)
      .order("created_at", { ascending: true })
      .limit(1);
    if (raced && raced.length > 0) return rowToShop(raced[0] as ShopRow);
  }
  throw error;
}

export async function saveShop(profile: Shop): Promise<void> {
  if (!isSupabaseConfigured()) {
    try {
      lsSet("shop:profile", JSON.stringify({
        name: profile.name, area: profile.area, whatsapp: profile.whatsapp, listed: profile.listed,
        type: profile.type, category: profile.category, lat: profile.lat, lng: profile.lng,
      }));
    } catch {}
    return;
  }
  if (!profile.id) return;
  const sb = supabase();
  const fields = { name: profile.name, area: profile.area, whatsapp: profile.whatsapp || null };
  const { error } = await sb.from("shops")
    .update({ ...fields, listed: profile.listed, lat: profile.lat, lng: profile.lng, type: profile.type, category: profile.category })
    .eq("id", profile.id);
  if (!error) return;
  if (error.code === "42703") {
    // shops.listed / lat / lng / type don't exist yet (20260714_shop_listed.sql,
    // 20260715_shop_location.sql or 20260721000300_shop_type.sql not applied) —
    // still persist the core profile so settings keep working.
    const { error: retryError } = await sb.from("shops").update(fields).eq("id", profile.id);
    if (retryError) throw retryError;
    return;
  }
  throw error;
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
          itemCode: null, // codes are server-assigned; localStorage mode has none
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

/** Look up one garment by its printed item code ("A7K2-0014").
    Codes are globally unique, but pass shopId on shop-scoped surfaces (kiosk,
    storefront) so a code from another vendor can't resolve there. */
export async function getGarmentByItemCode(
  code: string,
  shopId?: string | null
): Promise<Garment | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  if (!isSupabaseConfigured()) return null; // no codes in localStorage mode
  let q = supabase().from("garments").select("*").eq("item_code", normalized);
  if (shopId) q = q.eq("shop_id", shopId);
  const { data } = await q.maybeSingle();
  return data ? rowToGarment(data as GarmentRow) : null;
}

/** Persist a new garment; returns it with its final id + image URL. */
export async function addGarment(
  shop: Shop | null,
  // itemCode is assigned by the DB trigger, never by the caller
  garment: Omit<Garment, "id" | "itemCode"> & { id?: string },
  existingIds: string[]
): Promise<Garment> {
  if (!isSupabaseConfigured()) {
    const g: Garment = { ...garment, itemCode: null, id: garment.id || Date.now().toString(36) };
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

/* ---------- fabrics & styles (made-to-order) ---------- */

/* A fabric is a listing in its own right, so this mirrors the catalog block
   above rather than reusing it: different table, different bucket, its own
   item-code series off the same per-shop counter.

   Reads fail soft, exactly as loadCatalog does: the tables arrive in
   20260726000100, and a vendor whose project hasn't been migrated yet should
   see an empty Fabrics tab rather than a dashboard stuck on "Loading…".
   Writes still throw — a fabric that didn't save must not look like it did. */

const MISSING_TABLE = "42P01";

const lsFabrics = (): Fabric[] => {
  try {
    const ids: string[] = JSON.parse(lsGet("fabrics:index") || "[]");
    return ids
      .map((id) => lsGet("fabric:" + id))
      .filter((v): v is string => Boolean(v))
      .map((v) => JSON.parse(v) as Fabric)
      /* Rows written before 20260729000100 have one free-text colour and no
         shade. Supabase mode gets this from the migration; local mode has no
         migrations, so it happens on read. Same landing place either way:
         whatever the old box said becomes the main colour, unchanged. */
      .map((f) => ({
        ...f,
        colorPrimary: f.colorPrimary ?? f.color ?? "",
        colorSecondary: f.colorSecondary ?? "",
        colorPrimaryHex: f.colorPrimaryHex ?? "",
        colorSecondaryHex: f.colorSecondaryHex ?? "",
        color: colorText(f.colorPrimary ?? f.color ?? "", f.colorSecondary ?? ""),
      }));
  } catch {
    return [];
  }
};

export async function loadFabrics(shopId?: string | null): Promise<Fabric[]> {
  if (!isSupabaseConfigured()) return lsFabrics();
  if (!shopId) return [];
  const { data, error } = await supabase()
    .from("fabrics")
    .select("*")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });
  if (error) return []; // un-migrated project, or a transient read failure
  return ((data as FabricRow[]) || []).map(rowToFabric);
}

/** Look up one fabric by the code printed on its bolt tag ("A7K2-0014"). */
export async function getFabricByItemCode(
  code: string,
  shopId?: string | null
): Promise<Fabric | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized || !isSupabaseConfigured()) return null;
  let q = supabase().from("fabrics").select("*").eq("item_code", normalized);
  if (shopId) q = q.eq("shop_id", shopId);
  const { data, error } = await q.maybeSingle();
  if (error && error.code === MISSING_TABLE) return null;
  return data ? rowToFabric(data as FabricRow) : null;
}

/** Persist a new fabric; returns it with its final id, item code and image URL. */
export async function addFabric(
  shop: Shop | null,
  // itemCode is assigned by the DB trigger, never by the caller
  fabric: Omit<Fabric, "id" | "itemCode"> & { id?: string },
  existingIds: string[]
): Promise<Fabric> {
  if (!isSupabaseConfigured()) {
    const f: Fabric = { ...fabric, itemCode: null, id: fabric.id || Date.now().toString(36) };
    lsSet("fabric:" + f.id, JSON.stringify(f));
    lsSet("fabrics:index", JSON.stringify([f.id, ...existingIds]));
    return f;
  }
  if (!shop?.id) throw new Error("No shop — sign in first");
  const sb = supabase();
  const path = shop.id + "/" + crypto.randomUUID() + ".jpg";
  const { error: upErr } = await sb.storage
    .from("fabrics")
    .upload(path, dataURLToBlob(fabric.image), { contentType: "image/jpeg" });
  if (upErr) throw upErr;
  const { data: pub } = sb.storage.from("fabrics").getPublicUrl(path);
  const { data, error } = await sb
    .from("fabrics")
    .insert({
      shop_id: shop.id,
      name: fabric.name,
      family: fabric.family,
      image_url: pub.publicUrl,
      price_npr: fabric.price,
      unit: fabric.unit,
      composition: fabric.composition || null,
      color_primary: fabric.colorPrimary || null,
      color_secondary: fabric.colorSecondary || null,
      color_primary_hex: fabric.colorPrimaryHex || null,
      color_secondary_hex: fabric.colorSecondaryHex || null,
      // Derived, and written rather than computed on read: the counter's search
      // index and three card layouts read this one column.
      color: colorText(fabric.colorPrimary, fabric.colorSecondary) || null,
      note: fabric.note || null,
      in_stock: fabric.inStock,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToFabric(data as FabricRow);
}

/** Update a fabric. fabric.image may be a fresh data URL (new photo) or the
    unchanged stored URL; previousImage is what was stored. */
export async function updateFabric(
  shop: Shop | null,
  fabric: Fabric,
  previousImage: string
): Promise<Fabric> {
  if (!isSupabaseConfigured()) {
    lsSet("fabric:" + fabric.id, JSON.stringify(fabric));
    return fabric;
  }
  if (!shop?.id) throw new Error("No shop — sign in first");
  const sb = supabase();
  let imageUrl = fabric.image;
  const photoChanged = fabric.image.startsWith("data:");
  if (photoChanged) {
    const path = shop.id + "/" + crypto.randomUUID() + ".jpg";
    const { error: upErr } = await sb.storage
      .from("fabrics")
      .upload(path, dataURLToBlob(fabric.image), { contentType: "image/jpeg" });
    if (upErr) throw upErr;
    imageUrl = sb.storage.from("fabrics").getPublicUrl(path).data.publicUrl;
  }
  const { data, error } = await sb
    .from("fabrics")
    .update({
      name: fabric.name,
      family: fabric.family,
      image_url: imageUrl,
      price_npr: fabric.price,
      unit: fabric.unit,
      composition: fabric.composition || null,
      color_primary: fabric.colorPrimary || null,
      color_secondary: fabric.colorSecondary || null,
      color_primary_hex: fabric.colorPrimaryHex || null,
      color_secondary_hex: fabric.colorSecondaryHex || null,
      color: colorText(fabric.colorPrimary, fabric.colorSecondary) || null,
      note: fabric.note || null,
      in_stock: fabric.inStock,
    })
    .eq("id", fabric.id)
    .select()
    .single();
  if (error) throw error;
  if (photoChanged) {
    const oldPath = previousImage.split("/fabrics/")[1];
    if (oldPath) await sb.storage.from("fabrics").remove([decodeURIComponent(oldPath)]);
  }
  return rowToFabric(data as FabricRow);
}

export async function removeFabric(fabric: Fabric, remainingIds: string[]): Promise<void> {
  if (!isSupabaseConfigured()) {
    lsDel("fabric:" + fabric.id);
    lsSet("fabrics:index", JSON.stringify(remainingIds));
    return;
  }
  const sb = supabase();
  await sb.from("fabrics").delete().eq("id", fabric.id);
  const path = fabric.image.split("/fabrics/")[1];
  if (path) await sb.storage.from("fabrics").remove([decodeURIComponent(path)]);
}

export async function setFabricStock(fabric: Fabric, inStock: boolean): Promise<void> {
  if (!isSupabaseConfigured()) {
    lsSet("fabric:" + fabric.id, JSON.stringify({ ...fabric, inStock }));
    return;
  }
  await supabase().from("fabrics").update({ in_stock: inStock }).eq("id", fabric.id);
}

/** The cuts this shop offers: the platform-global library plus the shop's own,
    minus any global cut the shop has hidden because it can't stitch it.
    Local mode has no shop styles, so it gets the global library as-is. */
export async function loadStyles(
  shopId?: string | null,
  family?: StyleFamily
): Promise<Style[]> {
  const byFamily = (list: Style[]) =>
    (family ? list.filter((s) => s.family === family) : list)
      .sort((a, b) => a.family.localeCompare(b.family) || a.sort - b.sort);

  if (!isSupabaseConfigured()) return byFamily(GLOBAL_STYLES);

  const sb = supabase();
  // shop_id is null (global) OR this shop's own
  let q = sb.from("styles").select("*").eq("active", true);
  q = shopId ? q.or("shop_id.is.null,shop_id.eq." + shopId) : q.is("shop_id", null);
  if (family) q = q.eq("family", family);
  // On any read failure — un-migrated project included — fall back to the
  // built-in library. An empty cut list is a dead end; the global one is right.
  const { data, error } = await q;
  if (error) return byFamily(GLOBAL_STYLES);
  const styles = ((data as StyleRow[]) || []).map(rowToStyle);
  if (!shopId) return byFamily(styles);

  const { data: hidden } = await sb
    .from("shop_disabled_styles")
    .select("style_id")
    .eq("shop_id", shopId);
  const off = new Set(((hidden as { style_id: string }[]) || []).map((r) => r.style_id));
  return byFamily(styles.filter((s) => !off.has(s.id)));
}

/** Hide or restore a global cut for this shop. */
export async function setStyleEnabled(
  shopId: string | null,
  styleId: string,
  enabled: boolean
): Promise<void> {
  if (!isSupabaseConfigured() || !shopId) return;
  const sb = supabase();
  if (enabled) {
    await sb.from("shop_disabled_styles").delete().eq("shop_id", shopId).eq("style_id", styleId);
    return;
  }
  await sb
    .from("shop_disabled_styles")
    .upsert({ shop_id: shopId, style_id: styleId }, { onConflict: "shop_id,style_id" });
}

/** Create one of the shop's own cuts. Three ways in, and at least one of
    `hint` / `refImage` must be present — a cut with neither words nor a
    picture tells the compose step nothing (styles_describable enforces it). */
export async function createStyle(
  shop: Shop | null,
  style: {
    name: string;
    family: StyleFamily;
    hint: string;
    coverage: StyleCoverage;
    refImage: string | null;
  }
): Promise<Style> {
  if (!isSupabaseConfigured() || !shop?.id) {
    throw new Error("Custom cuts need Supabase mode");
  }
  if (!style.hint.trim() && !style.refImage) {
    throw new Error("Add a photo of the cut, or describe it in words.");
  }
  const sb = supabase();

  /* A fresh pick from the file input arrives as a data URL and needs storing.
     An already-stored image arrives as its public URL — the studio's "copy"
     mode opens prefilled from an existing cut and hands one straight back —
     and is reused as-is rather than duplicated in the bucket. */
  let refUrl: string | null = style.refImage;
  if (style.refImage?.startsWith("data:")) {
    const path = shop.id + "/style-" + crypto.randomUUID() + ".jpg";
    const { error: upErr } = await sb.storage
      .from("styles")
      .upload(path, dataURLToBlob(style.refImage), { contentType: "image/jpeg" });
    if (upErr) throw upErr;
    refUrl = sb.storage.from("styles").getPublicUrl(path).data.publicUrl;
  }

  const { data, error } = await sb
    .from("styles")
    .insert({
      shop_id: shop.id,
      family: style.family,
      name: style.name.trim(),
      prompt_hint: style.hint.trim(),
      coverage: style.coverage,
      ref_image_url: refUrl,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToStyle(data as StyleRow);
}

/** Edit one of the shop's own cuts.

    Global cuts are not editable and deliberately have no path here: the "own
    styles" policy makes `shop_id in (... where owner = auth.uid())` false for a
    null shop_id, so the update would silently affect zero rows. A vendor who
    wants a library cut changed takes a copy instead: the studio opens the cut
    form prefilled and saves it through createStyle as a new shop-owned cut.
    That is also the honest outcome — their version of the A-line kurtha is
    their cut, not an edit to every shop's.

    Changing hint, coverage or the reference photo bumps styles.revision via
    trigger, which is what makes existing renders of this cut read as stale. */
export async function updateStyle(
  shop: Shop | null,
  style: Style,
  previousRefImage: string | null
): Promise<Style> {
  if (!isSupabaseConfigured() || !shop?.id) {
    throw new Error("Custom cuts need Supabase mode");
  }
  if (style.shopId !== shop.id) {
    throw new Error("That's a library cut — take a copy to change it.");
  }
  if (!style.hint.trim() && !style.refImage) {
    throw new Error("Add a photo of the cut, or describe it in words.");
  }
  const sb = supabase();

  let refUrl = style.refImage;
  const photoChanged = !!style.refImage && style.refImage.startsWith("data:");
  if (photoChanged) {
    const path = shop.id + "/style-" + crypto.randomUUID() + ".jpg";
    const { error: upErr } = await sb.storage
      .from("styles")
      .upload(path, dataURLToBlob(style.refImage as string), { contentType: "image/jpeg" });
    if (upErr) throw upErr;
    refUrl = sb.storage.from("styles").getPublicUrl(path).data.publicUrl;
  }

  const { data, error } = await sb
    .from("styles")
    .update({
      name: style.name.trim(),
      prompt_hint: style.hint.trim(),
      coverage: style.coverage,
      ref_image_url: refUrl,
    })
    .eq("id", style.id)
    .select()
    .single();
  if (error) throw error;

  // Only once the row is safely updated — an orphaned old photo is cheap, a
  // missing current one is not.
  if (photoChanged && previousRefImage) {
    const oldPath = previousRefImage.split("/styles/")[1];
    if (oldPath) await sb.storage.from("styles").remove([decodeURIComponent(oldPath)]);
  }
  return rowToStyle(data as StyleRow);
}

/** Delete one of the shop's own cuts. Refused by the database (23503) once
    renders point at it — retire it instead, so existing renders keep meaning
    something. */
export async function removeStyle(styleId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase().from("styles").delete().eq("id", styleId);
  if (error) {
    throw error.code === "23503"
      ? new Error("This cut already has renders. Hide it instead of deleting it.")
      : error;
  }
}

/* ---------- compositions (fabric stitched into a cut) ---------- */

/* rendered_style_revision is part of this list because staleness needs it:
   without it every render loads with a null revision, and a cut edited after
   the fact never raises CUT CHANGED in the studio. */
const COMPOSITION_COLUMNS =
  "id, fabric_id, style_id, image_url, status, error_note, price_npr, published, note, rendered_note, rendered_style_revision";

export async function loadCompositions(shopId?: string | null): Promise<Composition[]> {
  if (!isSupabaseConfigured() || !shopId) return [];
  const { data, error } = await supabase()
    .from("compositions")
    .select(COMPOSITION_COLUMNS)
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });
  if (error) return []; // un-migrated project, or a transient read failure
  return ((data as CompositionRow[]) || []).map(rowToComposition);
}

/* A composition takes the cloth's name and the cut's, because that is how a
   shopper asks for it across the counter: "the blue one, in the A-line".
   Sizes are empty and stock is always true — this is cloth on a shelf plus a
   tailor, not a finished piece in one size that can sell out. */
function compositionToWearable(r: {
  id: string;
  price_npr: number | null;
  image_url: string;
  fabrics: { name: string; family: string };
  styles: { name: string };
}): Wearable {
  return {
    id: r.id,
    compositionId: r.id,
    itemCode: null,
    name: r.fabrics.name + " · " + r.styles.name,
    category: familyLabel(r.fabrics.family),
    price: r.price_npr ?? 0,
    image: r.image_url,
    sizes: [],
    inStock: true,
    tryonEnabled: true,
    stitchedToOrder: true,
  };
}

/** The published fabric x cut renders a shopper may browse and try on.
    Filtered explicitly rather than leaning on RLS: the "own compositions"
    policy hands a signed-in vendor their unpublished and failed rows too, and
    a vendor previewing their own kiosk has to see exactly what a shopper sees.
    A render still mid-flight, or one whose cloth has since been deleted, is
    dropped rather than shown as a broken tile. */
export async function loadPublishedCompositions(shopId?: string | null): Promise<Wearable[]> {
  if (!isSupabaseConfigured() || !shopId) return [];
  const { data, error } = await supabase()
    .from("compositions")
    .select("id, price_npr, image_url, fabrics (name, family), styles (name)")
    .eq("shop_id", shopId)
    .eq("kind", "fabric_style")
    .eq("published", true)
    .eq("status", "ready")
    .order("created_at", { ascending: false });
  if (error) return []; // un-migrated project, or a transient read failure
  return ((data as unknown as Parameters<typeof compositionToWearable>[0][]) || [])
    .filter((r) => r.image_url && r.fabrics && r.styles)
    .map(compositionToWearable);
}

/** Render this fabric in the given cuts. Vendor-authored and metered, so it
    goes through the server: the browser never holds the provider key, and the
    server resolves the fabric/style images itself rather than trusting URLs. */
export async function composeFabric(
  shopId: string | null,
  fabricId: string,
  styleIds: string[]
): Promise<{ styleId: string; status: string; error?: string }[]> {
  if (!isSupabaseConfigured() || !shopId) {
    throw new Error("Rendering needs Supabase mode");
  }
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const res = await fetch("/api/compose", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ shopId, fabricId, styleIds }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Could not render (" + res.status + ")");
  return json.results || [];
}

/* ---------- the counter (a cloth, a cut and a customer, in one pass) ---------- */

/** Stitch this cloth into this cut and put it on this person. Server-side for
    the same reasons compose is: provider keys stay off the browser and both
    meters are charged where they can't be skipped.

    The route streams NDJSON progress: a "stitched" event when the piece
    exists, then "done" (or an error event). `onStitched` fires on the first,
    so the panel can show the garment while the fitting still runs. Requests
    refused before the stream starts (validation, meters) still come back as
    plain JSON errors with a status code. */
export async function runCounter(
  shopId: string | null,
  input: CounterInput,
  onStitched?: (garmentUrl: string) => void
): Promise<CounterRun> {
  if (!isSupabaseConfigured() || !shopId) {
    throw new Error("The counter needs Supabase mode");
  }
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const res = await fetch("/api/counter", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ shopId, ...input }),
  });

  const streaming = (res.headers.get("content-type") || "").includes("ndjson");
  if (!res.ok || !streaming || !res.body) {
    const json = await res.json().catch(() => ({}));
    /* A failed try-on can still hand back the render the vendor paid for. Carry
       it on the error so the panel can show the piece beside the message. */
    const err = new Error(json?.error || "The counter couldn't finish (" + res.status + ")");
    (err as Error & { garmentUrl?: string }).garmentUrl = json?.garmentUrl;
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let stitchedUrl: string | undefined;
  let done: CounterRun | null = null;

  const handle = (line: string): void => {
    if (!line.trim()) return;
    let ev: any;
    try { ev = JSON.parse(line); } catch { return; }
    if (ev.error) {
      const err = new Error(ev.error);
      (err as Error & { garmentUrl?: string }).garmentUrl = ev.garmentUrl ?? stitchedUrl;
      throw err;
    }
    if (ev.stage === "stitched" && typeof ev.garmentUrl === "string") {
      stitchedUrl = ev.garmentUrl;
      onStitched?.(ev.garmentUrl);
    }
    if (ev.stage === "done") done = { garmentUrl: ev.garmentUrl, tryonUrl: ev.tryonUrl };
  };

  for (;;) {
    const { value, done: eof } = await reader.read();
    if (eof) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handle(line);
  }
  if (buffer.trim()) handle(buffer);

  if (!done) {
    /* The stream ended without a verdict — connection dropped mid-run. */
    const err = new Error("The counter couldn't finish — please try again.");
    (err as Error & { garmentUrl?: string }).garmentUrl = stitchedUrl;
    throw err;
  }
  return done;
}

/** Keep a counter run: the cloth becomes a fabric, the cut becomes one of the
    shop's own, and the render they already paid for becomes the composition
    joining them — unpublished and unpriced, exactly as the studio leaves one.
    Nothing is re-rendered; `garmentUrl` is already in the renders bucket. */
export async function saveCounterRun(
  shop: Shop | null,
  input: CounterInput,
  garmentUrl: string,
  names: { fabric: string; cut: string },
  existingFabricIds: string[]
): Promise<{ fabric: Fabric; style: Style; composition: Composition }> {
  if (!isSupabaseConfigured() || !shop?.id) {
    throw new Error("Keeping a counter run needs Supabase mode");
  }
  const fabric = await addFabric(
    shop,
    {
      name: names.fabric.trim(),
      family: input.family,
      image: input.fabricImage,
      price: 0,
      unit: "meter",
      composition: "",
      /* Left unset on purpose. The counter is a customer standing at the
         desk, not a cataloguing session, so it never asks for colours — and a
         colour read off the photo without the vendor confirming it is a guess
         wearing a fact's clothes. The fabric modal asks the next time this
         bolt is opened. */
      colorPrimary: "",
      colorSecondary: "",
      colorPrimaryHex: "",
      colorSecondaryHex: "",
      color: "",
      note: input.fabricNote.trim(),
      inStock: true,
    },
    existingFabricIds
  );
  const style = await createStyle(shop, {
    name: names.cut.trim(),
    family: input.family,
    hint: input.stylePrompt.trim(),
    coverage: input.coverage,
    refImage: input.styleImage,
  });

  const { data, error } = await supabase()
    .from("compositions")
    .insert({
      shop_id: shop.id,
      kind: "fabric_style",
      fabric_id: fabric.id,
      style_id: style.id,
      image_url: garmentUrl,
      status: "ready",
      /* The render was made from exactly this cut at exactly this revision and
         with no per-pairing note, so it reads as fresh rather than stale the
         moment it lands in the studio. */
      rendered_note: "",
      rendered_style_revision: style.revision,
    })
    .select(COMPOSITION_COLUMNS)
    .single();
  if (error) throw error;
  return { fabric, style, composition: rowToComposition(data as CompositionRow) };
}

export async function setCompositionPublished(id: string, published: boolean): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await supabase().from("compositions").update({ published }).eq("id", id);
}

export async function setCompositionPrice(id: string, price: number): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await supabase().from("compositions").update({ price_npr: price }).eq("id", id);
}

/** Note for this cloth-and-cut pairing. Only `note` moves — `rendered_note`
    stays where the last render left it, which is what makes the render read as
    stale until it's made again. */
export async function setCompositionNote(id: string, note: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await supabase().from("compositions").update({ note }).eq("id", id);
}

export async function removeComposition(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await supabase().from("compositions").delete().eq("id", id);
}

/* ---------- try-on history & analytics ---------- */

/** Local-mode only: server logs events itself when Supabase is configured. */
export function logLocalTryOn(garmentId: string, sessionId: string | null): void {
  if (isSupabaseConfigured()) return;
  try {
    const events = JSON.parse(lsGet("events:tryons") || "[]");
    events.push({ garmentId, sessionId, cached: false, createdAt: new Date().toISOString() });
    lsSet("events:tryons", JSON.stringify(events.slice(-5000)));
  } catch {}
}

/** Try-on events for the vendor's history/analytics view, newest last. */
export async function getTryOnEvents(
  shopId: string | null,
  sinceDays = 90
): Promise<TryOnEvent[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000).toISOString();
  if (!isSupabaseConfigured()) {
    try {
      const events: TryOnEvent[] = JSON.parse(lsGet("events:tryons") || "[]");
      return events.filter((e) => e.createdAt >= since);
    } catch {
      return [];
    }
  }
  if (!shopId) return [];
  const { data } = await supabase()
    .from("tryon_events")
    .select("garment_id, cached, session_id, created_at")
    .eq("shop_id", shopId)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(10000);
  return (
    (data as { garment_id: string | null; cached: boolean; session_id: string | null; created_at: string }[]) || []
  ).map((r) => ({
    garmentId: r.garment_id,
    cached: r.cached,
    sessionId: r.session_id,
    createdAt: r.created_at,
  }));
}

/* ---------- leads ("I'm interested") ---------- */

/** Called from the kiosk (shopper side). Supabase mode goes through /api/lead
    (service role insert); local mode writes to this browser's storage. */
export async function submitLead(
  shop: Shop,
  garment: Wearable,
  info: { name: string; phone: string; size: string }
): Promise<void> {
  return submitOrder(shop, [{ garment, size: info.size, qty: 1 }], {
    name: info.name,
    phone: info.phone,
    orderRef: null,
    kind: "order",
  });
}

export interface OrderLine {
  garment: Wearable;
  size: string;
  qty: number;
}

/** A storefront bag checkout: every line of one bag in a single request, all
    sharing an orderRef so the vendor's inbox shows them as one order. */
export async function submitOrder(
  shop: Shop,
  lines: OrderLine[],
  info: { name: string; phone: string; orderRef: string | null; kind: "order" | "enquiry" }
): Promise<void> {
  if (lines.length === 0) return;

  /* Exactly one id per line: a composition is not a row in garments, so
     sending its id as garmentId would fail the server's ownership check. */
  const items = lines.map((l) => ({
    garmentId: l.garment.compositionId ? null : l.garment.id,
    compositionId: l.garment.compositionId ?? null,
    size: l.size,
    qty: l.qty,
  }));

  if (!isSupabaseConfigured()) {
    const leads = JSON.parse(lsGet("leads") || "[]");
    const now = new Date().toISOString();
    for (const l of lines) {
      leads.unshift({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        garmentId: l.garment.id,
        name: info.name,
        phone: info.phone,
        size: l.size,
        orderRef: info.orderRef,
        qty: l.qty,
        /* Supabase mode takes this from the server's own row; there is no
           server here, but the price still has to be the one at order time. */
        unitPrice: l.garment.price,
        kind: info.kind,
        handled: false,
        createdAt: now,
      });
    }
    lsSet("leads", JSON.stringify(leads.slice(0, 500)));
    return;
  }

  /* Signed in → the order joins their history. The server verifies this token
     and stamps user_id from it; no token just means a guest order. */
  const token = await currentAccessToken();

  const res = await fetch("/api/lead", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify({
      shopId: shop.id,
      items,
      name: info.name,
      phone: info.phone,
      orderRef: info.orderRef,
      kind: info.kind,
    }),
  });
  if (!res.ok) throw new Error("Could not send — please tell the staff directly.");
}

export async function getLeads(shopId: string | null): Promise<Lead[]> {
  if (!isSupabaseConfigured()) {
    try {
      return (JSON.parse(lsGet("leads") || "[]") as any[]).map(normalizeLead);
    } catch {
      return [];
    }
  }
  if (!shopId) return [];
  /* select * rather than a column list: the order columns arrived in a later
     migration, and naming one that a not-yet-migrated project lacks would
     fail the whole query and empty the vendor's inbox. */
  const { data } = await supabase()
    .from("leads")
    .select("*")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(500);
  return ((data as any[]) || []).map((r) =>
    normalizeLead({ ...r, garmentId: r.garment_id, orderRef: r.order_ref, createdAt: r.created_at })
  );
}

/** Fills the order fields for rows written before they existed (and for
    local-mode leads), so the inbox can treat every lead the same way. */
function normalizeLead(r: any): Lead {
  return {
    id: r.id,
    garmentId: r.garmentId ?? null,
    name: r.name || "",
    phone: r.phone || "",
    size: r.size || "",
    orderRef: r.orderRef ?? null,
    qty: Number(r.qty) > 0 ? Number(r.qty) : 1,
    unitPrice: Number.isFinite(Number(r.unitPrice)) && r.unitPrice !== null ? Number(r.unitPrice) : null,
    kind: r.kind === "enquiry" ? "enquiry" : "order",
    handled: !!r.handled,
    createdAt: r.createdAt,
  };
}

/** The signed-in shopper's own orders, newest first. Empty when signed out —
    guest orders are deliberately unclaimable, since anyone could type a phone
    number and inherit a stranger's history. RLS ("own orders read") is what
    actually enforces this; the user_id filter is just to keep the query small. */
export async function getMyOrders(): Promise<OrderHistoryLine[]> {
  if (!isSupabaseConfigured()) return [];
  const uid = await currentUserId();
  if (!uid) return [];

  /* The shop and garment names are joined in rather than stored on the lead:
     a shopper's history should follow a shop's rename. Price is the exception —
     that one is snapshotted, so an old order keeps what it actually cost. */
  const { data } = await supabase()
    .from("leads")
    .select("id, order_ref, size, qty, unit_price, kind, handled, created_at, shops (name, slug), garments (name, image_url, price_npr)")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(200);

  return ((data as any[]) || []).map((r) => {
    const shop = Array.isArray(r.shops) ? r.shops[0] : r.shops;
    const garment = Array.isArray(r.garments) ? r.garments[0] : r.garments;
    return {
      id: r.id,
      orderRef: r.order_ref ?? null,
      shopName: shop?.name || "a shop",
      shopSlug: shop?.slug ?? null,
      garmentName: garment?.name || "a piece",
      image: garment?.image_url ?? null,
      size: r.size || "",
      qty: Number(r.qty) > 0 ? Number(r.qty) : 1,
      /* Pre-snapshot rows fall back to today's catalog price — the best guess
         available — rather than showing an order that cost nothing. */
      unitPrice: r.unit_price ?? garment?.price_npr ?? 0,
      kind: r.kind === "enquiry" ? "enquiry" : "order",
      handled: !!r.handled,
      createdAt: r.created_at,
    };
  });
}

export async function setLeadHandled(leadId: string, handled: boolean): Promise<void> {
  if (!isSupabaseConfigured()) {
    try {
      const leads: Lead[] = JSON.parse(lsGet("leads") || "[]");
      lsSet("leads", JSON.stringify(leads.map((l) => (l.id === leadId ? { ...l, handled } : l))));
    } catch {}
    return;
  }
  await supabase().from("leads").update({ handled }).eq("id", leadId);
}

/* ---------- plan & usage (Supabase mode only) ---------- */

function rowToPlan(r: any): PlanInfo {
  return {
    id: r.id,
    name: r.name,
    priceNpr: r.price_npr,
    tryonLimit: r.tryon_limit,
    studioLimit: r.studio_limit,
    maxGarments: r.max_garments ?? null,
    listedAllowed: r.listed_allowed ?? true,
    sort: r.sort ?? 0,
  };
}

/** All plans for the upgrade comparison, cheapest first. */
export async function getPlans(): Promise<PlanInfo[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await supabase().from("plans").select("*").order("sort", { ascending: true });
  return ((data as any[]) || []).map(rowToPlan);
}

/** The shop's current plan + this period's usage. Null in local mode. */
export async function getSubscription(shopId: string | null): Promise<Subscription | null> {
  if (!isSupabaseConfigured() || !shopId) return null;
  const { data } = await supabase()
    .from("shop_subscriptions")
    .select(
      "plan_id, status, period_end, tryons_used, studio_used, plans(id, name, price_npr, tryon_limit, studio_limit, max_garments, listed_allowed, sort)"
    )
    .eq("shop_id", shopId)
    .maybeSingle();
  if (!data) return null;
  const d = data as any;
  const plan = Array.isArray(d.plans) ? d.plans[0] : d.plans;
  if (!plan) return null;
  return {
    planId: d.plan_id,
    status: d.status,
    periodEnd: d.period_end,
    tryonsUsed: d.tryons_used ?? 0,
    studioUsed: d.studio_used ?? 0,
    plan: rowToPlan(plan),
  };
}

/* ---------- error logs (vendor debugging view) ---------- */

export async function getErrorLogs(shopId: string | null): Promise<ErrorLog[]> {
  if (!isSupabaseConfigured() || !shopId) return [];
  const { data } = await supabase()
    .from("error_logs")
    .select("id, source, message, created_at")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(50);
  return ((data as any[]) || []).map((r) => ({
    id: r.id,
    source: r.source,
    message: r.message,
    createdAt: r.created_at,
  }));
}
