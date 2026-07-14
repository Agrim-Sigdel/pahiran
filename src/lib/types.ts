/* Shared domain types. The storage adapter maps DB rows (snake_case)
   to these app-facing shapes, so components never see raw rows. */

export interface Shop {
  id: string | null; // null until persisted (localStorage mode has no id)
  slug: string | null; // pahiran.app/k/{slug}; null in localStorage mode
  name: string;
  area: string;
}

export interface Garment {
  id: string;
  name: string;
  category: string;
  price: number; // NPR
  image: string; // data URL (local mode) or public storage URL (Supabase mode)
  sizes: string[]; // e.g. ["S", "M", "L"]; empty = free size / unspecified
  inStock: boolean;
  tryonEnabled: boolean;
  stitchedToOrder: boolean;
}

export interface TryOnStat {
  garmentId: string;
  count: number;
}

/* Raw Supabase rows */
export interface ShopRow {
  id: string;
  owner: string;
  slug: string;
  name: string;
  area: string | null;
}

export interface GarmentRow {
  id: string;
  shop_id: string;
  name: string;
  category: string;
  price_npr: number;
  image_url: string;
  sizes: string[] | null;
  in_stock: boolean;
  tryon_enabled: boolean;
  stitched_to_order: boolean;
}

export function rowToGarment(r: GarmentRow): Garment {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    price: r.price_npr,
    image: r.image_url,
    sizes: r.sizes ?? [],
    inStock: r.in_stock,
    tryonEnabled: r.tryon_enabled,
    stitchedToOrder: r.stitched_to_order,
  };
}
