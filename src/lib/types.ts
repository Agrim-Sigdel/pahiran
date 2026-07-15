/* Shared domain types. The storage adapter maps DB rows (snake_case)
   to these app-facing shapes, so components never see raw rows. */

export interface Shop {
  id: string | null; // null until persisted (localStorage mode has no id)
  slug: string | null; // pahiran.app/k/{slug}; null in localStorage mode
  name: string;
  area: string;
  whatsapp: string; // digits for wa.me links; "" = no order button
  listed: boolean; // opt-in: show on the landing page directory
  lat: number | null; // OSM map pin; null = not placed yet
  lng: number | null;
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

export interface TryOnEvent {
  garmentId: string | null;
  cached: boolean;
  sessionId: string | null;
  createdAt: string; // ISO timestamp
}

export interface Lead {
  id: string;
  garmentId: string | null;
  name: string;
  phone: string;
  size: string;
  handled: boolean;
  createdAt: string;
}

export interface ErrorLog {
  id: string;
  source: string;
  message: string;
  createdAt: string;
}

/* Raw Supabase rows */
export interface ShopRow {
  id: string;
  owner: string;
  slug: string;
  name: string;
  area: string | null;
  whatsapp: string | null;
  listed: boolean | null;
  lat: number | null;
  lng: number | null;
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
