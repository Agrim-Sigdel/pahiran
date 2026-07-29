/* Shared domain types. The storage adapter maps DB rows (snake_case)
   to these app-facing shapes, so components never see raw rows. */

import { colorText } from "@/lib/constants";

/* Admin approval state. Only 'approved' shops can add catalog items, run
   try-ons, or be read by the public — see 20260721000100_admin_console.sql.
   Local (no-Supabase) mode has no admin, so it treats every shop as approved. */
export type ShopStatus = "pending" | "approved" | "rejected" | "suspended";

/* What the shop sells, which decides whether try-on applies at all. 'general'
   shops (electronics, grocery, hardware…) use peeq as a catalog + kiosk + QR
   tags and never see try-on UI. Separate from the credit balance: a general
   shop has no try-on entitlement to spend in the first place. */
export type ShopType = "apparel" | "general";

/* What the shop sells — descriptive, and the source of the default ShopType at
   signup (see SHOP_CATEGORIES in constants.ts). Kept separate from `type` so an
   admin can grant or revoke try-on without rewriting what the shop is. */
export type ShopCategory =
  | "clothing" | "footwear" | "jewellery" | "beauty" | "electronics"
  | "home" | "grocery" | "sports" | "books" | "other";

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
  type: ShopType; // 'general' shops get the catalog without try-on
  category: ShopCategory; // what they sell; sets `type` at signup
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

/* Made-to-order. A fabric is a listing the shopper browses; a style is a cut it
   can be stitched into. The rendered fabric x style variant arrives with the
   compose pipeline — see 20260726000100_fabrics_styles.sql. */

/* The taxonomy that pairs a fabric with the cuts it can become. Kept separate
   from the garment CATEGORIES list: categories describe a finished piece on a
   rack, families describe what a bolt of cloth can be turned into. */
export type StyleFamily =
  | "suit" | "lehenga" | "kurtha" | "daura-suruwal" | "sari-blouse" | "sherwani";

/** How a fabric is priced — per running meter, per single piece, or per set. */
export type FabricUnit = "meter" | "piece" | "set";

export interface Fabric {
  id: string;
  itemCode: string | null; // printed on the bolt tag; null in localStorage mode
  name: string;
  family: StyleFamily;
  image: string; // data URL (local mode) or public storage URL (Supabase mode)
  price: number; // NPR, per `unit`
  unit: FabricUnit;
  composition: string; // "wool 120s", "banarasi silk"; "" = unspecified
  /* The two colours the shop would name this bolt by. Palette ids from
     FABRIC_COLORS, or the vendor's own text when the palette had no word for
     it; "" = not set. Secondary is the border, motif or contrast — most solid
     cloths have none. */
  colorPrimary: string;
  colorSecondary: string;
  /* The exact shade behind each word, picked off the photo or dialled in.
     Display only — two bolts both correctly called maroon are not the same
     maroon. "" when never set; fall back to the palette's swatch. */
  colorPrimaryHex: string;
  colorSecondaryHex: string;
  /** Derived: "Navy · Gold". What cards and counter search read. */
  color: string;
  /* What the shop knows about this cloth that a photo doesn't show — the
     pattern, where a border falls, how heavily it drapes. Feeds the compose
     prompt. */
  note: string;
  inStock: boolean;
}

/* A fabric stitched into one cut: a product nobody photographed. Authored by
   the vendor, so every combination a shopper sees is one the tailor agreed to
   make. `published` is the vendor's review gate. */
export type CompositionStatus = "pending" | "ready" | "failed";

export interface Composition {
  id: string;
  fabricId: string | null;
  styleId: string | null;
  image: string | null; // null until status is "ready"
  status: CompositionStatus;
  errorNote: string | null;
  price: number; // NPR
  published: boolean;
  /* A note true of this pairing only — the cloth's own note and the cut's
     wording cover everything else. renderedNote is what the current image was
     actually made from, so the two differing is exactly what "stale" means. */
  note: string;
  renderedNote: string;
  /* Which revision of the cut produced this image. Null on renders made before
     revisions existed — unknowable, not stale. */
  renderedStyleRevision: number | null;
}

/** Why a render no longer matches what the shop is offering, or null if it
    still does. The two inputs a vendor can change after the fact are the
    pairing's note and the cut itself; everything else means a new render. */
export function staleReason(
  c: Composition,
  style?: Style | null
): "note" | "cut" | null {
  if (c.status !== "ready") return null;
  if (c.note.trim() !== c.renderedNote.trim()) return "note";
  if (style && c.renderedStyleRevision !== null && style.revision !== c.renderedStyleRevision) {
    return "cut";
  }
  return null;
}

/* What the kiosk can put on a shopper. To the try-on step a photographed
   garment and a rendered fabric x cut are the same thing — an image of a piece
   of clothing — so the rail, the stage and the cart all take this one shape
   and stay unaware of the difference.

   Only the writes care. garment_id and composition_id are separate foreign
   keys (see 20260726000400), and exactly one of them is set: compositionId is
   present precisely when this wearable came from a composition. */
export interface Wearable extends Garment {
  compositionId?: string | null;
}

/* Which pieces the cut actually makes. Read twice: the compose prompt turns it
   into an instruction, and try-on turns it into a placement category. A note
   cannot do the second job, which is why this is an enum and not wording. */
export type StyleCoverage = "top" | "bottom" | "set";

export interface Style {
  id: string;
  shopId: string | null; // null = platform-global, available to every shop
  family: StyleFamily;
  name: string;
  hint: string; // the cut in words — what the compose step reads
  coverage: StyleCoverage;
  refImage: string | null; // optional reference photo; sharpens the hint
  active: boolean;
  sort: number;
  /* Bumped by the database whenever a compose-relevant field changes, so a
     render can tell whether the cut has moved on since it was made. */
  revision: number;
}

