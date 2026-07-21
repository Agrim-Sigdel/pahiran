/* Shared domain types. The storage adapter maps DB rows (snake_case)
   to these app-facing shapes, so components never see raw rows. */

/* Admin approval state. Only 'approved' shops can add catalog items, run
   try-ons, or be read by the public — see 20260721000100_admin_console.sql.
   Local (no-Supabase) mode has no admin, so it treats every shop as approved. */
export type ShopStatus = "pending" | "approved" | "rejected" | "suspended";

export interface Shop {
  id: string | null; // null until persisted (localStorage mode has no id)
  slug: string | null; // pahiran.app/k/{slug}; null in localStorage mode
  vendorCode: string | null; // immutable 4-char tag prefix; null in localStorage mode
  name: string;
  area: string;
  whatsapp: string; // digits for wa.me links; "" = no order button
  listed: boolean; // opt-in: show on the landing page directory
  status: ShopStatus; // admin approval gate; 'approved' in local mode
  statusNote: string | null; // admin's reason, shown to the vendor on reject/suspend
  lat: number | null; // OSM map pin; null = not placed yet
  lng: number | null;
}

export interface Garment {
  id: string;
  itemCode: string | null; // "{vendorCode}-0001", printed on tags; null in localStorage mode
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

export interface PlanInfo {
  id: string;
  name: string;
  priceNpr: number;
  tryonLimit: number;
  studioLimit: number;
  maxGarments: number | null;
  listedAllowed: boolean;
  sort: number;
}

export interface Subscription {
  planId: string;
  status: string; // active | past_due | canceled
  periodEnd: string; // ISO
  tryonsUsed: number;
  studioUsed: number;
  plan: PlanInfo;
}

/* Raw Supabase rows */
export interface ShopRow {
  id: string;
  owner: string;
  slug: string;
  vendor_code: string | null;
  name: string;
  area: string | null;
  whatsapp: string | null;
  listed: boolean | null;
  status: string | null; // absent until 20260721000100_admin_console.sql is applied
  status_note: string | null;
  lat: number | null;
  lng: number | null;
}

export interface GarmentRow {
  id: string;
  shop_id: string;
  item_code: string | null;
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
    itemCode: r.item_code ?? null,
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