/* Coverage → what try-on is being asked to place. Families can't answer this:
   a suit and a blazer share one, and mean different halves of a body. */
export const coverageCategory = (c: StyleCoverage): string =>
  c === "top" ? "tops" : c === "bottom" ? "bottoms" : "one-pieces";

export const COVERAGES: { id: StyleCoverage; label: string; note: string }[] = [
  { id: "top", label: "Top only", note: "kurtha, blouse, blazer — nothing below the waist" },
  { id: "bottom", label: "Bottom only", note: "suruwal, churidar, skirt — nothing above" },
  { id: "set", label: "Full set", note: "both pieces, cut from this same cloth" },
];

/* ── the counter ──
   A cloth, a cut and a customer that are not catalog rows yet. The made-to-
   order flow above is authoring: list the bolt, define the cut, render ahead
   of demand. This is the tailor's other case — someone is holding a bolt off
   the shelf and wants to see it on themselves now — so every field here is an
   image or a sentence the vendor just produced, and none of it is persisted
   unless they choose to keep the run. */
export interface CounterInput {
  family: StyleFamily;
  coverage: StyleCoverage;
  fabricImage: string; // data URL — the bolt, photographed just now
  fabricNote: string;
  styleImage: string | null; // data URL, or null when the words carry the cut
  stylePrompt: string;
  personImage: string; // data URL — the customer standing there
}

export interface CounterRun {
  garmentUrl: string; // the stitched piece, with nobody in it
  tryonUrl: string; // the customer wearing it — private, signed, ~1h
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
  /** Lines of one bag checkout share this; null for a lone kiosk lead. */
  orderRef: string | null;
  qty: number;
  /** Price per piece when it was ordered. Null on rows written before order
      snapshots existed — read it through leadUnitPrice(), never raw. */
  unitPrice: number | null;
  /** "enquiry" also opened WhatsApp, so the shopper may message first. */
  kind: "order" | "enquiry";
  handled: boolean;
  createdAt: string;
}

/** One line of a shopper's own order history, denormalised at read time so it
    survives the shop editing or deleting the piece afterwards. */
export interface OrderHistoryLine {
  id: string;
  orderRef: string | null;
  shopName: string;
  shopSlug: string | null;
  garmentName: string;
  image: string | null;
  size: string;
  qty: number;
  unitPrice: number;
  kind: "order" | "enquiry";
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
  type: string | null; // absent until 20260721000300_shop_type.sql is applied
  category: string | null; // absent until 20260721000500_shop_category.sql is applied
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

export interface FabricRow {
  id: string;
  shop_id: string;
  item_code: string | null;
  name: string;
  family: string;
  image_url: string;
  price_npr: number;
  unit: string | null;
  composition: string | null;
  color: string | null;
  color_primary: string | null;
  color_secondary: string | null;
  color_primary_hex: string | null;
  color_secondary_hex: string | null;
  note: string | null;
  in_stock: boolean;
}

export interface CompositionRow {
  id: string;
  fabric_id: string | null;
  style_id: string | null;
  image_url: string | null;
  status: string;
  error_note: string | null;
  price_npr: number;
  published: boolean;
  note: string | null;
  rendered_note: string | null;
  rendered_style_revision: number | null;
}

export function rowToComposition(r: CompositionRow): Composition {
  return {
    id: r.id,
    fabricId: r.fabric_id ?? null,
    styleId: r.style_id ?? null,
    image: r.image_url ?? null,
    status: (r.status as CompositionStatus) ?? "pending",
    errorNote: r.error_note ?? null,
    price: r.price_npr ?? 0,
    published: r.published ?? false,
    note: r.note ?? "",
    renderedNote: r.rendered_note ?? "",
    renderedStyleRevision: r.rendered_style_revision ?? null,
  };
}

export interface StyleRow {
  id: string;
  shop_id: string | null;
  family: string;
  name: string;
  prompt_hint: string;
  coverage: string | null;
  ref_image_url: string | null;
  active: boolean | null;
  sort: number | null;
  revision: number | null;
}

export function rowToFabric(r: FabricRow): Fabric {
  const primary = r.color_primary ?? "";
  const secondary = r.color_secondary ?? "";
  return {
    id: r.id,
    itemCode: r.item_code ?? null,
    name: r.name,
    family: r.family as StyleFamily,
    image: r.image_url,
    price: r.price_npr,
    unit: (r.unit as FabricUnit) ?? "meter",
    composition: r.composition ?? "",
    colorPrimary: primary,
    colorSecondary: secondary,
    colorPrimaryHex: r.color_primary_hex ?? "",
    colorSecondaryHex: r.color_secondary_hex ?? "",
    /* The stored join is authoritative once the slots are set; the old
       free-text column carries rows written before 20260729000100 and rows the
       backfill left alone. */
    color: colorText(primary, secondary) || (r.color ?? ""),
    note: r.note ?? "",
    inStock: r.in_stock,
  };
}

export function rowToStyle(r: StyleRow): Style {
  return {
    id: r.id,
    shopId: r.shop_id ?? null,
    family: r.family as StyleFamily,
    name: r.name,
    hint: r.prompt_hint,
    coverage: (r.coverage as StyleCoverage) ?? "set",
    refImage: r.ref_image_url ?? null,
    active: r.active ?? true,
    sort: r.sort ?? 0,
    revision: r.revision ?? 1,
  };
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
